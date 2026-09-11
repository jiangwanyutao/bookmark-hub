import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { IDBPDatabase } from 'idb';
import { openHubDB, type HubDB } from './db';
import {
  applyBatch,
  listBatches,
  listSnapshots,
  pruneSnapshots,
  resolveId,
  undoBatch,
  type Ctx,
} from './history';
import { createFakeBookmarks } from './testing/fakeBookmarks';

const DAY = 86_400_000;

let db: IDBPDatabase<HubDB>;
let ctx: Ctx;

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  db = await openHubDB();
  let t = 0;
  ctx = { api: createFakeBookmarks(), db, now: () => ++t };
});

afterEach(() => db.close());

const add = (title: string, parentId = '2') =>
  ctx.api.create({ parentId, title, url: `https://${title.toLowerCase()}.example.com` });
const node = async (id: string) => (await ctx.api.get(id))[0]!;
const titlesIn = async (parentId: string) => (await ctx.api.getChildren(parentId)).map((n) => n.title);

describe('undo remove', () => {
  it('restores a deleted bookmark at its original position and maps the new id', async () => {
    await add('A');
    const b = await add('B');
    await add('C');

    const batch = await applyBatch(ctx, '删除书签', [{ type: 'remove', id: b.id }]);
    expect(await titlesIn('2')).toEqual(['A', 'C']);

    expect(await undoBatch(ctx, batch.id)).toEqual({ undone: 1, skipped: 0 });
    expect(await titlesIn('2')).toEqual(['A', 'B', 'C']);

    const newId = await resolveId(ctx, b.id);
    expect(newId).not.toBe(b.id);
    expect((await node(newId)).url).toBe(b.url);
    expect((await db.get('idMap', b.id))?.originalDateAdded).toBe(b.dateAdded);
  });

  it('restores a deleted folder with its whole subtree in order', async () => {
    const folder = await ctx.api.create({ parentId: '1', title: '开发' });
    const sub = await ctx.api.create({ parentId: folder.id, title: 'AI' });
    await add('X', sub.id);
    await add('Y', folder.id);

    const batch = await applyBatch(ctx, '删除目录', [{ type: 'remove', id: folder.id }]);
    await undoBatch(ctx, batch.id);

    const [restored] = await ctx.api.getSubTree(await resolveId(ctx, folder.id));
    expect(restored!.title).toBe('开发');
    expect(restored!.children!.map((c) => c.title)).toEqual(['AI', 'Y']);
    expect(restored!.children![0]!.children!.map((c) => c.title)).toEqual(['X']);
  });

  it('clamps the restore position when the folder now has fewer children', async () => {
    const a = await add('A');
    const b = await add('B');
    const c = await add('C');
    const batch = await applyBatch(ctx, '删除书签', [{ type: 'remove', id: c.id }]);
    await ctx.api.remove(a.id);
    await ctx.api.remove(b.id);

    expect(await undoBatch(ctx, batch.id)).toEqual({ undone: 1, skipped: 0 });
    expect(await titlesIn('2')).toEqual(['C']);
  });
});

describe('undo move', () => {
  it('moves a bookmark back to its original folder', async () => {
    const a = await add('A');
    const batch = await applyBatch(ctx, '移动书签', [{ type: 'move', id: a.id, parentId: '1' }]);
    expect((await node(a.id)).parentId).toBe('1');

    await undoBatch(ctx, batch.id);
    expect((await node(a.id)).parentId).toBe('2');
  });

  it('skips the bookmark when the user moved it again afterwards', async () => {
    const a = await add('A');
    const elsewhere = await ctx.api.create({ parentId: '1', title: '别处' });
    const batch = await applyBatch(ctx, '移动书签', [{ type: 'move', id: a.id, parentId: '1' }]);
    await ctx.api.move(a.id, { parentId: elsewhere.id });

    expect(await undoBatch(ctx, batch.id)).toEqual({ undone: 0, skipped: 1 });
    expect((await node(a.id)).parentId).toBe(elsewhere.id);
  });
});

describe('undo update', () => {
  it('restores the previous title and url', async () => {
    const a = await add('A');
    const batch = await applyBatch(ctx, '编辑书签', [
      { type: 'update', id: a.id, title: 'A2', url: 'https://new.example.com' },
    ]);

    await undoBatch(ctx, batch.id);
    const restored = await node(a.id);
    expect(restored.title).toBe('A');
    expect(restored.url).toBe(a.url);
  });

  it('skips the bookmark when the user edited it afterwards', async () => {
    const a = await add('A');
    const batch = await applyBatch(ctx, '编辑书签', [{ type: 'update', id: a.id, title: 'A2' }]);
    await ctx.api.update(a.id, { title: '手动改的' });

    expect(await undoBatch(ctx, batch.id)).toEqual({ undone: 0, skipped: 1 });
    expect((await node(a.id)).title).toBe('手动改的');
  });
});

describe('undo rules', () => {
  it('refuses to undo the same batch twice', async () => {
    const a = await add('A');
    const batch = await applyBatch(ctx, '编辑书签', [{ type: 'update', id: a.id, title: 'A2' }]);
    await undoBatch(ctx, batch.id);

    await expect(undoBatch(ctx, batch.id)).rejects.toThrow('已撤销');
  });

  it('follows id mappings when an older batch touches a bookmark that was deleted and restored', async () => {
    const a = await add('A');
    const moveBatch = await applyBatch(ctx, '移动书签', [{ type: 'move', id: a.id, parentId: '1' }]);
    const removeBatch = await applyBatch(ctx, '删除书签', [{ type: 'remove', id: a.id }]);

    await undoBatch(ctx, removeBatch.id);
    expect(await titlesIn('1')).toEqual(['A']);

    expect(await undoBatch(ctx, moveBatch.id)).toEqual({ undone: 1, skipped: 0 });
    expect(await titlesIn('1')).toEqual([]);
    expect(await titlesIn('2')).toEqual(['A']);
  });
});

describe('create', () => {
  const subtree = { title: '开发', children: [{ title: 'A', url: 'https://a.example.com/' }] };

  it('recreates a whole subtree, and undo removes it again', async () => {
    const batch = await applyBatch(ctx, '恢复', [{ type: 'create', parentId: '1', index: 0, node: subtree }]);

    const [folder] = await ctx.api.getChildren('1');
    expect(folder!.title).toBe('开发');
    expect(await titlesIn(folder!.id)).toEqual(['A']);

    expect(await undoBatch(ctx, batch.id)).toEqual({ undone: 1, skipped: 0 });
    expect(await titlesIn('1')).toEqual([]);
  });

  it('keeps the recreated folder on undo when the user has added something to it since', async () => {
    const batch = await applyBatch(ctx, '恢复', [{ type: 'create', parentId: '1', node: subtree }]);
    const [folder] = await ctx.api.getChildren('1');
    await add('手动加的', folder!.id);

    expect(await undoBatch(ctx, batch.id)).toEqual({ undone: 0, skipped: 1 });
    expect(await titlesIn('1')).toEqual(['开发']);
  });
});

describe('applyBatch', () => {
  it('lists batches newest first', async () => {
    const a = await add('A');
    await applyBatch(ctx, '第一次', [{ type: 'update', id: a.id, title: 'A1' }]);
    await applyBatch(ctx, '第二次', [{ type: 'update', id: a.id, title: 'A2' }]);

    expect((await listBatches(ctx)).map((b) => b.label)).toEqual(['第二次', '第一次']);
  });

  it('creates a snapshot before multi-item batches only', async () => {
    const a = await add('A');
    const b = await add('B');

    const single = await applyBatch(ctx, '编辑书签', [{ type: 'update', id: a.id, title: 'A1' }]);
    expect(single.snapshotId).toBeNull();

    const multi = await applyBatch(ctx, '批量删除', [
      { type: 'remove', id: a.id },
      { type: 'remove', id: b.id },
    ]);
    const snapshots = await listSnapshots(ctx);
    expect(snapshots).toHaveLength(1);
    expect(multi.snapshotId).toBe(snapshots[0]!.id);
    expect(snapshots[0]!.bookmarkCount).toBe(2);
  });

  it('saves the completed part when an operation fails midway, so it can still be undone', async () => {
    const a = await add('A');

    await expect(
      applyBatch(ctx, '批量改名', [
        { type: 'update', id: a.id, title: 'A2' },
        { type: 'update', id: 'missing', title: 'X' },
      ]),
    ).rejects.toThrow();

    const [saved] = await listBatches(ctx);
    expect(saved!.ops).toHaveLength(1);
    await undoBatch(ctx, saved!.id);
    expect((await node(a.id)).title).toBe('A');
  });
});

describe('pruneSnapshots', () => {
  const putSnapshots = (createdAts: number[]) =>
    Promise.all(
      createdAts.map((createdAt, i) =>
        db.put('snapshots', { id: `s${i}`, createdAt, bookmarkCount: 0, tree: [] }),
      ),
    );
  const now = 100 * DAY;
  const range = (n: number) => Array.from({ length: n }, (_, i) => i);

  it('keeps only the newest 20 when all snapshots are older than 30 days', async () => {
    await putSnapshots(range(25).map((i) => now - (40 + i) * DAY));
    await pruneSnapshots({ ...ctx, now: () => now });

    expect(await listSnapshots(ctx)).toHaveLength(20);
  });

  it('keeps every snapshot from the last 30 days even beyond 20', async () => {
    await putSnapshots([...range(25).map((i) => now - i * DAY), ...range(5).map((i) => now - (40 + i) * DAY)]);
    await pruneSnapshots({ ...ctx, now: () => now });

    expect(await listSnapshots(ctx)).toHaveLength(25);
  });
});
