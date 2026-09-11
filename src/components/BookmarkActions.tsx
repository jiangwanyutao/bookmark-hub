import { useState, type FormEvent } from 'react';
import { ExternalLink, FolderInput, Pencil, Trash2 } from 'lucide-react';
import type { Bookmark, FolderOption } from '@/lib/bookmarks';
import { runBatch } from '@/lib/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// javascript: 等链接不能从扩展页打开
const OPENABLE = /^(https?|ftp):/i;

type DialogKind = 'edit' | 'move' | 'delete';

interface Props {
  bookmark: Bookmark;
  folders: FolderOption[];
}

export function BookmarkActions({ bookmark, folders }: Props) {
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const onOpenChange = (open: boolean) => {
    if (!open) setDialog(null);
  };
  const name = bookmark.title || bookmark.url;

  return (
    <>
      <div className="mt-5 flex flex-wrap gap-2">
        {OPENABLE.test(bookmark.url) && (
          <Button asChild size="sm">
            <a href={bookmark.url} target="_blank" rel="noreferrer">
              <ExternalLink />
              打开
            </a>
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => setDialog('edit')}>
          <Pencil />
          编辑
        </Button>
        <Button variant="outline" size="sm" onClick={() => setDialog('move')}>
          <FolderInput />
          移动
        </Button>
        <Button variant="outline" size="sm" className="text-destructive" onClick={() => setDialog('delete')}>
          <Trash2 />
          删除
        </Button>
      </div>

      {dialog === 'edit' && <EditDialog bookmark={bookmark} onOpenChange={onOpenChange} />}
      {dialog === 'move' && <MoveDialog bookmark={bookmark} folders={folders} onOpenChange={onOpenChange} />}

      <AlertDialog open={dialog === 'delete'} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除「{name}」？</AlertDialogTitle>
            <AlertDialogDescription>
              可以在「操作记录」里撤销。开启了 Chrome 同步时，删除会同步到你的其他设备。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => void runBatch('删除书签', [{ type: 'remove', id: bookmark.id }], `已删除「${name}」`)}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function isValidUrl(value: string) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function EditDialog({ bookmark, onOpenChange }: { bookmark: Bookmark; onOpenChange: (open: boolean) => void }) {
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const title = String(data.get('title') ?? '').trim();
    const url = String(data.get('url') ?? '').trim();

    if (!isValidUrl(url)) {
      setError('请输入完整网址，例如 https://example.com');
      return;
    }
    if (title === bookmark.title && url === bookmark.url) {
      onOpenChange(false);
      return;
    }
    const ok = await runBatch('编辑书签', [{ type: 'update', id: bookmark.id, title, url }], `已保存「${title || url}」`);
    if (ok) onOpenChange(false);
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>编辑书签</DialogTitle>
          <DialogDescription>保存后可以在「操作记录」里撤销。</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-title">标题</Label>
            <Input id="edit-title" name="title" defaultValue={bookmark.title} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-url">网址</Label>
            <Input id="edit-url" name="url" defaultValue={bookmark.url} aria-invalid={error !== null} />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit">保存</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MoveDialog({
  bookmark,
  folders,
  onOpenChange,
}: {
  bookmark: Bookmark;
  folders: FolderOption[];
  onOpenChange: (open: boolean) => void;
}) {
  const currentParentId = bookmark.ancestorIds.at(-1);
  const [parentId, setParentId] = useState<string>();
  const target = folders.find((f) => f.id === parentId);

  async function handleMove() {
    if (!target) return;
    const ok = await runBatch(
      '移动书签',
      [{ type: 'move', id: bookmark.id, parentId: target.id }],
      `已移动到「${target.path}」`,
    );
    if (ok) onOpenChange(false);
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>移动书签</DialogTitle>
          <DialogDescription>当前位置：{bookmark.folderPath}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="move-folder">移动到</Label>
          <Select value={parentId} onValueChange={setParentId}>
            <SelectTrigger id="move-folder" className="w-full">
              <SelectValue placeholder="选择目录" />
            </SelectTrigger>
            <SelectContent>
              {folders.map((f) => (
                <SelectItem key={f.id} value={f.id} disabled={f.id === currentParentId}>
                  {f.path}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button disabled={!target} onClick={() => void handleMove()}>
            移动
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
