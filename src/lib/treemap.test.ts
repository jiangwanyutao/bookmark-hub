import { describe, expect, it } from 'vitest';
import type { TreeNode } from './bookmarks';
import { buildIndex } from './bookmarks';
import { childFolderCounts, folderTiles } from './treemap';

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

describe('childFolderCounts', () => {
  const tree: TreeNode[] = [
    {
      id: '0',
      title: '',
      children: [
        {
          id: '1',
          title: '书签栏',
          children: [{ id: 'front', title: '前端', children: [folder('react', 2), folder('vue', 4), folder('none', 0), bm('x')] }],
        },
      ],
    },
  ];
  const { countByFolder } = buildIndex(tree);

  it('lists direct subfolders with their bookmark counts, largest first, skipping empty ones', () => {
    expect(childFolderCounts(tree, 'front', countByFolder)).toEqual([
      { id: 'vue', name: '目录vue', count: 4 },
      { id: 'react', name: '目录react', count: 2 },
    ]);
  });

  it('returns nothing for an unknown folder', () => {
    expect(childFolderCounts(tree, 'missing', countByFolder)).toEqual([]);
  });
});
