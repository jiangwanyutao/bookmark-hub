import type { TreeNode } from '../bookmarks';
import type { Intent } from '../history';
import { CATEGORY_SEPARATOR, type OrganizePlan } from './plan';

export interface ApplyResult {
  intents: Intent[];
  createdFolders: number;
  moved: number;
  removedFolders: number;
  skipped: number;
}

function indexTree(roots: TreeNode[]) {
  const byId = new Map<string, TreeNode>();
  const parentOf = new Map<string, string>();
  const walk = (node: TreeNode) => {
    byId.set(node.id, node);
    for (const child of node.children ?? []) {
      parentOf.set(child.id, node.id);
      walk(child);
    }
  };
  roots.forEach(walk);
  return { byId, parentOf };
}

const selfAndAncestors = (id: string, parentOf: Map<string, string>): string[] => {
  const parent = parentOf.get(id);
  return parent ? [id, ...selfAndAncestors(parent, parentOf)] : [id];
};

/**
 * 移动后变空的目录（范围内书签全被移走，或本来就空），只取最上层的。
 * 不删：浏览器内置目录、新体系所在目录、要移入书签的已有目录，以及它们的上级。
 */
function emptiedFolders(
  roots: TreeNode[],
  folderIds: string[],
  keepIds: string[],
  movedIds: Set<string>,
  byId: Map<string, TreeNode>,
  parentOf: Map<string, string>,
): string[] {
  const builtin = new Set(roots.flatMap((root) => [root.id, ...(root.children ?? []).map((c) => c.id)]));
  const keep = new Set(keepIds.flatMap((id) => selfAndAncestors(id, parentOf)));
  const holdsBookmarks = (node: TreeNode): boolean =>
    node.url !== undefined ? !movedIds.has(node.id) : (node.children ?? []).some(holdsBookmarks);
  const found: string[] = [];
  const visit = (node: TreeNode) => {
    if (node.url !== undefined || found.includes(node.id)) return;
    if (!builtin.has(node.id) && !keep.has(node.id) && !holdsBookmarks(node)) {
      found.push(node.id);
      return;
    }
    (node.children ?? []).forEach(visit);
  };
  folderIds.flatMap((id) => byId.get(id) ?? []).forEach(visit);
  // 范围里的目录互相嵌套时，上级已经要删就不再单独删下级
  return found.filter((id) => !selfAndAncestors(id, parentOf).slice(1).some((a) => found.includes(a)));
}

/** 方案 → 一个批次的操作：先建目录（复用同名已有目录），再移动书签，最后删掉移空的旧目录。 */
export function planToIntents(plan: OrganizePlan, roots: TreeNode[], inScope: (id: string) => boolean): ApplyResult {
  if (!plan.scope) throw new Error('请先确认整理范围');
  const { byId, parentOf } = indexTree(roots);
  const creates: Intent[] = [];
  const moves: Extract<Intent, { type: 'move' }>[] = [];
  // 分类路径 → 目录 id（已有）或 ref（本批次新建）
  const folderFor = new Map<string, string>();
  let skipped = 0;

  const ensureFolder = (path: string): string => {
    const known = folderFor.get(path);
    if (known) return known;
    const parts = path.split(CATEGORY_SEPARATOR);
    const name = parts.at(-1)!;
    const parent = parts.length === 1 ? plan.scope!.rootFolderId : ensureFolder(parts.slice(0, -1).join(CATEGORY_SEPARATOR));
    const existing = byId.get(parent)?.children?.find((c) => c.url === undefined && c.title.trim() === name);
    const id = existing?.id ?? `new:${creates.length}`;
    if (!existing) creates.push({ type: 'create', parentId: parent, node: { title: name }, ref: id });
    folderFor.set(path, id);
    return id;
  };

  for (const [bookmarkId, category] of Object.entries(plan.assignments)) {
    const node = byId.get(bookmarkId);
    if (!node || node.url === undefined || !inScope(bookmarkId)) {
      skipped += 1;
      continue;
    }
    const target = ensureFolder(category);
    if (parentOf.get(bookmarkId) !== target) moves.push({ type: 'move', id: bookmarkId, parentId: target });
  }

  const removes: Intent[] = emptiedFolders(
    roots,
    plan.scope.folderIds,
    [plan.scope.rootFolderId, ...folderFor.values()],
    new Set(moves.map((m) => m.id)),
    byId,
    parentOf,
  ).map((id) => ({ type: 'remove', id }));

  return {
    intents: [...creates, ...moves, ...removes],
    createdFolders: creates.length,
    moved: moves.length,
    removedFolders: removes.length,
    skipped,
  };
}
