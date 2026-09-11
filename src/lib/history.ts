import type { IDBPDatabase } from 'idb';
import type { HubDB } from './db';
import { buildIndex, type TreeNode } from './bookmarks';

/** chrome.bookmarks 中用到的部分；测试时换成内存实现。 */
export interface BookmarksApi {
  getTree(): Promise<TreeNode[]>;
  getSubTree(id: string): Promise<TreeNode[]>;
  get(id: string): Promise<TreeNode[]>;
  getChildren(id: string): Promise<TreeNode[]>;
  create(details: { parentId?: string; index?: number; title?: string; url?: string }): Promise<TreeNode>;
  move(id: string, destination: { parentId?: string; index?: number }): Promise<TreeNode>;
  update(id: string, changes: { title?: string; url?: string }): Promise<TreeNode>;
  remove(id: string): Promise<void>;
  removeTree(id: string): Promise<void>;
}

/** 要新建的节点：没有 url 即为目录；快照里的 TreeNode 可以直接传入。 */
export interface CreateNode {
  title: string;
  url?: string;
  children?: CreateNode[];
}

export type Intent =
  | { type: 'remove'; id: string }
  | { type: 'move'; id: string; parentId: string; index?: number }
  | { type: 'update'; id: string; title?: string; url?: string }
  | { type: 'create'; parentId: string; index?: number; node: CreateNode };

export interface Position {
  parentId: string;
  index: number;
}

export interface Fields {
  title: string;
  url?: string;
}

export type Op =
  | { action: 'REMOVE'; node: TreeNode; parentId: string; index: number }
  | { action: 'MOVE'; id: string; before: Position; after: Position }
  | { action: 'UPDATE'; id: string; before: Fields; after: Fields }
  /** node 是新建出来的整棵子树（新 id），撤销时用来判断用户之后有没有动过 */
  | { action: 'CREATE'; id: string; node: TreeNode };

export interface Batch {
  id: string;
  label: string;
  createdAt: number;
  ops: Op[];
  snapshotId: string | null;
  undoneAt: number | null;
}

export interface Snapshot {
  id: string;
  createdAt: number;
  bookmarkCount: number;
  tree: TreeNode[];
}

/** 撤销删除时浏览器会分配新 id，旧 id → 新 id 记在这里。 */
export interface IdMapping {
  oldId: string;
  newId: string;
  originalDateAdded?: number;
}

export interface Ctx {
  api: BookmarksApi;
  db: IDBPDatabase<HubDB>;
  now: () => number;
}

export interface UndoResult {
  undone: number;
  /** 用户在操作之后又手动改过、或已不存在的条目 */
  skipped: number;
}

const SNAPSHOT_KEEP_COUNT = 20;
const SNAPSHOT_KEEP_MS = 30 * 86_400_000;

const first = (nodes: TreeNode[]) => {
  const node = nodes[0];
  if (!node) throw new Error('找不到这个书签');
  return node;
};

// 浏览器找不到 id 时 get 会抛错，这里视为书签已不存在
async function getNode(api: BookmarksApi, id: string): Promise<TreeNode | undefined> {
  try {
    return (await api.get(id))[0];
  } catch {
    return undefined;
  }
}

const position = (n: TreeNode): Position => ({ parentId: n.parentId!, index: n.index ?? 0 });
const fields = (n: TreeNode): Fields => ({ title: n.title, url: n.url });

async function clampIndex(ctx: Ctx, parentId: string, index: number) {
  return Math.min(index, (await ctx.api.getChildren(parentId)).length);
}

export async function resolveId(ctx: Ctx, id: string): Promise<string> {
  let current = id;
  for (;;) {
    const mapping = await ctx.db.get('idMap', current);
    if (!mapping) return current;
    current = mapping.newId;
  }
}

async function perform(ctx: Ctx, intent: Intent): Promise<Op> {
  switch (intent.type) {
    case 'remove': {
      const node = first(await ctx.api.getSubTree(intent.id));
      if (node.url === undefined) await ctx.api.removeTree(node.id);
      else await ctx.api.remove(node.id);
      return { action: 'REMOVE', node, parentId: node.parentId!, index: node.index ?? 0 };
    }
    case 'move': {
      const before = first(await ctx.api.get(intent.id));
      const after = await ctx.api.move(intent.id, {
        parentId: intent.parentId,
        ...(intent.index !== undefined && { index: await clampIndex(ctx, intent.parentId, intent.index) }),
      });
      return { action: 'MOVE', id: intent.id, before: position(before), after: position(after) };
    }
    case 'update': {
      const before = first(await ctx.api.get(intent.id));
      const after = await ctx.api.update(intent.id, {
        ...(intent.title !== undefined && { title: intent.title }),
        ...(intent.url !== undefined && { url: intent.url }),
      });
      return { action: 'UPDATE', id: intent.id, before: fields(before), after: fields(after) };
    }
    case 'create': {
      const created = await createTree(ctx, intent.node, intent.parentId, intent.index);
      return { action: 'CREATE', id: created.id, node: first(await ctx.api.getSubTree(created.id)) };
    }
  }
}

/**
 * 依次执行一批操作并写入操作记录。多于 1 条时先创建快照。
 * 中途失败会保存已完成的部分（仍可撤销），然后抛出错误。
 */
export async function applyBatch(ctx: Ctx, label: string, intents: Intent[]): Promise<Batch> {
  const snapshotId = intents.length > 1 ? (await createSnapshot(ctx)).id : null;
  const ops: Op[] = [];
  const batch: Batch = { id: crypto.randomUUID(), label, createdAt: ctx.now(), ops, snapshotId, undoneAt: null };

  try {
    for (const intent of intents) ops.push(await perform(ctx, intent));
  } finally {
    if (ops.length > 0) await ctx.db.put('batches', batch);
  }
  return batch;
}

/** 按原结构重建一棵子树；onCreated 在每个节点建好后调用。 */
async function createTree<N extends CreateNode>(
  ctx: Ctx,
  node: N,
  parentId: string,
  index: number | undefined,
  onCreated?: (source: N, created: TreeNode) => Promise<void>,
): Promise<TreeNode> {
  const created = await ctx.api.create({
    parentId,
    ...(index !== undefined && { index: await clampIndex(ctx, parentId, index) }),
    title: node.title,
    ...(node.url !== undefined && { url: node.url }),
  });
  await onCreated?.(node, created);
  for (const child of node.children ?? []) {
    await createTree(ctx, child as N, created.id, undefined, onCreated);
  }
  return created;
}

/** 撤销删除：重建子树，并把旧 id → 新 id 写入映射。 */
async function recreate(ctx: Ctx, node: TreeNode, parentId: string, index: number) {
  await createTree(ctx, node, parentId, index, async (source, created) => {
    // ponytail: 同一书签被删→恢复多次时，这里记的是上一次恢复的时间；要追溯最初时间需给 idMap 加 newId 索引
    await ctx.db.put('idMap', { oldId: source.id, newId: created.id, originalDateAdded: source.dateAdded });
  });
}

async function getSubTreeNode(api: BookmarksApi, id: string): Promise<TreeNode | undefined> {
  try {
    return (await api.getSubTree(id))[0];
  } catch {
    return undefined;
  }
}

const collectIds = (node: TreeNode): string[] => [node.id, ...(node.children ?? []).flatMap(collectIds)];

function sameIds(a: TreeNode, b: TreeNode) {
  const ids = collectIds(a);
  const expected = new Set(collectIds(b));
  return ids.length === expected.size && ids.every((id) => expected.has(id));
}

/** 撤销一条操作；当前状态已不是操作后的样子（用户手动改过）时返回 false。 */
async function undoOp(ctx: Ctx, op: Op): Promise<boolean> {
  switch (op.action) {
    case 'REMOVE': {
      const parentId = await resolveId(ctx, op.parentId);
      if (!(await getNode(ctx.api, parentId))) return false;
      await recreate(ctx, op.node, parentId, op.index);
      return true;
    }
    case 'MOVE': {
      const id = await resolveId(ctx, op.id);
      const current = await getNode(ctx.api, id);
      if (!current || current.parentId !== (await resolveId(ctx, op.after.parentId))) return false;
      const parentId = await resolveId(ctx, op.before.parentId);
      if (!(await getNode(ctx.api, parentId))) return false;
      await ctx.api.move(id, { parentId, index: await clampIndex(ctx, parentId, op.before.index) });
      return true;
    }
    case 'UPDATE': {
      const id = await resolveId(ctx, op.id);
      const current = await getNode(ctx.api, id);
      if (!current || current.title !== op.after.title || current.url !== op.after.url) return false;
      await ctx.api.update(id, {
        title: op.before.title,
        ...(op.before.url !== undefined && { url: op.before.url }),
      });
      return true;
    }
    case 'CREATE': {
      const current = await getSubTreeNode(ctx.api, await resolveId(ctx, op.id));
      // 用户之后往里加过或删过东西，就不动它
      if (!current || !sameIds(current, op.node)) return false;
      if (current.url === undefined) await ctx.api.removeTree(current.id);
      else await ctx.api.remove(current.id);
      return true;
    }
  }
}

/** 按倒序撤销一批操作，跳过用户之后手动改过的条目。 */
export async function undoBatch(ctx: Ctx, batchId: string): Promise<UndoResult> {
  const batch = await ctx.db.get('batches', batchId);
  if (!batch) throw new Error('找不到这条操作记录');
  if (batch.undoneAt !== null) throw new Error('这批操作已撤销');

  let undone = 0;
  let skipped = 0;
  for (const op of [...batch.ops].reverse()) {
    if (await undoOp(ctx, op)) undone += 1;
    else skipped += 1;
  }
  await ctx.db.put('batches', { ...batch, undoneAt: ctx.now() });
  return { undone, skipped };
}

export async function listBatches(ctx: Ctx): Promise<Batch[]> {
  return (await ctx.db.getAllFromIndex('batches', 'createdAt')).reverse();
}

export async function listSnapshots(ctx: Ctx): Promise<Snapshot[]> {
  return (await ctx.db.getAllFromIndex('snapshots', 'createdAt')).reverse();
}

async function createSnapshot(ctx: Ctx): Promise<Snapshot> {
  const tree = await ctx.api.getTree();
  const snapshot: Snapshot = {
    id: crypto.randomUUID(),
    createdAt: ctx.now(),
    bookmarkCount: buildIndex(tree).bookmarks.length,
    tree,
  };
  await ctx.db.put('snapshots', snapshot);
  await pruneSnapshots(ctx);
  return snapshot;
}

/** 保留最新 20 份，以及 30 天内的全部快照。 */
export async function pruneSnapshots(ctx: Ctx): Promise<void> {
  const cutoff = ctx.now() - SNAPSHOT_KEEP_MS;
  const expired = (await listSnapshots(ctx)).filter(
    (s, i) => i >= SNAPSHOT_KEEP_COUNT && s.createdAt < cutoff,
  );
  await Promise.all(expired.map((s) => ctx.db.delete('snapshots', s.id)));
}
