import { describe, it, expect } from 'vitest';
import { buildIndex, getDomain, listFolders, searchBookmarks, topDomains, type TreeNode } from './bookmarks';

// 结构与 chrome.bookmarks.getTree() 一致：一个无标题根节点，下面是浏览器内置目录
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
              {
                id: '100',
                title: 'AI',
                children: [
                  { id: '1000', title: 'OpenAI API Docs', url: 'https://platform.openai.com/docs', dateAdded: 1 },
                  { id: '1001', title: 'Anthropic Docs', url: 'https://www.anthropic.com/docs' },
                ],
              },
              { id: '101', title: 'React 性能优化', url: 'https://react.dev/learn/perf' },
            ],
          },
          { id: '11', title: 'GitHub', url: 'https://github.com' },
        ],
      },
      {
        id: '2',
        title: '其他书签',
        children: [
          { id: '20', title: '空目录', children: [] },
          { id: '21', title: 'WXT Repo', url: 'https://github.com/wxt-dev/wxt' },
          { id: '22', title: '小书签', url: 'javascript:alert(1)' },
        ],
      },
    ],
  },
];

const ids = (list: { id: string }[]) => list.map((b) => b.id).sort();

describe('buildIndex', () => {
  const index = buildIndex(tree);

  it('collects every bookmark in the tree', () => {
    expect(index.bookmarks).toHaveLength(6);
  });

  it('counts only user folders, not the root or browser built-in folders', () => {
    expect(index.folderCount).toBe(3); // 开发、AI、空目录
  });

  it('counts bookmarks per folder including subfolders', () => {
    expect(index.countByFolder.get('0')).toBe(6);
    expect(index.countByFolder.get('1')).toBe(4);
    expect(index.countByFolder.get('10')).toBe(3);
    expect(index.countByFolder.get('20')).toBe(0);
  });

  it('records folder path and ancestor ids for each bookmark', () => {
    const openai = index.bookmarks.find((b) => b.id === '1000')!;
    expect(openai.folderPath).toBe('书签栏 / 开发 / AI');
    expect(openai.ancestorIds).toEqual(['0', '1', '10', '100']);
    expect(openai.domain).toBe('platform.openai.com');
    expect(openai.dateAdded).toBe(1);
  });
});

describe('getDomain', () => {
  it('strips the www prefix', () => {
    expect(getDomain('https://www.anthropic.com/docs')).toBe('anthropic.com');
  });

  it('returns empty string for non-http urls and invalid input', () => {
    expect(getDomain('javascript:alert(1)')).toBe('');
    expect(getDomain('chrome://settings')).toBe('');
    expect(getDomain('not a url')).toBe('');
  });
});

describe('topDomains', () => {
  it('orders domains by count and skips non-web bookmarks', () => {
    const result = topDomains(buildIndex(tree).bookmarks, 10);
    expect(result[0]).toEqual({ domain: 'github.com', count: 2 });
    expect(result).toHaveLength(4);
    expect(result.some((d) => d.domain === '')).toBe(false);
  });

  it('respects the limit', () => {
    expect(topDomains(buildIndex(tree).bookmarks, 2)).toHaveLength(2);
  });
});

describe('searchBookmarks', () => {
  const { bookmarks } = buildIndex(tree);

  it('returns everything for a blank query', () => {
    expect(searchBookmarks(bookmarks, '   ')).toHaveLength(6);
  });

  it('matches all terms, case-insensitively', () => {
    expect(ids(searchBookmarks(bookmarks, 'react 性能'))).toEqual(['101']);
    expect(ids(searchBookmarks(bookmarks, 'GITHUB'))).toEqual(['11', '21']);
  });

  it('matches folder path as well as title and url', () => {
    expect(ids(searchBookmarks(bookmarks, '开发 ai'))).toEqual(['1000', '1001']);
  });

  it('matches tags when a tag map is given', () => {
    const tags = new Map([['https://react.dev/learn/perf', ['LLM', '教程']]]);
    expect(ids(searchBookmarks(bookmarks, 'llm', tags))).toEqual(['101']);
    expect(ids(searchBookmarks(bookmarks, 'react 教程', tags))).toEqual(['101']);
    expect(ids(searchBookmarks(bookmarks, 'llm'))).toEqual([]);
  });
});

describe('listFolders', () => {
  it('lists every folder except the root, in tree order, with full paths', () => {
    expect(listFolders(tree)).toEqual([
      { id: '1', path: '书签栏' },
      { id: '10', path: '书签栏 / 开发' },
      { id: '100', path: '书签栏 / 开发 / AI' },
      { id: '2', path: '其他书签' },
      { id: '20', path: '其他书签 / 空目录' },
    ]);
  });
});
