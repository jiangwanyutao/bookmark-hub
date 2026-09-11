import { describe, expect, it } from 'vitest';
import type { TreeNode } from './bookmarks';
import { categorize, toNavigableUrl } from './launcher';

const bm = (id: string, title: string): TreeNode => ({ id, title, url: `https://${id}.example.com/` });

const tree: TreeNode[] = [
  {
    id: '0',
    title: '',
    children: [
      {
        id: '1',
        title: '书签栏',
        children: [
          bm('g', 'GitHub'),
          {
            id: '10',
            title: '开发',
            children: [
              bm('m', 'MDN'),
              { id: '100', title: 'AI', children: [bm('o', 'OpenAI'), { id: '1000', title: 'LLM', children: [bm('c', 'Claude')] }] },
              { id: '101', title: '空', children: [] },
            ],
          },
          { id: '11', title: '空目录', children: [] },
        ],
      },
      { id: '2', title: '其他书签', children: [{ id: '20', title: '设计', children: [bm('f', 'Figma')] }, bm('x', 'Loose')] },
    ],
  },
];

const shape = (categories: ReturnType<typeof categorize>) =>
  categories.map((c) => ({
    id: c.id,
    name: c.name,
    count: c.count,
    sections: c.sections.map((s) => [s.title, s.items.map((i) => i.id)]),
  }));

describe('categorize', () => {
  it('turns first-level folders into categories, with loose bar bookmarks as 常用 and subfolders as sections', () => {
    expect(shape(categorize(tree))).toEqual([
      { id: 'pinned', name: '常用', count: 1, sections: [[null, ['g']]] },
      {
        id: '10',
        name: '开发',
        count: 3,
        sections: [
          [null, ['m']],
          ['AI', ['o']],
          ['AI / LLM', ['c']],
        ],
      },
      { id: '20', name: '设计', count: 1, sections: [[null, ['f']]] },
      { id: '2', name: '其他书签', count: 1, sections: [[null, ['x']]] },
    ]);
  });

  it('returns nothing for an empty tree', () => {
    expect(categorize([])).toEqual([]);
  });
});

describe('toNavigableUrl', () => {
  it.each([
    ['github.com', 'https://github.com'],
    ['https://a.example.com/x?y=1', 'https://a.example.com/x?y=1'],
    ['http://intranet.corp/wiki', 'http://intranet.corp/wiki'],
    ['localhost:3000', 'http://localhost:3000'],
    ['192.168.1.1', 'http://192.168.1.1'],
    ['  react.dev/learn  ', 'https://react.dev/learn'],
  ])('treats %s as an address', (input, expected) => {
    expect(toNavigableUrl(input)).toBe(expected);
  });

  it.each([['react hooks'], ['vue'], ['node.js 教程'], ['a.b'], ['']])('treats "%s" as a search', (input) => {
    expect(toNavigableUrl(input)).toBeNull();
  });
});
