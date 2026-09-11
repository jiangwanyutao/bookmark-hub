export type SkipReason = 'non_web' | 'intranet' | 'sensitive';

/** 带这些参数的链接可能是一次性登录 / 退订链接，请求一次就会失效；AI 隐私过滤也用这张表。 */
export const SENSITIVE_PARAMS = new Set([
  'token',
  'access_token',
  'refresh_token',
  'session',
  'session_id',
  'sid',
  'api_key',
  'key',
  'auth',
  'authorization',
  'code',
  'password',
  'signature',
  'sig',
]);

const INTRANET_SUFFIX = /\.(local|internal|lan|corp|home\.arpa)$/;
const IPV4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/;

/** 本机、私有网段、内网域名后缀、不含点的主机名（如 http://jira/）都算内网。 */
export function isIntranetHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || INTRANET_SUFFIX.test(host)) return true;
  if (host.includes(':')) return host === '::1' || /^f[cd]/.test(host) || /^fe[89ab]/.test(host);

  const ip = IPV4.exec(host);
  if (ip) {
    const a = Number(ip[1]);
    const b = Number(ip[2]);
    return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  return !host.includes('.');
}

/** 扫描时不发请求的原因；可以扫描时返回 null。 */
export function skipReason(url: string): SkipReason | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return 'non_web';
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'non_web';
  if (isIntranetHost(u.hostname)) return 'intranet';
  for (const name of u.searchParams.keys()) {
    if (SENSITIVE_PARAMS.has(name.toLowerCase())) return 'sensitive';
  }
  return null;
}
