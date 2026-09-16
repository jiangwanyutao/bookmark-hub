import { useEffect, useState, type ComponentType } from 'react';
import { toast } from 'sonner';
import { ArchiveRestore, CircleDot, CornerUpRight, Download, Pencil, Plus, Sparkles, Trash2, Undo2 } from 'lucide-react';
import { browser } from 'wxt/browser';
import { clockTime, groupByDay, relativeTime } from '@/lib/relativeTime';
import { buildIndex } from '@/lib/bookmarks';
import { listBatches, listSnapshots, type Batch, type Op, type Snapshot } from '@/lib/history';
import { diffSnapshot, toRestoreIntents, type SnapshotDiff } from '@/lib/snapshotDiff';
import { buildBookmarkHtml, downloadFile, exportFileName } from '@/lib/exportHtml';
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
import { cn } from '@/lib/utils';
import { ImportBookmarksButton } from './ImportBookmarksButton';
import { PageHeader, pageLayout } from './PageHeader';
import { Panel } from './Panel';
import { Pill } from './Pill';

/** 导出成浏览器通用的书签文件，可以直接导回任何浏览器。 */
async function exportBookmarks() {
  try {
    const [root] = await browser.bookmarks.getTree();
    const roots = root?.children ?? [];
    const count = buildIndex(roots).bookmarks.length;
    downloadFile(buildBookmarkHtml(roots), exportFileName(new Date()));
    toast.success(`已导出 ${count} 个书签`, { description: '这个文件可以在任何浏览器里「导入书签」。' });
  } catch (e) {
    toast.error(`导出失败：${e instanceof Error ? e.message : String(e)}`);
  }
}

const ACTION_LABEL: Record<Op['action'], string> = {
  REMOVE: '删除',
  MOVE: '移动',
  UPDATE: '编辑',
  CREATE: '新建',
};

type Icon = ComponentType<{ className?: string }>;

const ACTION_ICON: Record<Op['action'], Icon> = {
  REMOVE: Trash2,
  MOVE: CornerUpRight,
  UPDATE: Pencil,
  CREATE: Plus,
};

// 智能整理的批次标签含「整理」，用它自己的图标；否则按第一个操作的类型
const batchIcon = (batch: Batch): Icon =>
  batch.label.includes('整理') ? Sparkles : batch.ops[0] ? ACTION_ICON[batch.ops[0].action] : CircleDot;

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
    <div className={pageLayout()}>
      <PageHeader
        title="操作记录"
        subtitle="每次批量改动都记在这里，可以单独撤销。撤销时会跳过你之后在浏览器里手动改过的书签。想把别的浏览器的书签搬过来，先在那边「导出书签」存成 HTML，再点这里的「导入书签」。"
        actions={
          <>
            <ImportBookmarksButton />
            <Button variant="outline" onClick={() => void exportBookmarks()}>
              <Download />
              导出书签
            </Button>
          </>
        }
      />

      {/* 左右两块等高：操作时间线 + 恢复点，各自在面板内滚动 */}
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <Panel title="批量操作" meta={batches ? `${batches.length} 次` : undefined} bodyClassName="overflow-auto">
          {error && <p className="p-4 text-sm text-destructive">读取操作记录失败：{error}</p>}
          {batches?.length === 0 && <p className="p-4 text-sm text-muted-foreground">还没有操作记录。编辑、移动、删除书签后会出现在这里。</p>}
          {batches && batches.length > 0 && (
            // 时间线按天分组；圆点带操作类型图标，已撤销的变灰
            <div className="py-3">
              {groupByDay(batches, (b) => b.createdAt).map((day, i) => (
                <div key={`${day.label}-${i}`} className="mb-4 last:mb-0">
                  <p className="mb-1 px-5 text-xs font-medium text-muted-foreground">{day.label}</p>
                  <ol className="mx-5 border-l">
                    {day.items.map((b) => {
                      const undone = b.undoneAt !== null;
                      const DotIcon = batchIcon(b);
                      return (
                        <li key={b.id} className="relative flex items-center justify-between gap-4 py-2.5 pl-5">
                          <span
                            aria-hidden
                            className={cn(
                              'absolute top-1/2 -left-[9px] flex size-4 -translate-y-1/2 items-center justify-center rounded-full ring-4 ring-card',
                              undone ? 'bg-muted-foreground/40 text-card' : 'bg-primary text-primary-foreground',
                            )}
                          >
                            <DotIcon className="size-2.5" />
                          </span>
                          <div className="min-w-0">
                            <p className={cn('text-sm font-medium', undone && 'text-muted-foreground')}>{b.label}</p>
                            <p className="text-xs text-muted-foreground">
                              <time dateTime={new Date(b.createdAt).toISOString()} title={formatTime(b.createdAt)} className="tabular-nums">
                                {clockTime(b.createdAt)}
                              </time>{' '}
                              · {summarize(b)}
                              {b.snapshotId && ' · 已创建恢复点'}
                            </p>
                          </div>
                          {undone ? (
                            <Pill>已撤销</Pill>
                          ) : (
                            <Button variant="outline" size="sm" className="shrink-0" onClick={() => void handleUndo(b.id)}>
                              <Undo2 />
                              撤销
                            </Button>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="恢复点" meta={`${snapshots.length} 份`} bodyClassName="flex flex-col">
          <p className="shrink-0 border-b px-4 py-2.5 text-xs text-muted-foreground">
            批量操作前自动创建，保留最近 20 份及 30 天内的全部。恢复前先展示差异，不会删除之后新增的书签。
          </p>
          {snapshots.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">还没有恢复点。第一次批量删除、移动或整理时会自动创建。</p>
          ) : (
            <ul className="min-h-0 flex-1 divide-y overflow-auto">
              {snapshots.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <ArchiveRestore className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium tabular-nums">{formatTime(s.createdAt)}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {relativeTime(s.createdAt)} · 当时有 {s.bookmarkCount.toLocaleString('zh-CN')} 个书签
                      </p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="shrink-0" onClick={() => void openPreview(s)}>
                    对比并恢复
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
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
    </div>
  );
}
