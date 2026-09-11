import { describe, expect, it } from 'vitest';
import { buildIndex, type TreeNode } from './bookmarks';
import { findDuplicateGroups, normalizeUrl, redundantCount } from './duplicates';

describe('normalizeUrl', () => {
  it('lowercases host, drops default port, trailing slash and tracking params, sorts query', () => {
    expect(normalizeUrl('https://Example.com:443/article/?utm_source=twitter&b=2&a=1')).toBe(
      'https://example.com/article?a=1&b=2',
    );
  });

  it('treats http and https as the same address', () => {
    expect(normalizeUrl('http://example.com/a')).toBe('https://example.com/a');
  });

  it('strips every known tracking parameter', () => {
    expect(normalizeUrl('https://x.com/p?fbclid=1&gclid=2&msclkid=3&mc_cid=4&mc_eid=5&spm=6&utm_term=7&id=9')).toBe(
      'https://x.com/p?id=9',
    );
  });

  it('keeps the root slash and the fragment', () => {
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com/');
    expect(normalizeUrl('https://app.com/#/route')).toBe('https://app.com/#/route');
  });

  it('leaves non-web urls untouched', () => {
    expect(normalizeUrl('javascript:alert(1)')).toBe('javascript:alert(1)');
  });
});

const bm = (id: string, url: string, dateAdded: number): TreeNode => ({ id, title: id, url, dateAdded });

const tree: TreeNode[] = [
  {
    id: '0',
    title: '',
    children: [
      {
        id: '1',
        title: '书签栏',
        children: [
          {
            id: '10',
            title: '开发',
            children: [
              bm('a1', 'https://example.com/article', 3),
              bm('a2', 'https://example.com/article?utm_source=x', 1),
              bm('a3', 'https://example.com/article', 2),
              bm('x1', 'https://a.com/x', 5),
              bm('x2', 'https://a.com/x', 4),
              bm('b1', 'https://b.com/p', 6),
              bm('c1', 'https://www.c.com/p', 7),
              bm('c2', 'https://c.com/p', 8),
              bm('d1', 'https://d.com/page#intro', 9),
              bm('d2', 'https://d.com/page', 10),
              bm('s1', 'https://app.com/#/inbox', 11),
              bm('s2', 'https://app.com/#/settings', 12),
              bm('j1', 'javascript:void(0)', 13),
              bm('j2', 'javascript:void(0)', 14),
              bm('u1', 'https://unique.com/', 15),
            ],
          },
        ],
      },
      { id: '2', title: '其他书签', children: [{ id: '20', title: '稍后读', children: [bm('b2', 'https://b.com/p', 16)] }] },
    ],
  },
];

describe('findDuplicateGroups', () => {
  const groups = findDuplicateGroups(buildIndex(tree).bookmarks);
  const groupOf = (id: string) => groups.find((g) => g.bookmarks.some((b) => b.id === id));
  const ids = (id: string) => groupOf(id)?.bookmarks.map((b) => b.id);

  it('groups normalized duplicates, oldest first, and keeps the oldest by default', () => {
    const g = groupOf('a1')!;
    expect(g.tier).toBe('normalized');
    expect(ids('a1')).toEqual(['a2', 'a3', 'a1']);
    expect(g.crossFolder).toBe(false);
    expect(g.defaultKeepId).toBe('a2');
  });

  it('marks identical urls as exact duplicates', () => {
    expect(groupOf('x1')!.tier).toBe('exact');
    expect(groupOf('x1')!.defaultKeepId).toBe('x2');
  });

  it('never picks a default for duplicates spread across folders', () => {
    const g = groupOf('b1')!;
    expect(g.tier).toBe('exact');
    expect(g.crossFolder).toBe(true);
    expect(g.defaultKeepId).toBeNull();
  });

  it('flags www and plain anchor differences as suspected duplicates without a default', () => {
    expect(groupOf('c1')!.tier).toBe('suspect');
    expect(groupOf('d1')!.tier).toBe('suspect');
    expect(groupOf('c1')!.defaultKeepId).toBeNull();
  });

  it('does not group single-page-app routes, non-web links or unique bookmarks', () => {
    expect(groupOf('s1')).toBeUndefined();
    expect(groupOf('j1')).toBeUndefined();
    expect(groupOf('u1')).toBeUndefined();
  });

  it('sorts larger groups first', () => {
    expect(groups[0]!.bookmarks).toHaveLength(3);
  });

  it('counts redundant bookmarks as group size minus one', () => {
    expect(groups).toHaveLength(5);
    expect(redundantCount(groups)).toBe(6);
  });
});
