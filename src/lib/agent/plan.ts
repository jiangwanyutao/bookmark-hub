export const CATEGORY_SEPARATOR = ' / ';
export const MAX_CATEGORY_DEPTH = 3;
export const MAX_CATEGORY_NAME = 30;
export const MAX_CATEGORIES = 30;
/** 一级分类会直接建在书签栏这类目录下，太多会挤满书签栏 */
export const MAX_TOP_LEVEL = 6;

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
  if (parts.some((part) => part.length === 0)) throw new Error(`分类名称不能为空：「${path}」`);
  if (parts.length > MAX_CATEGORY_DEPTH) throw new Error(`分类「${path}」超过限制：最多 ${MAX_CATEGORY_DEPTH} 层`);
  const tooLong = parts.find((part) => part.length > MAX_CATEGORY_NAME);
  if (tooLong) throw new Error(`分类名「${tooLong}」太长：每级不超过 ${MAX_CATEGORY_NAME} 个字`);
  return parts.join(CATEGORY_SEPARATOR);
}

export function setScope(plan: OrganizePlan, scope: PlanScope, knownFolderIds: Set<string>): OrganizePlan {
  if (scope.folderIds.length === 0) throw new Error('整理范围至少选择一个目录');
  const unknown = [...scope.folderIds, scope.rootFolderId].find((id) => !knownFolderIds.has(id));
  if (unknown) throw new Error(`目录不存在：${unknown}，请先用 list_folders 查看目录 id`);
  return { ...plan, scope: { folderIds: [...scope.folderIds], rootFolderId: scope.rootFolderId }, assignments: {} };
}

export function proposeTaxonomy(plan: OrganizePlan, categories: string[]): OrganizePlan {
  const normalized = [...new Set(categories.map(normalizeCategory))];
  if (normalized.length === 0) throw new Error('分类体系至少需要一个分类');
  if (normalized.length > MAX_CATEGORIES) throw new Error(`分类太多：最多 ${MAX_CATEGORIES} 个分类`);
  const topLevel = [...new Set(normalized.map((c) => c.split(CATEGORY_SEPARATOR)[0]))];
  if (topLevel.length > MAX_TOP_LEVEL) {
    throw new Error(`一级分类最多 ${MAX_TOP_LEVEL} 个，现在有 ${topLevel.length} 个（${topLevel.join('、')}）。请把相近的合并到一个大类下，例如「编程 / 前端」「编程 / 后端」`);
  }
  const kept = Object.fromEntries(Object.entries(plan.assignments).filter(([, category]) => normalized.includes(category)));
  return { ...plan, categories: normalized, assignments: kept };
}

export function assignBookmarks(
  plan: OrganizePlan,
  bookmarkIds: string[],
  category: string,
  inScope: (id: string) => boolean,
): OrganizePlan {
  if (!plan.scope) throw new Error('请先确认整理范围（set_scope），再分配书签');
  const target = normalizeCategory(category);
  if (!plan.categories.includes(target)) {
    throw new Error(`分类「${target}」不在当前体系中。现有分类：${plan.categories.join('、')}`);
  }
  const outside = bookmarkIds.filter((id) => !inScope(id));
  if (outside.length > 0) throw new Error(`${outside.length} 个书签不在整理范围内，不能分配`);
  return { ...plan, assignments: { ...plan.assignments, ...Object.fromEntries(bookmarkIds.map((id) => [id, target])) } };
}

export function summarizePlan(plan: OrganizePlan, scopeBookmarkIds: string[]) {
  const counts = Object.fromEntries(plan.categories.map((c) => [c, 0]));
  for (const category of Object.values(plan.assignments)) counts[category] = (counts[category] ?? 0) + 1;
  const unassigned = scopeBookmarkIds.filter((id) => !(id in plan.assignments)).length;
  return { counts, unassigned };
}
