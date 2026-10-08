import { useEffect, useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { getHubCtx } from '@/lib/hubContext';
import { getArchive, type Archive } from '@/lib/archive';
import { sanitizeArticle } from '@/lib/reader';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Props {
  url: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** 阅读视图：显示本机存档的正文，原网页失效了也能看。 */
export function ReaderDialog({ url, open, onOpenChange }: Props) {
  // undefined = 读取中，null = 没有存档
  const [archive, setArchive] = useState<Archive | null | undefined>();

  useEffect(() => {
    if (!open) return;
    let live = true;
    setArchive(undefined);
    void getHubCtx()
      .then(({ db }) => getArchive(db, url))
      .then((a) => live && setArchive(a ?? null));
    return () => {
      live = false;
    };
  }, [open, url]);

  const html = useMemo(() => (archive ? sanitizeArticle(archive.content) : ''), [archive]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100vh-4rem)] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="pr-6 leading-snug">{archive?.title ?? '阅读'}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-x-3">
            {archive && <span>{new Date(archive.archivedAt).toLocaleString('zh-CN')} 存档</span>}
            <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline-offset-2 hover:underline">
              <ExternalLink className="size-3.5" />
              打开原网页
            </a>
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto pr-2">
          {archive === null && <p className="text-sm text-muted-foreground">这个网页还没存档。</p>}
          {archive && <article className="reader" dangerouslySetInnerHTML={{ __html: html }} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
