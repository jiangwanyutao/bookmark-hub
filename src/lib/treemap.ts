import type { TreeNode } from './bookmarks';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TreemapItem {
  id: string;
  value: number;
}

export interface TreemapTile extends Rect {
  id: string;
}

/** 书签地图上的一块：一个第一层目录，或「零散书签」「其余 N 项」这类汇总块（不可点击）。 */
export interface FolderTile {
  id: string;
  name: string;
  value: number;
  folderId: string | null;
}

interface Sized {
  id: string;
  area: number;
}

const sumArea = (row: Sized[]) => row.reduce((s, r) => s + r.area, 0);

// 一行里最「扁」的那块的长宽比（≥1），越接近 1 越好
function worstRatio(row: Sized[], side: number) {
  const s = sumArea(row);
  const areas = row.map((r) => r.area);
  const max = Math.max(...areas);
  const min = Math.min(...areas);
  return Math.max((side * side * max) / (s * s), (s * s) / (side * side * min));
}

// 把一行沿较短边排下去，返回剩余的矩形
function layoutRow(row: Sized[], rect: Rect, out: TreemapTile[]): Rect {
  const s = sumArea(row);
  if (rect.w >= rect.h) {
    const width = s / rect.h;
    let y = rect.y;
    for (const r of row) {
      const h = r.area / width;
      out.push({ id: r.id, x: rect.x, y, w: width, h });
      y += h;
    }
    return { x: rect.x + width, y: rect.y, w: rect.w - width, h: rect.h };
  }
  const height = s / rect.w;
  let x = rect.x;
  for (const r of row) {
    const w = r.area / height;
    out.push({ id: r.id, x, y: rect.y, w, h: height });
    x += w;
  }
  return { x: rect.x, y: rect.y + height, w: rect.w, h: rect.h - height };
}

/** Squarified treemap：面积与数值成正比，并尽量让每块接近正方形。 */
export function squarify(items: TreemapItem[], bounds: Rect): TreemapTile[] {
  const positive = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  const total = positive.reduce((s, i) => s + i.value, 0);
  if (total === 0) return [];

  const boundsArea = bounds.w * bounds.h;
  const sized = positive.map((i) => ({ id: i.id, area: (i.value / total) * boundsArea }));
  const tiles: TreemapTile[] = [];
  let rect = { ...bounds };
  let row: Sized[] = [];

  for (const item of sized) {
    const side = Math.min(rect.w, rect.h);
    if (row.length === 0 || worstRatio([...row, item], side) <= worstRatio(row, side)) {
      row.push(item);
    } else {
      rect = layoutRow(row, rect, tiles);
      row = [item];
    }
  }
  if (row.length > 0) layoutRow(row, rect, tiles);
  return tiles;
}

/**
 * 地图数据：浏览器内置目录下的第一层目录（按书签数），内置目录下的零散书签合成一块；
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
