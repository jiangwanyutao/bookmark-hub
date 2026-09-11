import { describe, expect, it } from 'vitest';
import type { TreeNode } from './bookmarks';
import { buildIndex } from './bookmarks';
import { folderTiles, squarify, type Rect } from './treemap';

const W = 200;
const H = 100;
const area = (r: Rect) => r.w * r.h;
const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w - 1e-9 && b.x < a.x + a.w - 1e-9 && a.y < b.y + b.h - 1e-9 && b.y < a.y + a.h - 1e-9;

describe('squarify', () => {
  const items = [6, 6, 4, 3, 2, 2, 1].map((value, i) => ({ id: `f${i}`, value }));
  const tiles = squarify(items, { x: 0, y: 0, w: W, h: H });

  it('returns one tile per item with area proportional to its value', () => {
    expect(tiles).toHaveLength(items.length);
    const total = items.reduce((s, i) => s + i.value, 0);
    for (const t of tiles) {
      const value = items.find((i) => i.id === t.id)!.value;
      expect(area(t)).toBeCloseTo((value / total) * W * H, 6);
    }
  });

  it('keeps every tile inside the bounds without overlapping', () => {
    for (const t of tiles) {
      expect(t.x).toBeGreaterThanOrEqual(-1e-9);
      expect(t.y).toBeGreaterThanOrEqual(-1e-9);
      expect(t.x + t.w).toBeLessThanOrEqual(W + 1e-9);
      expect(t.y + t.h).toBeLessThanOrEqual(H + 1e-9);
    }
    for (let i = 0; i < tiles.length; i++) {
      for (let j = i + 1; j < tiles.length; j++) expect(overlaps(tiles[i]!, tiles[j]!)).toBe(false);
    }
  });

  it('ignores items without value and handles empty input', () => {
    expect(squarify([{ id: 'a', value: 0 }], { x: 0, y: 0, w: W, h: H })).toEqual([]);
    expect(squarify([], { x: 0, y: 0, w: W, h: H })).toEqual([]);
  });

  it('gives a single item the whole area', () => {
    expect(squarify([{ id: 'a', value: 3 }], { x: 0, y: 0, w: W, h: H })).toEqual([{ id: 'a', x: 0, y: 0, w: W, h: H }]);
  });
});

const bm = (id: string): TreeNode => ({ id, title: id, url: `https://${id}.com/` });
const folder = (id: string, count: number): TreeNode => ({
  id,
  title: `目录${id}`,
  children: Array.from({ length: count }, (_, i) => bm(`${id}-${i}`)),
});

describe('folderTiles', () => {
  const tree: TreeNode[] = [
    {
      id: '0',
      title: '',
      children: [
        { id: '1', title: '书签栏', children: [folder('a', 5), folder('b', 3), bm('loose1')] },
        { id: '2', title: '其他书签', children: [folder('c', 1), folder('empty', 0), bm('loose2')] },
      ],
    },
  ];
  const { countByFolder } = buildIndex(tree);

  it('lists top-level folders by size, plus loose bookmarks, skipping empty folders', () => {
    expect(folderTiles(tree, countByFolder, 10)).toEqual([
      { id: 'a', name: '目录a', value: 5, folderId: 'a' },
      { id: 'b', name: '目录b', value: 3, folderId: 'b' },
      { id: 'loose', name: '零散书签', value: 2, folderId: null },
      { id: 'c', name: '目录c', value: 1, folderId: 'c' },
    ]);
  });

  it('folds everything beyond the limit into one tile', () => {
    expect(folderTiles(tree, countByFolder, 2)).toEqual([
      { id: 'a', name: '目录a', value: 5, folderId: 'a' },
      { id: 'b', name: '目录b', value: 3, folderId: 'b' },
      { id: 'rest', name: '其余 2 项', value: 3, folderId: null },
    ]);
  });
});
