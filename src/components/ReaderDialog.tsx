import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Highlighter, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { getHubCtx } from '@/lib/hubContext';
import { getArchive, type Archive } from '@/lib/archive';
import { sanitizeArticle } from '@/lib/reader';
import { addHighlight, applyHighlights, deleteHighlight, listHighlights, updateNote, type Highlight } from '@/lib/highlights';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Props {
  url: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** 阅读视图：显示本机存档的正文，原网页失效了也能看。选中文字可以高亮、写批注。 */
export function ReaderDialog({ url, open, onOpenChange }: Props) {
  // undefined = 读取中，null = 没有存档
  const [archive, setArchive] = useState<Archive | null | undefined>();
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [selected, setSelected] = useState('');
  const articleRef = useRef<HTMLElement>(null);

  const reloadHighlights = useCallback(async () => {
    const { db } = await getHubCtx();
    setHighlights(await listHighlights(db, url));
  }, [url]);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setArchive(undefined);
    setSelected('');
    void getHubCtx()
      .then(({ db }) => Promise.all([getArchive(db, url), listHighlights(db, url)]))
      .then(([a, list]) => {
        if (!live) return;
        setArchive(a ?? null);
        setHighlights(list);
      });
    return () => {
      live = false;
    };
  }, [open, url]);

  const { html, found } = useMemo(
    () => (archive ? applyHighlights(sanitizeArticle(archive.content), highlights) : { html: '', found: new Set<string>() }),
    [archive, highlights],
  );

  const trackSelection = () => {
    const selection = window.getSelection();
    const inArticle = selection && articleRef.current?.contains(selection.anchorNode);
    setSelected(inArticle ? selection.toString().trim() : '');
  };

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      await reloadHighlights();
    } catch (e) {
      toast.error(`保存失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const highlightSelection = () =>
    run(async () => {
      const { db } = await getHubCtx();
      await addHighlight(db, { url, text: selected }, Date.now());
      window.getSelection()?.removeAllRanges();
      setSelected('');
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100vh-4rem)] flex-col sm:max-w-5xl">
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
        {archive === null && <p className="text-sm text-muted-foreground">这个网页还没存档。</p>}
        {archive && (
          <div className="grid min-h-0 flex-1 gap-4 sm:grid-cols-[minmax(0,1fr)_16rem]">
            <article
              ref={articleRef}
              className="reader min-h-0 overflow-y-auto pr-2"
              onMouseUp={trackSelection}
              onKeyUp={trackSelection}
              dangerouslySetInnerHTML={{ __html: html }}
            />
            <aside aria-label="高亮与批注" className="flex min-h-0 flex-col gap-3 border-t pt-3 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-4">
              <Button size="sm" disabled={!selected} onClick={() => void highlightSelection()}>
                <Highlighter />
                高亮选中的文字
              </Button>
              {highlights.length === 0 && <p className="text-xs text-muted-foreground">在左边正文里选中一段文字，再点上面的按钮。</p>}
              <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto">
                {highlights.map((h) => (
                  <li key={h.id} className="space-y-1.5 rounded-lg border p-2.5 text-sm">
                    <button
                      type="button"
                      className="line-clamp-3 text-left hover:underline"
                      onClick={() => articleRef.current?.querySelector(`mark[data-highlight-id="${h.id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })}
                    >
                      {h.text}
                    </button>
                    {!found.has(h.id) && <p className="text-xs text-muted-foreground">重新存档后原文里找不到这段了</p>}
                    <textarea
                      aria-label="批注"
                      placeholder="写批注…"
                      defaultValue={h.note}
                      rows={2}
                      className="w-full resize-y rounded-md border bg-transparent px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                      // 边打边存：按 Esc 关掉弹窗时不会触发 blur，等失焦再存会丢；不刷新列表，免得重绘正文丢掉选区
                      onChange={(e) => {
                        const note = e.target.value;
                        void getHubCtx()
                          .then(({ db }) => updateNote(db, h.id, note))
                          .catch((err: unknown) => toast.error(`批注保存失败：${err instanceof Error ? err.message : String(err)}`));
                      }}
                    />
                    <div className="flex justify-end">
                      <Button size="xs" variant="ghost" aria-label="删除高亮" onClick={() => void run(async () => deleteHighlight((await getHubCtx()).db, h.id))}>
                        <Trash2 />
                        删除
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </aside>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
