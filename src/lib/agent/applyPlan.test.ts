import { describe, expect, it } from 'vitest';
import type { TreeNode } from '../bookmarks';
import { planToIntents } from './applyPlan';
import type { OrganizePlan } from './plan';

const bm = (id: string): TreeNode => ({ id, title: id, url: `https://${id}.com/` });
const roots: TreeNode[] = [
  {
    id: '0',
    title: '',
    children: [
      { id: '1', title: '书签栏', children: [{ id: '10', title: '教程', children: [bm('t')] }] },
      { id: '2', title: '其他书签', children: [bm('a'), bm('b'), bm('c')] },
    ],
  },
];
const inScope = (id: string) => ['a', 'b', 'c', 't'].includes(id);
const plan = (assignments: Record<string, string>): OrganizePlan => ({
  scope: { folderIds: ['2'], rootFolderId: '1' },
  categories: ['文档 / 前端', '文档 / 后端', '教程', '空分类'],
  assignments,
});

describe('planToIntents', () => {
  it('reuses existing folders, creates missing ones with refs, then moves bookmarks', () => {
    const result = planToIntents(plan({ a: '文档 / 前端', b: '文档 / 前端', c: '教程' }), roots, inScope);
    expect(result.intents).toEqual([
      { type: 'create', parentId: '1', node: { title: '文档' }, ref: 'new:0' },
      { type: 'create', parentId: 'new:0', node: { title: '前端' }, ref: 'new:1' },
      { type: 'move', id: 'a', parentId: 'new:1' },
      { type: 'move', id: 'b', parentId: 'new:1' },
      { type: 'move', id: 'c', parentId: '10' },
    ]);
    expect(result).toMatchObject({ createdFolders: 2, moved: 3, skipped: 0 });
  });

  it('does not create folders for empty categories', () => {
    const result = planToIntents(plan({ c: '教程' }), roots, inScope);
    expect(result.intents).toEqual([{ type: 'move', id: 'c', parentId: '10' }]);
  });

  it('does not move bookmarks already in the target folder', () => {
    expect(planToIntents(plan({ t: '教程' }), roots, inScope)).toMatchObject({ intents: [], moved: 0, skipped: 0 });
  });

  it('skips bookmarks that were deleted or left the scope', () => {
    const result = planToIntents(plan({ gone: '教程', a: '教程' }), roots, (id) => id !== 'a');
    expect(result).toMatchObject({ intents: [], moved: 0, skipped: 2 });
  });

  it('refuses to build intents without a scope', () => {
    expect(() => planToIntents({ ...plan({}), scope: null }, roots, inScope)).toThrow('请先确认整理范围');
  });
});
