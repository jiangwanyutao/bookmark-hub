import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { cleanTags, MAX_TAGS } from '@/lib/ai/tags';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  tags: string[];
  onSave: (tags: string[]) => Promise<void>;
}

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
      toast.error(`保存标签失败：${err instanceof Error ? err.message : String(err)}`);
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
        {tags.length > 0 ? (
          tags.map((tag) => (
            <Badge key={tag} variant="secondary">
              {tag}
            </Badge>
          ))
        ) : (
          <span className="text-sm text-muted-foreground">还没有标签</span>
        )}
        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setEditing(true)}>
          编辑
        </Button>
      </div>
    </div>
  );
}
