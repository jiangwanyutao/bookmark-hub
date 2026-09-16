import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Upload } from 'lucide-react';
import { browser } from 'wxt/browser';
import { buildIndex } from '@/lib/bookmarks';
import { parseBookmarkHtml, planImport, type ImportPlan } from '@/lib/importHtml';
import { runBatch } from '@/lib/actions';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

interface Parsed {
  fileName: string;
  /** 文件里解析出来的书签树 */
  roots: ReturnType<typeof parseBookmarkHtml>;
  existingUrls: Set<string>;
}

/**
 * 从别的浏览器导出的书签文件里导入。
 * 浏览器扩展读不到别的浏览器的书签文件，所以要用户先在那边「导出书签」，再到这里选文件。
 */
export function ImportBookmarksButton() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [skipExisting, setSkipExisting] = useState(true);
  const [busy, setBusy] = useState(false);

  const plan: ImportPlan | null = parsed && planImport(parsed.roots, parsed.existingUrls, { skipExisting });

  async function onPick(file: File) {
    try {
      const [root] = await browser.bookmarks.getTree();
      const existingUrls = new Set(buildIndex(root?.children ?? []).bookmarks.map((b) => b.url));
      const roots = parseBookmarkHtml(await file.text());
      if (roots.length === 0) {
        toast.error('这个文件里没有书签', { description: '请选择浏览器「导出书签」生成的 HTML 文件。' });
        return;
      }
      setParsed({ fileName: file.name, roots, existingUrls });
    } catch (e) {
      toast.error(`读取失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function confirm() {
    if (!plan || plan.newCount === 0) return;
    setBusy(true);
    try {
      // 整棵树一条 create，撤销时整体删掉；书签栏 id 固定是 '1'
      const ok = await runBatch('导入书签', [{ type: 'create', parentId: '1', node: plan.node }], `已导入 ${plan.newCount} 个书签`);
      if (ok) setParsed(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".html,.htm,text/html"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void onPick(file);
        }}
      />
      <Button variant="outline" onClick={() => fileRef.current?.click()}>
        <Upload />
        导入书签
      </Button>

      <Dialog open={parsed !== null} onOpenChange={(open) => !open && setParsed(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>导入 {parsed?.fileName}</DialogTitle>
            <DialogDescription>
              {plan && (
                <>
                  文件里有 {plan.newCount + (skipExisting ? plan.existingCount : 0)} 个书签
                  {plan.existingCount > 0 && `，其中 ${plan.existingCount} 个你已经收藏过`}。
                  导入后会放进「{plan.node.title}」目录，可以在这一页撤销。
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <RadioGroup value={skipExisting ? 'skip' : 'all'} onValueChange={(v) => setSkipExisting(v === 'skip')} className="gap-3">
            <div className="flex items-start gap-3">
              <RadioGroupItem value="skip" id="import-skip" className="mt-0.5" />
              <Label htmlFor="import-skip" className="flex-col items-start gap-0.5 font-normal">
                <span className="font-medium">只导入没有的（推荐）</span>
                <span className="text-xs text-muted-foreground">已经收藏过的跳过，不会产生重复书签</span>
              </Label>
            </div>
            <div className="flex items-start gap-3">
              <RadioGroupItem value="all" id="import-all" className="mt-0.5" />
              <Label htmlFor="import-all" className="flex-col items-start gap-0.5 font-normal">
                <span className="font-medium">全部导入</span>
                <span className="text-xs text-muted-foreground">连同已有的一起导入，之后可以在「重复书签」里清理</span>
              </Label>
            </div>
          </RadioGroup>

          <DialogFooter>
            <Button variant="outline" onClick={() => setParsed(null)}>
              取消
            </Button>
            <Button disabled={busy || plan?.newCount === 0} onClick={() => void confirm()}>
              {plan?.newCount === 0 ? '没有要导入的' : `导入 ${plan?.newCount ?? 0} 个书签`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
