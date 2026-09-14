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

describe('planToIntents removes folders left empty', () => {
  const tree: TreeNode[] = [
    {
      id: '0',
      title: '',
      children: [
        {
          id: '1',
          title: '书签栏',
          children: [
            { id: '20', title: '旧前端', children: [bm('x'), { id: '21', title: '子目录', children: [bm('y')] }, { id: '22', title: '空目录', children: [] }] },
            { id: '30', title: '杂物', children: [bm('keep'), bm('z')] },
            { id: '40', title: '教程', children: [] },
          ],
        },
        { id: '2', title: '其他书签', children: [] },
      ],
    },
  ];
  const all = () => true;
  const scoped = (folderIds: string[], assignments: Record<string, string>, rootFolderId = '1'): OrganizePlan => ({
    scope: { folderIds, rootFolderId },
    categories: ['教程'],
    assignments,
  });

  it('removes only the topmost emptied folder, after all moves, keeping target folders and folders with bookmarks left', () => {
    const result = planToIntents(scoped(['20', '30', '40'], { x: '教程', y: '教程', z: '教程' }), tree, all);
    expect(result.intents).toEqual([
      { type: 'move', id: 'x', parentId: '40' },
      { type: 'move', id: 'y', parentId: '40' },
      { type: 'move', id: 'z', parentId: '40' },
      { type: 'remove', id: '20' },
    ]);
    expect(result.removedFolders).toBe(1);
  });

  it('never removes built-in folders or the folder the new taxonomy is built in', () => {
    const result = planToIntents(scoped(['1'], { x: '教程', y: '教程', z: '教程', keep: '教程' }, '20'), tree, all);
    expect(result.intents.filter((i) => i.type === 'remove')).toEqual([
      { type: 'remove', id: '21' },
      { type: 'remove', id: '22' },
      { type: 'remove', id: '30' },
      { type: 'remove', id: '40' },
    ]);
  });
});
