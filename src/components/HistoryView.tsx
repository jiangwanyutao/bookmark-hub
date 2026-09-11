import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ArchiveRestore, Undo2 } from 'lucide-react';
import { buildIndex } from '@/lib/bookmarks';
import { listBatches, listSnapshots, type Batch, type Op, type Snapshot } from '@/lib/history';
import { diffSnapshot, toRestoreIntents, type SnapshotDiff } from '@/lib/snapshotDiff';
import { getHubCtx } from '@/lib/hubContext';
import { runBatch, undoWithToast } from '@/lib/actions';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const ACTION_LABEL: Record<Op['action'], string> = {
  REMOVE: '删除',
  MOVE: '移动',
  UPDATE: '编辑',
  CREATE: '新建',
};

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
const formatTime = (ms: number) => new Date(ms).toLocaleString('zh-CN');

function summarize(batch: Batch) {
  const counts = new Map<Op['action'], number>();
  for (const op of batch.ops) counts.set(op.action, (counts.get(op.action) ?? 0) + 1);
  return [...counts].map(([action, n]) => `${ACTION_LABEL[action]} ${n} 项`).join('，');
}

export function HistoryView() {
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ snapshot: Snapshot; diff: SnapshotDiff } | null>(null);

  const refresh = async () => {
    try {
      const ctx = await getHubCtx();
      const [b, s] = await Promise.all([listBatches(ctx), listSnapshots(ctx)]);
      setBatches(b);
      setSnapshots(s);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  async function handleUndo(batchId: string) {
    if (await undoWithToast(batchId)) await refresh();
  }

  async function openPreview(snapshot: Snapshot) {
    try {
      const ctx = await getHubCtx();
      const [current, mappings] = await Promise.all([ctx.api.getTree(), ctx.db.getAll('idMap')]);
      const idMap = new Map(mappings.map((m) => [m.oldId, m.newId]));
      setPreview({ snapshot, diff: diffSnapshot(snapshot.tree, current, idMap) });
    } catch (e) {
      toast.error(`读取恢复点失败：${errorMessage(e)}`);
    }
  }

  async function restore() {
    if (!preview) return;
    const intents = toRestoreIntents(preview.diff);
    setPreview(null);
    if (await runBatch('从恢复点恢复', intents, '已从恢复点恢复')) await refresh();
  }

  const diff = preview?.diff;
  const restoredBookmarks = diff ? buildIndex(diff.missing.map((m) => m.node)).bookmarks.length : 0;
  const nothingToRestore = diff ? diff.missing.length + diff.moved.length + diff.changed.length === 0 : true;

  return (
    <section className="mx-auto max-w-3xl space-y-8 p-8">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">操作记录</h1>
          <p className="mt-1 text-sm text-muted-foreground">撤销时会跳过你之后在浏览器里手动改过的书签。</p>
        </div>

        {error && <p className="text-sm text-destructive">读取操作记录失败：{error}</p>}
        {batches?.length === 0 && (
          <p className="text-sm text-muted-foreground">还没有操作记录。编辑、移动、删除书签后会出现在这里。</p>
        )}

        {batches && batches.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {batches.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium">{b.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatTime(b.createdAt)} · {summarize(b)}
                    {b.snapshotId && ' · 已创建恢复点'}
                  </p>
                </div>
                {b.undoneAt !== null ? (
                  <span className="shrink-0 text-xs text-muted-foreground">已撤销</span>
                ) : (
                  <Button variant="outline" size="sm" className="shrink-0" onClick={() => void handleUndo(b.id)}>
                    <Undo2 />
                    撤销
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">恢复点</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            批量操作前自动创建，保留最近 20 份及 30 天内的全部。恢复会先展示差异，不会删除之后新增的书签，恢复本身也可以撤销。
          </p>
        </div>

        {snapshots.length === 0 ? (
          <p className="text-sm text-muted-foreground">还没有恢复点。第一次批量删除、移动或整理时会自动创建。</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {snapshots.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium">{formatTime(s.createdAt)}</p>
                  <p className="text-xs text-muted-foreground">当时有 {s.bookmarkCount.toLocaleString('zh-CN')} 个书签</p>
                </div>
                <Button variant="outline" size="sm" className="shrink-0" onClick={() => void openPreview(s)}>
                  <ArchiveRestore />
                  对比并恢复
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AlertDialog open={preview !== null} onOpenChange={(open) => !open && setPreview(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>从恢复点恢复？</AlertDialogTitle>
            <AlertDialogDescription>
              {preview && `恢复点创建于 ${formatTime(preview.snapshot.createdAt)}，当时有 ${preview.snapshot.bookmarkCount} 个书签。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {diff &&
            (nothingToRestore ? (
              <p className="text-sm">当前书签与这个恢复点一致，不需要恢复。</p>
            ) : (
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {diff.missing.length > 0 && (
                  <li>
                    重建已删除的 {restoredBookmarks} 个书签（{diff.missing.length} 处）
                  </li>
                )}
                {diff.moved.length > 0 && <li>把 {diff.moved.length} 个书签移回原目录</li>}
                {diff.changed.length > 0 && <li>还原 {diff.changed.length} 个标题或网址</li>}
                {diff.added > 0 && <li className="text-muted-foreground">之后新增的 {diff.added} 项保持不变</li>}
              </ul>
            ))}
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction disabled={nothingToRestore} onClick={() => void restore()}>
              恢复
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
