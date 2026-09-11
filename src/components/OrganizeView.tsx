import { useEffect, useState } from 'react';
import type { BookmarkIndex, TreeNode } from '@/lib/bookmarks';
import { loadAiConfig, type AiConfig } from '@/lib/ai/config';
import { Button } from '@/components/ui/button';
import { AiTagsCard } from './AiTagsCard';

interface Props {
  index: BookmarkIndex;
  roots: TreeNode[];
  onOpenSettings: () => void;
}

export function OrganizeView({ index, onOpenSettings }: Props) {
  const [config, setConfig] = useState<AiConfig | null | undefined>(undefined);
  useEffect(() => {
    void loadAiConfig().then(setConfig);
  }, []);
  if (config === undefined) return null;
  if (!config) {
    return (
      <section className="mx-auto max-w-3xl space-y-4 p-8">
        <h1 className="text-2xl font-semibold">智能整理</h1>
        <p className="text-sm text-muted-foreground">先在设置里配置一个 OpenAI 兼容的 AI 服务。</p>
        <Button onClick={onOpenSettings}>去设置</Button>
      </section>
    );
  }
  return (
    <section className="mx-auto max-w-4xl space-y-5 p-8">
      <h1 className="text-2xl font-semibold">智能整理</h1>
      <AiTagsCard index={index} config={config} />
    </section>
  );
}
