import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Tags } from 'lucide-react';
import type { BookmarkIndex } from '@/lib/bookmarks';
import { requestAiHostPermission, type AiConfig } from '@/lib/ai/config';
import { chatCompletion } from '@/lib/ai/client';
import { estimateRequests } from '@/lib/ai/batches';
import { runTagging } from '@/lib/ai/tags';
import { useTags } from '@/hooks/useTags';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

export function AiTagsCard({ index, config }: { index: BookmarkIndex; config: AiConfig }) {
  const { tags, save } = useTags();
  const [tagging, setTagging] = useState(false);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const untagged = useMemo(() => index.bookmarks.filter((b) => !tags.has(b.url)), [index, tags]);
  const bookmarkById = useMemo(() => new Map(index.bookmarks.map((b) => [b.id, b])), [index]);

  async function generate() {
    // 授权须是点击后的第一个 await
    const access = await requestAiHostPermission(config.baseUrl);
    if (access !== 'granted') {
      if (access === 'denied') toast.error('没有获得访问 AI 服务地址的权限');
      return;
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    setTagging(true);
    setProgress(null);
    try {
      const res = await runTagging(
        (messages) => chatCompletion(config, messages, { signal: controller.signal }),
        { bookmarks: untagged, privacy: config.privacy },
        { signal: controller.signal, onProgress: (done, total) => setProgress([done, total]) },
      );
      const entries = [...res.tags].flatMap(([id, bookmarkTags]): [string, string[]][] => {
        const b = bookmarkById.get(id);
        return b ? [[b.url, bookmarkTags]] : [];
      });
      await save(entries);
      if (res.failures.length > 0) toast.warning(`${res.failures.length} 批请求失败：${res.failures[0]}`);
      else if (!controller.signal.aborted) toast.success(`已为 ${entries.length} 个书签生成标签`);
    } catch (e) {
      toast.error(`生成标签失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTagging(false);
      controllerRef.current = null;
    }
  }

  // 次要功能：右栏底部的小面板
  return (
    <section className="shrink-0 space-y-2.5 rounded-xl border bg-card p-4 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Tags className="size-4 text-muted-foreground" />
          AI 标签
        </h2>
        {tagging ? (
          <Button variant="outline" size="sm" onClick={() => controllerRef.current?.abort()}>
            停止
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled={untagged.length === 0} onClick={() => void generate()}>
            生成标签
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {untagged.length > 0
          ? `${untagged.length} 个书签还没有标签，约 ${estimateRequests(untagged.length)} 次请求。`
          : '所有书签都有标签了。'}
        标签只存在本机，搜索时能按标签找到。
      </p>
      {tagging && progress && (
        <div className="space-y-1.5 text-xs text-muted-foreground">
          <Progress value={(progress[0] / progress[1]) * 100} aria-label="标签生成进度" />
          <p className="tabular-nums">
            第 {progress[0]} / {progress[1]} 批
          </p>
        </div>
      )}
    </section>
  );
}
