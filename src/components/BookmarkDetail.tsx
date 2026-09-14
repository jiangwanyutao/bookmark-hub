import { MousePointerClick } from 'lucide-react';
import type { Bookmark, FolderOption } from '@/lib/bookmarks';
import { Separator } from '@/components/ui/separator';
import { BookmarkActions } from './BookmarkActions';
import { Favicon } from './Favicon';
import { TagEditor } from './TagEditor';

interface Props {
  bookmark: Bookmark | undefined;
  folders: FolderOption[];
  tags: string[];
  onSaveTags: (tags: string[]) => Promise<void>;
}

export function BookmarkDetail({ bookmark, folders, tags, onSaveTags }: Props) {
  if (!bookmark) {
    return (
      <aside className="flex flex-col items-center justify-center gap-3 rounded-xl border bg-card p-6 text-center shadow-card">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <MousePointerClick className="size-6" />
        </div>
        <p className="text-sm font-medium">选择一个书签</p>
        <p className="max-w-64 text-sm text-muted-foreground">在中间列表里点一个书签，这里会显示网址、目录、标签和操作。</p>
      </aside>
    );
  }

  const fields = [
    { label: '网址', value: bookmark.url },
    { label: '目录', value: bookmark.folderPath },
    {
      label: '添加时间',
      value: bookmark.dateAdded ? new Date(bookmark.dateAdded).toLocaleString('zh-CN') : '—',
    },
  ];

  return (
    <aside className="overflow-auto rounded-xl border bg-card p-5 shadow-card">
      <div className="flex items-start gap-3">
        <Favicon
          key={bookmark.id}
          url={bookmark.url}
          name={bookmark.title || bookmark.domain || bookmark.url}
          className="size-10 rounded-lg border bg-card p-1.5"
        />
        <div className="min-w-0">
          <h2 className="text-base font-semibold break-words tracking-tight">{bookmark.title || '（无标题）'}</h2>
          <p className="truncate text-xs text-muted-foreground">{bookmark.domain || '—'}</p>
        </div>
      </div>
      <BookmarkActions key={bookmark.id} bookmark={bookmark} folders={folders} />
      <Separator className="my-5" />
      <dl className="space-y-3 text-sm">
        {fields.map((f) => (
          <div key={f.label}>
            <dt className="text-xs text-muted-foreground">{f.label}</dt>
            <dd className="mt-0.5 break-all">{f.value}</dd>
          </div>
        ))}
      </dl>
      <Separator className="my-5" />
      <TagEditor key={bookmark.id} tags={tags} onSave={onSaveTags} />
    </aside>
  );
}
