import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { cleanTags, MAX_TAGS } from '@/lib/ai/tags';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  tags: string[];
  onSave: (tags: string[]) => Promise<void>;
}

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function TagEditor({ tags, onSave }: Props) {
  const [editing, setEditing] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = String(new FormData(e.currentTarget).get('tags') ?? '');
    try {
      await onSave(cleanTags(value.split(/[,，、]+/)));
      setEditing(false);
      toast.success('已保存标签');
    } catch (err) {
      toast.error(`保存标签失败：${errorMessage(err)}`);
    }
  }

  // 标签是低风险数据，删除直接保存，不再确认
  async function handleRemove(tag: string) {
    try {
      await onSave(tags.filter((t) => t !== tag));
    } catch (err) {
      toast.error(`删除标签失败：${errorMessage(err)}`);
    }
  }

  if (editing) {
    return (
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-2">
        <Label htmlFor="tag-input" className="text-xs text-muted-foreground">
          标签（用逗号分隔，最多 {MAX_TAGS} 个）
        </Label>
        <Input id="tag-input" name="tags" defaultValue={tags.join('，')} autoFocus />
        <div className="flex gap-2">
          <Button type="submit" size="sm">
            保存
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
            取消
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">标签</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-muted py-0.5 pr-1 pl-2 text-xs font-medium text-muted-foreground">
            {tag}
            <button
              type="button"
              aria-label={`删除标签 ${tag}`}
              className="rounded-full p-0.5 outline-none hover:bg-background/80 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => void handleRemove(tag)}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-full border border-dashed px-2 py-0.5 text-xs text-muted-foreground outline-none hover:border-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
        >
          + 添加
        </button>
      </div>
    </div>
  );
}
