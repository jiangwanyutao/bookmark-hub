import { useEffect, useState } from 'react';
import { Undo2 } from 'lucide-react';
import { listBatches, type Batch, type Op } from '@/lib/history';
import { getHubCtx } from '@/lib/hubContext';
import { undoWithToast } from '@/lib/actions';
import { Button } from '@/components/ui/button';

const ACTION_LABEL: Record<Op['action'], string> = {
  REMOVE: '删除',
  MOVE: '移动',
  UPDATE: '编辑',
};

function summarize(batch: Batch) {
  const counts = new Map<Op['action'], number>();
  for (const op of batch.ops) counts.set(op.action, (counts.get(op.action) ?? 0) + 1);
  return [...counts].map(([action, n]) => `${ACTION_LABEL[action]} ${n} 项`).join('，');
}

export function HistoryView() {
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () =>
    getHubCtx()
      .then(listBatches)
      .then(setBatches, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));

  useEffect(() => {
    void refresh();
  }, []);

  async function handleUndo(batchId: string) {
    if (await undoWithToast(batchId)) await refresh();
  }

  return (
    <section className="mx-auto max-w-3xl space-y-4 p-8">
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
                  {new Date(b.createdAt).toLocaleString('zh-CN')} · {summarize(b)}
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
    </section>
  );
}
