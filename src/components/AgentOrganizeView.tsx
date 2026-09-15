import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { RotateCcw, ShieldCheck } from 'lucide-react';
import { Lighthouse } from './brand/Lighthouse';
import type { BookmarkIndex, TreeNode } from '@/lib/bookmarks';
import { loadAiConfig, requestAiHostPermission, type AiConfig } from '@/lib/ai/config';
import type { PlanScope } from '@/lib/agent/plan';
import { PRIVACY_LABEL } from '@/lib/ai/prompt';
import { skipReason } from '@/lib/scan/rules';
import { useOrganizeAgent } from '@/hooks/useOrganizeAgent';
import { useTags } from '@/hooks/useTags';
import { Button } from '@/components/ui/button';
import { AiTagsCard } from './AiTagsCard';
import { PageHeader, pageLayout } from './PageHeader';
import { Pill } from './Pill';
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

  async function start(scope: PlanScope) {
    if (!config) return;
    // 授权须是点击后的第一个 await
    const access = await requestAiHostPermission(config.baseUrl);
    if (access !== 'granted') {
      if (access === 'denied') toast.error('没有获得访问 AI 服务地址的权限，请在弹出的授权框中点允许后再试');
      return;
    }
    try {
      await store.start(config, scope);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  if (config === undefined) return null;
  if (!config) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="flex max-w-md flex-col items-center gap-3 text-center">
          <Lighthouse className="h-24 w-auto" />
          <h1 className="text-xl font-semibold tracking-tight">智能整理</h1>
          <p className="text-sm text-muted-foreground">
            智能体会和你对话，梳理出一套分类体系并按它重排书签。先在设置里配置一个支持工具调用的 OpenAI 兼容服务。
          </p>
          <Button onClick={onOpenSettings}>去设置</Button>
        </div>
      </div>
    );
  }

  return (
    <div className={pageLayout('min-h-[600px]')}>
      <PageHeader
        title="智能整理"
        subtitle="智能体按你勾选的范围提出分类体系，你确认后才会移动书签，执行前自动创建恢复点。"
        actions={
          <>
            <Pill>
              <ShieldCheck className="size-3.5" />
              发送给 AI：{PRIVACY_LABEL[config.privacy]}
            </Pill>
            {state.transcript.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => store.reset()}>
                <RotateCcw />
                重新开始
              </Button>
            )}
          </>
        }
      />

      {/* 对话与方案两栏等高；AI 标签放在右栏底部 */}
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <ChatPanel
          state={state}
          roots={roots}
          countByFolder={index.countByFolder}
          onStart={(scope) => void start(scope)}
          onSend={(text) => void store.send(text)}
          onStop={() => store.stop()}
          onRetry={() => void store.retry()}
          onContinue={() => void store.continueAfterLimit()}
        />
        <div className="flex min-h-0 flex-col gap-4">
          <PlanPanel
            plan={state.plan}
            roots={roots}
            scopeBookmarkIds={scopeIds}
            highlight={state.status === 'finished'}
            onPreview={() => setPreviewOpen(true)}
          />
          <AiTagsCard index={index} config={config} />
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
    </div>
  );
}
