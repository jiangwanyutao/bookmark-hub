import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { BookmarkIndex, TreeNode } from '@/lib/bookmarks';
import { loadAiConfig, requestAiHostPermission, type AiConfig } from '@/lib/ai/config';
import { PRIVACY_LABEL } from '@/lib/ai/prompt';
import { skipReason } from '@/lib/scan/rules';
import { useOrganizeAgent } from '@/hooks/useOrganizeAgent';
import { useTags } from '@/hooks/useTags';
import { Button } from '@/components/ui/button';
import { AiTagsCard } from './AiTagsCard';
import { ChatPanel } from './agent/ChatPanel';
import { PlanPanel } from './agent/PlanPanel';
import { PlanPreviewDialog } from './agent/PlanPreviewDialog';

interface Props {
  index: BookmarkIndex;
  roots: TreeNode[];
  onOpenSettings: () => void;
}

export function AgentOrganizeView({ index, roots, onOpenSettings }: Props) {
  const [config, setConfig] = useState<AiConfig | null | undefined>(undefined);
  const [previewOpen, setPreviewOpen] = useState(false);
  const { tags } = useTags();
  const { state, store } = useOrganizeAgent(roots, tags);

  useEffect(() => {
    void loadAiConfig().then(setConfig);
  }, []);

  const scopeIds = useMemo(() => {
    const folders = state.plan.scope?.folderIds ?? [];
    return index.bookmarks
      .filter((b) => b.ancestorIds.some((a) => folders.includes(a)) && skipReason(b.url) !== 'intranet')
      .map((b) => b.id);
  }, [index, state.plan.scope]);
  const inScope = useMemo(() => {
    const ids = new Set(scopeIds);
    return (id: string) => ids.has(id);
  }, [scopeIds]);
  const bookmarkTitle = useMemo(() => {
    const titles = new Map(index.bookmarks.map((b) => [b.id, b.title || b.url]));
    return (id: string) => titles.get(id) ?? id;
  }, [index]);

  async function start() {
    if (!config) return;
    // 授权须是点击后的第一个 await
    const access = await requestAiHostPermission(config.baseUrl);
    if (access !== 'granted') {
      if (access === 'denied') toast.error('没有获得访问 AI 服务地址的权限');
      return;
    }
    await store.start(config);
  }

  if (config === undefined) return null;
  if (!config) {
    return (
      <section className="mx-auto max-w-3xl space-y-4 p-8">
        <h1 className="text-2xl font-semibold">智能整理</h1>
        <p className="text-sm text-muted-foreground">
          智能体会和你对话，梳理出一套分类体系并按它重排书签。先在设置里配置一个支持工具调用的 OpenAI 兼容服务。
        </p>
        <Button onClick={onOpenSettings}>去设置</Button>
      </section>
    );
  }

  return (
    <section className="space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">智能整理</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          智能体会问清范围、提出分类体系，你确认后才会移动书签，执行前自动创建恢复点。当前发送给 AI：{PRIVACY_LABEL[config.privacy]}。
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <ChatPanel
          state={state}
          onStart={() => void start()}
          onSend={(text) => void store.send(text)}
          onStop={() => store.stop()}
          onRetry={() => void store.retry()}
          onContinue={() => void store.continueAfterLimit()}
        />
        <div className="space-y-3">
          <PlanPanel
            plan={state.plan}
            roots={roots}
            scopeBookmarkIds={scopeIds}
            highlight={state.status === 'finished'}
            onPreview={() => setPreviewOpen(true)}
          />
          {state.transcript.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => store.reset()}>
              重新开始
            </Button>
          )}
        </div>
      </div>
      <PlanPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        plan={state.plan}
        roots={roots}
        inScope={inScope}
        bookmarkTitle={bookmarkTitle}
      />
      <AiTagsCard index={index} config={config} />
    </section>
  );
}
