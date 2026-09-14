import { describe, expect, it } from 'vitest';
import { assignBookmarks, emptyPlan, normalizeCategory, proposeTaxonomy, setScope, summarizePlan } from './plan';

const folders = new Set(['1', '2', '20']);
const scoped = setScope(emptyPlan(), { folderIds: ['2'], rootFolderId: '1' }, folders);
const inScope = (id: string) => ['a', 'b', 'c'].includes(id);

describe('normalizeCategory', () => {
  it('trims around slashes and joins with " / "', () => {
    expect(normalizeCategory(' 文档/前端 ')).toBe('文档 / 前端');
  });

  it.each([
    ['', '分类名称不能为空'],
    ['文档 / / 前端', '分类名称不能为空'],
    ['一 / 二 / 三 / 四', '最多 3 层'],
    [`${'长'.repeat(31)}`, '不超过 30 个字'],
  ])('rejects "%s"', (path, message) => {
    expect(() => normalizeCategory(path)).toThrow(message);
  });
});

describe('setScope', () => {
  it('records the scope and does not modify the input plan', () => {
    const plan = emptyPlan();
    const next = setScope(plan, { folderIds: ['2', '20'], rootFolderId: '1' }, folders);
    expect(next.scope).toEqual({ folderIds: ['2', '20'], rootFolderId: '1' });
    expect(plan.scope).toBeNull();
  });

  it('rejects unknown or empty folders', () => {
    expect(() => setScope(emptyPlan(), { folderIds: [], rootFolderId: '1' }, folders)).toThrow('至少选择一个目录');
    expect(() => setScope(emptyPlan(), { folderIds: ['99'], rootFolderId: '1' }, folders)).toThrow('目录不存在：99');
    expect(() => setScope(emptyPlan(), { folderIds: ['2'], rootFolderId: '99' }, folders)).toThrow('目录不存在：99');
  });

  it('clears earlier assignments when the scope changes', () => {
    const withAssign = assignBookmarks(proposeTaxonomy(scoped, ['教程']), ['a'], '教程', inScope);
    expect(setScope(withAssign, { folderIds: ['20'], rootFolderId: '1' }, folders).assignments).toEqual({});
  });
});

describe('proposeTaxonomy', () => {
  it('normalizes and de-duplicates categories', () => {
    expect(proposeTaxonomy(scoped, ['文档/前端', '文档 / 前端', '教程']).categories).toEqual(['文档 / 前端', '教程']);
  });

  it('rejects more than 30 categories or an empty list', () => {
    expect(() => proposeTaxonomy(scoped, Array.from({ length: 31 }, (_, i) => `类${i}`))).toThrow('最多 30 个分类');
    expect(() => proposeTaxonomy(scoped, [])).toThrow('至少需要一个分类');
  });

  it('rejects more than 6 top-level categories so the bookmark bar stays short', () => {
    expect(() => proposeTaxonomy(scoped, ['前端', '后端', '工程化', 'AI', '设计', '工具', '娱乐'])).toThrow('一级分类最多 6 个');
    const grouped = ['编程 / 前端 / Vue', '编程 / 后端', '编程 / 工程化', 'AI', '设计', '工具', '娱乐', '资料', '生活'];
    expect(() => proposeTaxonomy(scoped, grouped)).toThrow('一级分类最多 6 个');
    expect(proposeTaxonomy(scoped, grouped.slice(0, 7)).categories).toHaveLength(7);
  });

  it('moves bookmarks of removed categories back to unassigned', () => {
    const plan = assignBookmarks(proposeTaxonomy(scoped, ['文档 / 中台', '教程']), ['a'], '文档 / 中台', inScope);
    expect(proposeTaxonomy(plan, ['教程']).assignments).toEqual({});
  });
});

describe('assignBookmarks', () => {
  const plan = proposeTaxonomy(scoped, ['文档 / 前端', '教程']);

  it('assigns in-scope bookmarks, the latest assignment winning', () => {
    const once = assignBookmarks(plan, ['a', 'b'], '文档/前端', inScope);
    const twice = assignBookmarks(once, ['b'], '教程', inScope);
    expect(twice.assignments).toEqual({ a: '文档 / 前端', b: '教程' });
    expect(once.assignments).toEqual({ a: '文档 / 前端', b: '文档 / 前端' });
  });

  it('requires a confirmed scope', () => {
    expect(() => assignBookmarks(proposeTaxonomy(emptyPlan(), ['教程']), ['a'], '教程', inScope)).toThrow('请先确认整理范围');
  });

  it('rejects categories outside the taxonomy and bookmarks outside the scope', () => {
    expect(() => assignBookmarks(plan, ['a'], '后端', inScope)).toThrow('分类「后端」不在当前体系中');
    expect(() => assignBookmarks(plan, ['a', 'z'], '教程', inScope)).toThrow('1 个书签不在整理范围内');
  });
});

describe('summarizePlan', () => {
  it('counts bookmarks per category and those still unassigned', () => {
    const plan = assignBookmarks(proposeTaxonomy(scoped, ['文档 / 前端', '教程']), ['a', 'b'], '教程', inScope);
    expect(summarizePlan(plan, ['a', 'b', 'c'])).toEqual({ counts: { '文档 / 前端': 0, 教程: 2 }, unassigned: 1 });
  });
});
