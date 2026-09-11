import type { TreeNode } from './bookmarks';
import type { Intent } from './history';

/** 快照里有、现在没有的最上层节点（它的子节点随它一起恢复）。 */
export interface MissingNode {
  node: TreeNode;
  parentId: string;
  index: number;
}

export interface MovedNode {
  id: string;
  title: string;
  /** 快照时所在的目录 */
  parentId: string;
  index: number;
}

export interface ChangedNode {
  id: string;
  /** 快照时的标题与网址 */
  title: string;
  url?: string;
  before: { title: string; url?: string };
}

export interface SnapshotDiff {
  missing: MissingNode[];
  moved: MovedNode[];
  changed: ChangedNode[];
  /** 快照之后新增的节点数；恢复时保持不动 */
  added: number;
}

// 根节点和浏览器内置目录（书签栏、其他书签等）浏览器不允许改动，不参与比较
const FIRST_USER_DEPTH = 2;

interface Located {
  node: TreeNode;
  parentId?: string;
}

function locateAll(roots: TreeNode[]): Map<string, Located> {
  const map = new Map<string, Located>();
  const walk = (node: TreeNode, parentId?: string) => {
    map.set(node.id, { node, parentId });
    node.children?.forEach((child) => walk(child, node.id));
  };
  roots.forEach((root) => walk(root));
  return map;
}

/** 沿撤销产生的 id 映射（旧 → 新，可能多级）找到当前 id。 */
function resolver(idMap: Map<string, string>) {
  return (id: string) => {
    let current = id;
    const seen = new Set<string>();
    while (idMap.has(current) && !seen.has(current)) {
      seen.add(current);
      current = idMap.get(current)!;
    }
    return current;
  };
}

/** 对比快照与当前书签树：删掉的、挪走的、改过标题或网址的，以及之后新增的数量。 */
export function diffSnapshot(snapshot: TreeNode[], current: TreeNode[], idMap: Map<string, string> = new Map()): SnapshotDiff {
  const resolve = resolver(idMap);
  const live = locateAll(current);
  const matched = new Set<string>();
  const diff: SnapshotDiff = { missing: [], moved: [], changed: [], added: 0 };

  const walk = (node: TreeNode, parentId: string | undefined, index: number, depth: number) => {
    const id = resolve(node.id);
    const now = live.get(id);
    const parent = parentId === undefined ? undefined : resolve(parentId);

    if (!now) {
      if (parent !== undefined && live.has(parent)) diff.missing.push({ node, parentId: parent, index });
      return;
    }
    matched.add(id);
    if (depth >= FIRST_USER_DEPTH) {
      if (parent !== undefined && now.parentId !== parent && live.has(parent)) {
        diff.moved.push({ id, title: node.title, parentId: parent, index });
      }
      if (now.node.title !== node.title || now.node.url !== node.url) {
        diff.changed.push({ id, title: node.title, url: node.url, before: { title: now.node.title, url: now.node.url } });
      }
    }
    node.children?.forEach((child, i) => walk(child, node.id, i, depth + 1));
  };

  snapshot.forEach((root, i) => walk(root, undefined, i, 0));
  diff.added = [...live].filter(([id, located]) => located.parentId !== undefined && !matched.has(id)).length;
  return diff;
}

/** 恢复 = 重建删掉的、移回挪走的、还原改过的；之后新增的不删除。 */
export function toRestoreIntents(diff: SnapshotDiff): Intent[] {
  return [
    ...diff.missing.map((m): Intent => ({ type: 'create', parentId: m.parentId, index: m.index, node: m.node })),
    ...diff.moved.map((m): Intent => ({ type: 'move', id: m.id, parentId: m.parentId, index: m.index })),
    ...diff.changed.map(
      (c): Intent => ({ type: 'update', id: c.id, title: c.title, ...(c.url !== undefined && { url: c.url }) }),
    ),
  ];
}
