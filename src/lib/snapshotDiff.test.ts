import { describe, expect, it } from 'vitest';
import type { TreeNode } from './bookmarks';
import { diffSnapshot, toRestoreIntents } from './snapshotDiff';

const bm = (id: string, title: string, url: string): TreeNode => ({ id, title, url });

const snapshot: TreeNode[] = [
  {
    id: '0',
    title: '',
    children: [
      {
        id: '1',
        title: '书签栏',
        children: [{ id: '10', title: '开发', children: [bm('100', 'A', 'https://a.com/'), bm('101', 'B', 'https://b.com/')] }],
      },
      {
        id: '2',
        title: '其他书签',
        children: [bm('20', 'C', 'https://c.com/'), { id: '21', title: '旧目录', children: [bm('210', 'D', 'https://d.com/')] }],
      },
    ],
  },
];

// 之后：B 和「旧目录」被删，C 被移到书签栏，A 改了标题，新增了一个书签
const current: TreeNode[] = [
  {
    id: '0',
    title: '',
    children: [
      {
        id: '1',
        title: '书签栏',
        children: [{ id: '10', title: '开发', children: [bm('100', 'A2', 'https://a.com/')] }, bm('20', 'C', 'https://c.com/')],
      },
      { id: '2', title: '其他书签', children: [bm('30', '新书签', 'https://n.com/')] },
    ],
  },
];

describe('diffSnapshot', () => {
  const diff = diffSnapshot(snapshot, current);

  it('lists the top-most deleted nodes with where they used to be', () => {
    expect(diff.missing.map((m) => [m.node.id, m.parentId, m.index])).toEqual([
      ['101', '10', 1],
      ['21', '2', 1],
    ]);
  });

  it('lists bookmarks that moved to another folder', () => {
    expect(diff.moved).toEqual([{ id: '20', title: 'C', parentId: '2', index: 0 }]);
  });

  it('lists title and url changes with both versions', () => {
    expect(diff.changed).toEqual([
      { id: '100', title: 'A', url: 'https://a.com/', before: { title: 'A2', url: 'https://a.com/' } },
    ]);
  });

  it('counts what was added since, which restore leaves alone', () => {
    expect(diff.added).toBe(1);
  });

  it('follows id mappings from earlier undos instead of treating them as deleted', () => {
    const mapped = diffSnapshot(snapshot, current, new Map([['101', '555'], ['555', '777']]));
    const withRestored: TreeNode[] = structuredClone(current);
    withRestored[0]!.children![0]!.children![0]!.children!.push(bm('777', 'B', 'https://b.com/'));

    expect(diffSnapshot(snapshot, withRestored, new Map([['101', '555'], ['555', '777']])).missing.map((m) => m.node.id)).toEqual([
      '21',
    ]);
    expect(mapped.missing.map((m) => m.node.id)).toEqual(['101', '21']);
  });
});

describe('toRestoreIntents', () => {
  it('recreates deleted nodes, moves bookmarks back and restores edits', () => {
    const diff = diffSnapshot(snapshot, current);
    expect(toRestoreIntents(diff)).toEqual([
      { type: 'create', parentId: '10', index: 1, node: diff.missing[0]!.node },
      { type: 'create', parentId: '2', index: 1, node: diff.missing[1]!.node },
      { type: 'move', id: '20', parentId: '2', index: 0 },
      { type: 'update', id: '100', title: 'A', url: 'https://a.com/' },
    ]);
  });
});
