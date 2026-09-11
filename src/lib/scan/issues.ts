import type { FailReason, ScanResult } from './classify';

export type IssueKind = 'broken' | 'redirected' | 'pending';

export interface Issue<B> {
  bookmark: B;
  result: ScanResult;
}

export const FAIL_REASON_LABEL: Record<FailReason, string> = {
  not_found: '页面不存在',
  dns: '域名无法解析',
  cert: '证书错误',
  timeout: '超时',
  connection: '连接失败',
  maybe_vpn: '可能需要 VPN',
  too_many_redirects: '无限跳转',
  moved_to_home: '跳到了首页，页面可能已删除',
  need_login: '需要登录',
  rate_limited: '被限流',
  server_error: '网站暂时故障',
  http_error: '请求被拒绝',
  site_unreachable: '整个网站当前无法访问',
};

const matches = (kind: IssueKind, r: ScanResult) =>
  kind === 'pending' ? r.health === 'suspicious' || r.health === 'unknown' : r.health === kind;

/** 按书签列出某类问题（同一网址的多个书签各算一条），已忽略的单独列出。 */
export function collectIssues<B extends { url: string }>(
  bookmarks: B[],
  results: Map<string, ScanResult>,
  ignored: Set<string>,
  kind: IssueKind,
): { active: Issue<B>[]; ignored: Issue<B>[] } {
  const active: Issue<B>[] = [];
  const ignoredIssues: Issue<B>[] = [];
  for (const bookmark of bookmarks) {
    const result = results.get(bookmark.url);
    if (!result || !matches(kind, result)) continue;
    (ignored.has(bookmark.url) ? ignoredIssues : active).push({ bookmark, result });
  }
  return { active, ignored: ignoredIssues };
}
