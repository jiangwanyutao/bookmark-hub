import { describe, expect, it } from 'vitest';
import type { TreeNode } from './bookmarks';
import { planImport } from './importHtml';

const folder = (title: string, children: TreeNode[]): TreeNode => ({ id: title, title, children });
const link = (title: string, url: string): TreeNode => ({ id: url, title, url });

describe('planImport', () => {
  const imported = [
    folder('前端', [link('MDN', 'https://developer.mozilla.org/'), link('React', 'https://react.dev/')]),
    link('豆瓣', 'https://www.douban.com/'),
  ];

  it('counts what is new and what the user already has', () => {
    const plan = planImport(imported, new Set(['https://react.dev/']), { skipExisting: true });

    expect(plan.newCount).toBe(2);
    expect(plan.existingCount).toBe(1);
  });

  it('leaves out bookmarks already saved when asked to skip them', () => {
    const plan = planImport(imported, new Set(['https://react.dev/']), { skipExisting: true });

    const urls = JSON.stringify(plan.node);
    expect(urls).toContain('https://developer.mozilla.org/');
    expect(urls).not.toContain('https://react.dev/');
  });

  it('keeps duplicates when the user wants everything', () => {
    const plan = planImport(imported, new Set(['https://react.dev/']), { skipExisting: false });

    expect(plan.newCount).toBe(3);
    expect(JSON.stringify(plan.node)).toContain('https://react.dev/');
  });

  it('drops folders that end up empty after skipping, keeps the rest of the tree', () => {
    const tree = [folder('只有重复的', [link('React', 'https://react.dev/')]), folder('有新的', [link('豆瓣', 'https://www.douban.com/')])];

    const plan = planImport(tree, new Set(['https://react.dev/']), { skipExisting: true });

    const titles = (plan.node.children ?? []).map((c) => c.title);
    expect(titles).toEqual(['有新的']);
  });

  it('wraps everything in one dated folder so the import can be found and undone', () => {
    const plan = planImport(imported, new Set(), { skipExisting: true, now: new Date('2026-09-16T10:00:00') });

    expect(plan.node.title).toBe('导入的书签 2026-09-16');
  });

  it('reports nothing to import when every bookmark is already there', () => {
    const plan = planImport([link('React', 'https://react.dev/')], new Set(['https://react.dev/']), { skipExisting: true });

    expect(plan.newCount).toBe(0);
    expect(plan.node.children).toEqual([]);
  });
});
