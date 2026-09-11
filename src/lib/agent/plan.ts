export const CATEGORY_SEPARATOR = ' / ';
export const MAX_CATEGORY_DEPTH = 3;
export const MAX_CATEGORY_NAME = 30;
export const MAX_CATEGORIES = 30;

export interface PlanScope {
  /** 要整理的目录（含子目录） */
  folderIds: string[];
  /** 新分类体系建在这个目录下 */
  rootFolderId: string;
}

/** 整理方案：不可变，每个函数返回新对象。 */
export interface OrganizePlan {
  scope: PlanScope | null;
  categories: string[];
  /** 书签 id → 分类路径 */
  assignments: Readonly<Record<string, string>>;
}

export const emptyPlan = (): OrganizePlan => ({ scope: null, categories: [], assignments: {} });

export function normalizeCategory(path: string): string {
  const parts = path.split('/').map((part) => part.trim());
  if (parts.some((part) => part.length === 0)) throw new Error(`分类名称不能为空`);
  if (parts.length > MAX_CATEGORY_DEPTH) throw new Error(`最多 ${MAX_CATEGORY_DEPTH} 层`);
  const tooLong = parts.find((part) => part.length > MAX_CATEGORY_NAME);
  if (tooLong) throw new Error(`不超过 ${MAX_CATEGORY_NAME} 个字`);
  return parts.join(CATEGORY_SEPARATOR);
}

export function setScope(plan: OrganizePlan, scope: PlanScope, knownFolderIds: Set<string>): OrganizePlan {
  if (scope.folderIds.length === 0) throw new Error('至少选择一个目录');
  const unknown = [...scope.folderIds, scope.rootFolderId].find((id) => !knownFolderIds.has(id));
  if (unknown) throw new Error(`目录不存在：${unknown}`);
  return { ...plan, scope: { folderIds: [...scope.folderIds], rootFolderId: scope.rootFolderId }, assignments: {} };
}

export function proposeTaxonomy(plan: OrganizePlan, categories: string[]): OrganizePlan {
  const normalized = [...new Set(categories.map(normalizeCategory))];
  if (normalized.length === 0) throw new Error('至少需要一个分类');
  if (normalized.length > MAX_CATEGORIES) throw new Error(`最多 ${MAX_CATEGORIES} 个分类`);
  const kept = Object.fromEntries(Object.entries(plan.assignments).filter(([, category]) => normalized.includes(category)));
  return { ...plan, categories: normalized, assignments: kept };
}

export function assignBookmarks(
  plan: OrganizePlan,
  bookmarkIds: string[],
  category: string,
  inScope: (id: string) => boolean,
): OrganizePlan {
  if (!plan.scope) throw new Error('请先确认整理范围');
  const target = normalizeCategory(category);
  if (!plan.categories.includes(target)) {
    throw new Error(`分类「${target}」不在当前体系中`);
  }
  const outside = bookmarkIds.filter((id) => !inScope(id));
  if (outside.length > 0) throw new Error(`${outside.length} 个书签不在整理范围内`);
  return { ...plan, assignments: { ...plan.assignments, ...Object.fromEntries(bookmarkIds.map((id) => [id, target])) } };
}

export function summarizePlan(plan: OrganizePlan, scopeBookmarkIds: string[]) {
  const counts = Object.fromEntries(plan.categories.map((c) => [c, 0]));
  for (const category of Object.values(plan.assignments)) counts[category] = (counts[category] ?? 0) + 1;
  const unassigned = scopeBookmarkIds.filter((id) => !(id in plan.assignments)).length;
  return { counts, unassigned };
}
