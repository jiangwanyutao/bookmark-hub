export type NetworkMode = 'normal' | 'restricted';

export type Health = 'healthy' | 'redirected' | 'broken' | 'suspicious' | 'unknown';

export type FailReason =
  | 'not_found'
  | 'dns'
  | 'cert'
  | 'timeout'
  | 'connection'
  | 'maybe_vpn'
  | 'too_many_redirects'
  | 'moved_to_home'
  | 'need_login'
  | 'rate_limited'
  | 'server_error'
  | 'http_error'
  | 'site_unreachable';

/** 一次检测看到的事实：有响应就有 status，否则是网络层错误或超时。 */
export interface Observation {
  requestedUrl: string;
  status?: number;
  finalUrl?: string;
  /** 跳转链上每一跳的状态码，来自 webRequest.onBeforeRedirect */
  redirectStatuses: number[];
  /** Chrome 网络错误码，如 net::ERR_NAME_NOT_RESOLVED */
  netError?: string;
  timedOut?: boolean;
}

export interface Verdict {
  health: Health;
  failReason: FailReason | null;
  /** 仅永久跳转时给出，作为「更新 URL」的建议 */
  redirectTo: string | null;
}

export interface ScanResult extends Verdict {
  url: string;
  httpStatus: number | null;
  netError: string | null;
  networkMode: NetworkMode;
  checkedAt: number;
}

const NETWORK_FAIL_REASONS = new Set<FailReason>(['dns', 'cert', 'timeout', 'connection', 'maybe_vpn']);
const PERMANENT_REDIRECTS = new Set([301, 308]);
const LOGIN_PATH = /\/(login|log-in|signin|sign-in|sso|auth|passport)(\/|$)/i;
const LOGIN_HOST = /^(login|passport|sso|auth|accounts?)\./i;
const AGGREGATE_MIN_URLS = 3;

export const isNetworkFailure = (r: { failReason: FailReason | null }) =>
  r.failReason !== null && NETWORK_FAIL_REASONS.has(r.failReason);

const verdict = (health: Health, failReason: FailReason | null = null, redirectTo: string | null = null): Verdict => ({
  health,
  failReason,
  redirectTo,
});

function isLoginUrl(url: string) {
  try {
    const u = new URL(url);
    return LOGIN_HOST.test(u.hostname) || LOGIN_PATH.test(u.pathname);
  } catch {
    return false;
  }
}

function movedToHome(requestedUrl: string, finalUrl: string) {
  try {
    return new URL(requestedUrl).pathname.length > 1 && new URL(finalUrl).pathname === '/';
  } catch {
    return false;
  }
}

export interface ClassifyOptions {
  /** 用户标记过「需要 VPN」的网站 */
  vpnHost?: boolean;
}

// 网络受限（境外不通）或网站被标记为需要 VPN 时，网络层错误不判失效，交给用户连上 VPN 后重新检测
function classifyNetworkError(obs: Observation, mode: NetworkMode, vpnHost: boolean): Verdict {
  if (mode === 'restricted' || vpnHost) return verdict('unknown', 'maybe_vpn');
  if (obs.netError === 'net::ERR_NAME_NOT_RESOLVED') return verdict('broken', 'dns');
  if (obs.netError?.startsWith('net::ERR_CERT_')) return verdict('suspicious', 'cert');
  if (obs.timedOut) return verdict('unknown', 'timeout');
  return verdict('unknown', 'connection');
}

function classifyResponse(obs: Observation, status: number): Verdict {
  const redirected = obs.redirectStatuses.length > 0;
  if (redirected && obs.finalUrl && isLoginUrl(obs.finalUrl)) return verdict('unknown', 'need_login');
  if (status === 404 || status === 410) return verdict('broken', 'not_found');
  if (status === 401 || status === 403) return verdict('unknown', 'need_login');
  if (status === 429) return verdict('unknown', 'rate_limited');
  if (status >= 500) return verdict('unknown', 'server_error');
  if (status < 200 || status >= 300) return verdict('unknown', 'http_error');

  // 只有整条跳转链都是 301 / 308 才建议更新；302 / 307 多为临时跳转
  const permanent = redirected && obs.redirectStatuses.every((s) => PERMANENT_REDIRECTS.has(s));
  if (!permanent || !obs.finalUrl) return verdict('healthy');
  if (movedToHome(obs.requestedUrl, obs.finalUrl)) return verdict('suspicious', 'moved_to_home');
  return verdict('redirected', null, obs.finalUrl);
}

/** 按 PRD §13 判定表把一次检测结果归类。 */
export function classify(obs: Observation, mode: NetworkMode, { vpnHost = false }: ClassifyOptions = {}): Verdict {
  if (obs.netError === 'net::ERR_TOO_MANY_REDIRECTS') return verdict('suspicious', 'too_many_redirects');
  if (obs.status === undefined) return classifyNetworkError(obs, mode, vpnHost);
  return classifyResponse(obs, obs.status);
}

export const hostOf = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

/**
 * 同一网站 3 条及以上网址全部是网络层错误时，多半是这个网站在当前网络下访问不了
 * （被屏蔽、公司内网），整组改为待确认，不逐条判失效。只返回有变化的结果。
 */
export function aggregateByHost(results: ScanResult[]): ScanResult[] {
  const byHost = new Map<string, ScanResult[]>();
  for (const r of results) {
    const host = hostOf(r.url);
    const list = byHost.get(host);
    if (list) list.push(r);
    else byHost.set(host, [r]);
  }
  return [...byHost.values()]
    .filter((list) => list.length >= AGGREGATE_MIN_URLS && list.every(isNetworkFailure))
    .flatMap((list) => list.filter((r) => r.health !== 'unknown'))
    .map((r) => ({ ...r, health: 'unknown' as const, failReason: 'site_unreachable' as const }));
}
