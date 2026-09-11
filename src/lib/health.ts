import { PATH_SEPARATOR, type Bookmark, type TreeNode } from './bookmarks';

export interface HealthInput {
  total: number;
  broken: number;
  /** 重复书签中可删的多余条数 */
  redundant: number;
  redirected: number;
  uncategorized: number;
}

// PRD §11：扣分 = 2×失效% + 1×重复% + 0.5×重定向% + 0.25×未分类%（权重待产品确认）
const WEIGHTS = { broken: 2, redundant: 1, redirected: 0.5, uncategorized: 0.25 };

/** 名为这些的目录视为「没分类」的收纳箱。 */
export const CATCH_ALL_FOLDERS = new Set(['未分类', '其他', '临时', '收藏']);

export function healthScore({ total, broken, redundant, redirected, uncategorized }: HealthInput): number {
  if (total === 0) return 100;
  const pct = (n: number) => (n / total) * 100;
  const penalty =
    WEIGHTS.broken * pct(broken) +
    WEIGHTS.redundant * pct(redundant) +
    WEIGHTS.redirected * pct(redirected) +
    WEIGHTS.uncategorized * pct(uncategorized);
  return Math.max(0, Math.round(100 - penalty));
}

/** 浏览器内置目录中的第一个是书签栏。 */
export const bookmarksBarId = (roots: TreeNode[]) => roots[0]?.children?.[0]?.id ?? '';

/**
 * 未分类：书签栏以外的内置目录下的零散书签，以及任意层级位于收纳箱目录中的书签。
 * 书签栏根目录是常用入口，不算。
 */
export function isUncategorized(bookmark: Bookmark, barId: string): boolean {
  const [, builtinId] = bookmark.ancestorIds;
  if (bookmark.ancestorIds.length === 2 && builtinId !== barId) return true;
  // ponytail: 目录名本身含 " / " 时拆分会错，罕见；需要时给 Bookmark 加 ancestorTitles
  return bookmark.folderPath.split(PATH_SEPARATOR).some((title) => CATCH_ALL_FOLDERS.has(title));
}
