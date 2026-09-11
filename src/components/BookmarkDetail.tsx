import { ExternalLink } from 'lucide-react';
import type { Bookmark } from '@/lib/bookmarks';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

// javascript: 等链接不能从扩展页打开
const OPENABLE = /^(https?|ftp):/i;

export function BookmarkDetail({ bookmark }: { bookmark: Bookmark | undefined }) {
  if (!bookmark) {
    return (
      <aside className="flex items-center justify-center border-l p-5 text-sm text-muted-foreground">
        选择一个书签查看详情
      </aside>
    );
  }

  const fields = [
    { label: '网址', value: bookmark.url },
    { label: '网站', value: bookmark.domain || '—' },
    { label: '目录', value: bookmark.folderPath },
    {
      label: '添加时间',
      value: bookmark.dateAdded ? new Date(bookmark.dateAdded).toLocaleString('zh-CN') : '—',
    },
  ];

  return (
    <aside className="overflow-auto border-l p-5">
      <h2 className="font-semibold break-words">{bookmark.title || '（无标题）'}</h2>
      <Separator className="my-4" />
      <dl className="space-y-3 text-sm">
        {fields.map((f) => (
          <div key={f.label}>
            <dt className="text-xs text-muted-foreground">{f.label}</dt>
            <dd className="break-all">{f.value}</dd>
          </div>
        ))}
      </dl>
      {OPENABLE.test(bookmark.url) && (
        <Button asChild size="sm" className="mt-5">
          <a href={bookmark.url} target="_blank" rel="noreferrer">
            <ExternalLink />
            打开
          </a>
        </Button>
      )}
    </aside>
  );
}
