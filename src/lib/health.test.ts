import { describe, expect, it } from 'vitest';
import { buildIndex, type TreeNode } from './bookmarks';
import { healthScore, isUncategorized } from './health';

describe('healthScore', () => {
  it('matches the PRD example before cleanup', () => {
    expect(healthScore({ total: 2486, broken: 43, redundant: 84, redirected: 62, uncategorized: 146 })).toBe(90);
  });

  it('matches the PRD example after cleanup', () => {
    expect(healthScore({ total: 2359, broken: 0, redundant: 0, redirected: 0, uncategorized: 60 })).toBe(99);
  });

  it('is 100 for an empty library', () => {
    expect(healthScore({ total: 0, broken: 0, redundant: 0, redirected: 0, uncategorized: 0 })).toBe(100);
  });

  it('never goes below 0', () => {
    expect(healthScore({ total: 10, broken: 10, redundant: 10, redirected: 10, uncategorized: 10 })).toBe(0);
  });
});

const bm = (id: string): TreeNode => ({ id, title: id, url: `https://${id}.example.com/` });

const tree: TreeNode[] = [
  {
    id: '0',
    title: '',
    children: [
      { id: '1', title: '书签栏', children: [bm('bar')] },
      {
        id: '2',
        title: '其他书签',
        children: [
          bm('loose'),
          { id: '20', title: '开发', children: [bm('dev')] },
          { id: '21', title: '临时', children: [bm('temp'), { id: '210', title: 'x', children: [bm('deep')] }] },
          { id: '22', title: '我的收藏夹', children: [bm('fav')] },
        ],
      },
    ],
  },
];

describe('isUncategorized', () => {
  const { bookmarks } = buildIndex(tree);
  const check = (id: string) => isUncategorized(bookmarks.find((b) => b.id === id)!, '1');

  it('counts loose bookmarks directly under a built-in folder other than the bookmarks bar', () => {
    expect(check('loose')).toBe(true);
    expect(check('bar')).toBe(false);
  });

  it('counts bookmarks inside catch-all folders, at any depth', () => {
    expect(check('temp')).toBe(true);
    expect(check('deep')).toBe(true);
  });

  it('does not count properly filed bookmarks or folders that merely contain a keyword', () => {
    expect(check('dev')).toBe(false);
    expect(check('fav')).toBe(false);
  });
});
