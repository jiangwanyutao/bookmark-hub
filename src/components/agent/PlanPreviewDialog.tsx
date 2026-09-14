import { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import type { TreeNode } from '@/lib/bookmarks';
import { planToIntents } from '@/lib/agent/applyPlan';
import type { OrganizePlan } from '@/lib/agent/plan';
import { runBatch } from '@/lib/actions';
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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: OrganizePlan;
  roots: TreeNode[];
  inScope: (id: string) => boolean;
  bookmarkTitle: (id: string) => string;
}

export function PlanPreviewDialog({ open, onOpenChange, plan, roots, inScope, bookmarkTitle }: Props) {
  const result = useMemo(() => (open && plan.scope ? planToIntents(plan, roots, inScope) : null), [open, plan, roots, inScope]);
  const byCategory = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const [id, category] of Object.entries(plan.assignments)) groups.set(category, [...(groups.get(category) ?? []), id]);
    return [...groups];
  }, [plan]);

  async function confirm() {
    if (!result) return;
    const removed = result.removedFolders > 0 ? `，删除 ${result.removedFolders} 个空目录` : '';
    const skipped = result.skipped > 0 ? `，跳过 ${result.skipped} 个已变动的书签` : '';
    const ok = await runBatch('AI 智能整理', result.intents, `已移动 ${result.moved} 个书签${removed}${skipped}`);
    if (ok) onOpenChange(false);
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>确认整理</AlertDialogTitle>
          <AlertDialogDescription>移空的旧目录会一并删除。执行前会自动创建恢复点，可以在「操作记录」里撤销。开启 Chrome 同步时，改动会同步到其他设备。</AlertDialogDescription>
        </AlertDialogHeader>
        {result && (
          <div className="space-y-3 text-sm">
            <ul className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
              <li className="rounded-lg border p-2">
                <p className="text-lg font-semibold tabular-nums">{result.createdFolders}</p>
                <p className="text-xs text-muted-foreground">新建目录</p>
              </li>
              <li className="rounded-lg border p-2">
                <p className="text-lg font-semibold tabular-nums">{result.moved}</p>
                <p className="text-xs text-muted-foreground">移动书签</p>
              </li>
              <li className="rounded-lg border p-2">
                <p className="text-lg font-semibold tabular-nums">{result.removedFolders}</p>
                <p className="text-xs text-muted-foreground">删除空目录</p>
              </li>
              <li className="rounded-lg border p-2">
                <p className="text-lg font-semibold tabular-nums">{result.skipped}</p>
                <p className="text-xs text-muted-foreground">跳过</p>
              </li>
            </ul>
            <div className="max-h-64 space-y-1 overflow-auto">
              {byCategory.map(([category, ids]) => (
                <details key={category} className="group rounded-md border px-3 py-1.5">
                  <summary className="flex cursor-pointer items-center gap-1.5">
                    <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" />
                    {category}（{ids.length}）
                  </summary>
                  <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                    {ids.map((id) => (
                      <li key={id} className="truncate">
                        {bookmarkTitle(id)}
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction disabled={!result || result.intents.length === 0} onClick={() => void confirm()}>
            确认整理
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
