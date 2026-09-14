import type { TreeNode } from './bookmarks';

/** 书架上的一本书：一个第一层目录，或「零散书签」「其余 N 项」这类汇总项（不可点击）。 */
export interface FolderTile {
  id: string;
  name: string;
  value: number;
  folderId: string | null;
}

/**
 * 分布数据：浏览器内置目录下的第一层目录（按书签数），内置目录下的零散书签合成一项；
 * 超过 limit 的部分合并为「其余 N 项」。空目录不显示。
 */
export function folderTiles(roots: TreeNode[], countByFolder: Map<string, number>, limit: number): FolderTile[] {
  const builtins = roots[0]?.children ?? [];
  const folders: FolderTile[] = builtins
    .flatMap((b) => (b.children ?? []).filter((c) => c.url === undefined))
    .map((f) => ({ id: f.id, name: f.title, value: countByFolder.get(f.id) ?? 0, folderId: f.id }))
    .filter((t) => t.value > 0);
  const loose = builtins.reduce((s, b) => s + (b.children ?? []).filter((c) => c.url !== undefined).length, 0);

  const all = [...folders, ...(loose > 0 ? [{ id: 'loose', name: '零散书签', value: loose, folderId: null }] : [])].sort(
    (a, b) => b.value - a.value,
  );
  if (all.length <= limit) return all;

  const rest = all.slice(limit);
  return [
    ...all.slice(0, limit),
    { id: 'rest', name: `其余 ${rest.length} 项`, value: rest.reduce((s, t) => s + t.value, 0), folderId: null },
  ];
}

/** 某个目录的直属子目录及其书签数（含更深层），按数量从多到少，空目录不列出。 */
export function childFolderCounts(
  roots: TreeNode[],
  folderId: string,
  countByFolder: Map<string, number>,
): { id: string; name: string; count: number }[] {
  const find = (nodes: TreeNode[]): TreeNode | undefined => {
    for (const node of nodes) {
      if (node.id === folderId) return node;
      const hit = find(node.children ?? []);
      if (hit) return hit;
    }
    return undefined;
  };
  return (find(roots)?.children ?? [])
    .filter((c) => c.url === undefined)
    .map((c) => ({ id: c.id, name: c.title, count: countByFolder.get(c.id) ?? 0 }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);
}
