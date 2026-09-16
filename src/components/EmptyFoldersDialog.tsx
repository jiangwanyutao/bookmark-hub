import { useState } from 'react';
import type { EmptyFolder } from '@/lib/emptyFolders';
import { runBatch } from '@/lib/actions';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Props {
  folders: EmptyFolder[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** 确认要删掉哪些空目录。默认全选，删除记进操作记录，可以撤销。 */
export function EmptyFoldersDialog({ folders, open, onOpenChange }: Props) {
  // null 表示还没动过勾选，默认全选
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [busy, setBusy] = useState(false);

  const selection = picked ?? new Set(folders.map((f) => f.id));
  const selected = folders.filter((f) => selection.has(f.id));
  // 含在里面的空子目录会跟着一起删
  const totalFolders = selected.reduce((sum, f) => sum + f.folderCount, 0);

  const toggle = (id: string, on: boolean) => {
    const next = new Set(selection);
    if (on) next.add(id);
    else next.delete(id);
    setPicked(next);
  };

  async function confirm() {
    setBusy(true);
    try {
      const ok = await runBatch(
        '清理空文件夹',
        selected.map((f) => ({ type: 'remove' as const, id: f.id })),
        `已删除 ${totalFolders} 个空文件夹`,
      );
      if (ok) {
        setPicked(null);
        onOpenChange(false);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>清理空文件夹</DialogTitle>
          <DialogDescription>
            这些文件夹里一个书签都没有。只装着空文件夹的也算在内，删除后可以在「操作记录」里撤销。
          </DialogDescription>
        </DialogHeader>

        <ul className="max-h-72 divide-y overflow-auto rounded-lg border">
          {folders.map((f) => {
            const id = `empty-${f.id}`;
            return (
              <li key={f.id} className="flex items-center gap-3 px-3 py-2">
                <Checkbox id={id} checked={selection.has(f.id)} onCheckedChange={(on) => toggle(f.id, on === true)} />
                <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
                  <span className="block truncate text-sm font-medium">{f.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {f.path}
                    {f.folderCount > 1 && ` · 含 ${f.folderCount - 1} 个空子目录`}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            variant="destructive"
            disabled={busy || selected.length === 0}
            onClick={() => void confirm()}
          >
            删除 {totalFolders} 个文件夹
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
