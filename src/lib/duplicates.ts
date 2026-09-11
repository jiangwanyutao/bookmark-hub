import type { Bookmark } from './bookmarks';

export type DuplicateTier = 'exact' | 'normalized' | 'suspect';

export interface DuplicateGroup {
  key: string;
  tier: DuplicateTier;
  /** 按添加时间从早到晚 */
  bookmarks: Bookmark[];
  /** 分布在不同目录，用户可能是有意为之 */
  crossFolder: boolean;
  /** 可以默认保留的那条；跨目录或疑似重复时为 null，需用户逐组选择 */
  defaultKeepId: string | null;
}

const TRACKING_PARAMS = new Set(['fbclid', 'gclid', 'msclkid', 'mc_cid', 'mc_eid', 'spm']);
const isTrackingParam = (name: string) => name.startsWith('utm_') || TRACKING_PARAMS.has(name);
// #/route、#!/ 是单页应用路由，不同就是不同页面
const isSpaRoute = (hash: string) => hash.startsWith('#/') || hash.startsWith('#!');

function parseWebUrl(url: string): URL | null {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
}

/**
 * 规范化网址：URL 解析本身已把 scheme / host 转小写并去掉默认端口；
 * 这里再统一为 https、去掉跟踪参数、参数按名称排序、去掉末尾斜杠（根路径除外）。
 * # 片段原样保留。非 http(s) 链接原样返回。
 */
export function normalizeUrl(url: string): string {
  const u = parseWebUrl(url);
  if (!u) return url;

  u.protocol = 'https:';
  const params = [...u.searchParams]
    .filter(([name]) => !isTrackingParam(name))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  u.search = new URLSearchParams(params).toString();
  if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, '');
  return u.toString();
}

/** 再宽松一档：忽略 www. 和普通锚点，用于找疑似重复。 */
function looseKey(url: string): string {
  const u = parseWebUrl(normalizeUrl(url));
  if (!u) return url;
  u.hostname = u.hostname.replace(/^www\./, '');
  if (!isSpaRoute(u.hash)) u.hash = '';
  return u.toString();
}

function toGroup(key: string, members: Bookmark[]): DuplicateGroup {
  const bookmarks = [...members].sort((a, b) => (a.dateAdded ?? 0) - (b.dateAdded ?? 0));
  const firstUrl = bookmarks[0]!.url;
  const tier: DuplicateTier = bookmarks.every((b) => b.url === firstUrl)
    ? 'exact'
    : new Set(bookmarks.map((b) => normalizeUrl(b.url))).size === 1
      ? 'normalized'
      : 'suspect';
  const crossFolder = new Set(bookmarks.map((b) => b.ancestorIds.at(-1))).size > 1;
  const defaultKeepId = tier !== 'suspect' && !crossFolder ? bookmarks[0]!.id : null;
  return { key, tier, bookmarks, crossFolder, defaultKeepId };
}

/** 找出重复书签分组（只看网页书签），大组在前。 */
export function findDuplicateGroups(bookmarks: Bookmark[]): DuplicateGroup[] {
  const byKey = new Map<string, Bookmark[]>();
  for (const b of bookmarks) {
    if (!b.domain) continue;
    const key = looseKey(b.url);
    const list = byKey.get(key);
    if (list) list.push(b);
    else byKey.set(key, [b]);
  }
  return [...byKey]
    .filter(([, members]) => members.length > 1)
    .map(([key, members]) => toGroup(key, members))
    .sort((a, b) => b.bookmarks.length - a.bookmarks.length || a.key.localeCompare(b.key));
}

/** 每组保留 1 条，其余都算多余。 */
export const redundantCount = (groups: DuplicateGroup[]) =>
  groups.reduce((sum, g) => sum + g.bookmarks.length - 1, 0);
