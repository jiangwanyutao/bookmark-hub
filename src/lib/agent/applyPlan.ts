import type { TreeNode } from '../bookmarks';
import type { Intent } from '../history';
import { CATEGORY_SEPARATOR, type OrganizePlan } from './plan';

export interface ApplyResult {
  intents: Intent[];
  createdFolders: number;
  moved: number;
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

/** 方案 → 一个批次的操作：先建目录（复用同名已有目录），再移动书签。 */
export function planToIntents(plan: OrganizePlan, roots: TreeNode[], inScope: (id: string) => boolean): ApplyResult {
  if (!plan.scope) throw new Error('请先确认整理范围');
  const { byId, parentOf } = indexTree(roots);
  const creates: Intent[] = [];
  const moves: Intent[] = [];
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

  return { intents: [...creates, ...moves], createdFolders: creates.length, moved: moves.length, skipped };
}
