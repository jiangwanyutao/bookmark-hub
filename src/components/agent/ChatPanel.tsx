import { useEffect, useState, type FormEvent } from 'react';
import { AlertCircle, Check, Loader2, RotateCcw, Send, Square } from 'lucide-react';
import { useStickToBottomContext } from 'use-stick-to-bottom';
import type { TreeNode } from '@/lib/bookmarks';
import type { PlanScope } from '@/lib/agent/plan';
import type { OrganizeState } from '@/lib/agent/store';
import type { TranscriptItem } from '@/lib/agent/transcript';
import { ChainOfThought, ChainOfThoughtContent, ChainOfThoughtHeader, ChainOfThoughtStep } from '@/components/ai-elements/chain-of-thought';
import { Conversation, ConversationContent, ConversationScrollButton } from '@/components/ai-elements/conversation';
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message';
import { Reasoning, ReasoningContent, ReasoningTrigger } from '@/components/ai-elements/reasoning';
import { Shimmer } from '@/components/ai-elements/shimmer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { ScopePicker } from './ScopePicker';

const STATUS_LABEL: Record<OrganizeState['status'], string> = {
  idle: '等你发话',
  running: '智能体工作中…',
  waiting: '等你回答',
  finished: '已完成，去右侧预览并确认',
  limit: '已暂停',
  error: '出错了',
};

// 状态圆点只是辅助，旁边总有状态文字
const STATUS_DOT: Record<OrganizeState['status'], string> = {
  idle: 'bg-muted-foreground',
  running: 'bg-primary motion-safe:animate-pulse',
  waiting: 'bg-amber-500',
  finished: 'bg-primary',
  limit: 'bg-amber-500',
  error: 'bg-destructive',
};

type ToolItem = Extract<TranscriptItem, { kind: 'tool' }>;
type Block = Exclude<TranscriptItem, ToolItem> | { kind: 'steps'; id: string; steps: ToolItem[] };

const STEP_ICON = { running: Loader2, done: Check, error: AlertCircle };

/** 连续的工具调用合成一条步骤链。 */
function toBlocks(items: TranscriptItem[]): Block[] {
  return items.reduce<Block[]>((blocks, item) => {
    const last = blocks.at(-1);
    if (item.kind !== 'tool') return [...blocks, item];
    if (last?.kind === 'steps') return [...blocks.slice(0, -1), { ...last, steps: [...last.steps, item] }];
    return [...blocks, { kind: 'steps', id: `steps-${item.id}`, steps: [item] }];
  }, []);
}

function Steps({ steps }: { steps: ToolItem[] }) {
  const current = steps.findLast((step) => step.status === 'running');
  return (
    <ChainOfThought defaultOpen>
      <ChainOfThoughtHeader>{current ? <Shimmer duration={1}>{`${current.label}…`}</Shimmer> : `执行了 ${steps.length} 个步骤`}</ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        {steps.map((step) => (
          <ChainOfThoughtStep
            key={step.id}
            icon={STEP_ICON[step.status]}
            label={step.label}
            description={step.detail}
            status={step.status === 'running' ? 'active' : 'complete'}
            className={cn(step.status === 'error' && 'text-destructive', step.status === 'running' && '[&_svg]:motion-safe:animate-spin')}
          />
        ))}
      </ChainOfThoughtContent>
    </ChainOfThought>
  );
}

const thinkingMessage = (streaming: boolean, duration?: number) =>
  streaming ? <Shimmer duration={1}>思考中…</Shimmer> : <p>思考过程{duration ? `（${duration} 秒）` : ''}</p>;

function Row({ block }: { block: Block }) {
  switch (block.kind) {
    case 'user':
      return (
        <Message from="user">
          <MessageContent className="text-base whitespace-pre-wrap">{block.text}</MessageContent>
        </Message>
      );
    case 'assistant':
      if (!block.text && !block.reasoning) return null;
      return (
        <Message from="assistant">
          <MessageContent className="text-base">
            {block.reasoning && (
              <Reasoning isStreaming={block.streaming && !block.text} className="mb-0">
                <ReasoningTrigger getThinkingMessage={thinkingMessage} />
                <ReasoningContent>{block.reasoning}</ReasoningContent>
              </Reasoning>
            )}
            {block.text && <MessageResponse isAnimating={block.streaming}>{block.text}</MessageResponse>}
          </MessageContent>
        </Message>
      );
    case 'steps':
      return <Steps steps={block.steps} />;
    case 'error':
      return (
        <div className="flex gap-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {block.text}
        </div>
      );
  }
}

/** 用户发了消息就滚到底：贴底模式在用户往上翻过之后不会自己回来。 */
function ScrollOnSend({ trigger }: { trigger: number }) {
  const { scrollToBottom } = useStickToBottomContext();
  useEffect(() => {
    void scrollToBottom();
  }, [trigger, scrollToBottom]);
  return null;
}

/** 已经有步骤或回复在动时，不再额外显示「工作中」。 */
function isVisiblyBusy(items: TranscriptItem[]) {
  const last = items.at(-1);
  if (last?.kind === 'tool') return last.status === 'running';
  return last?.kind === 'assistant' && last.streaming && Boolean(last.text || last.reasoning);
}

interface Props {
  state: OrganizeState;
  roots: TreeNode[];
  countByFolder: Map<string, number>;
  onStart: (scope: PlanScope) => void;
  onSend: (text: string) => void;
  onStop: () => void;
  onRetry: () => void;
  onContinue: () => void;
}

export function ChatPanel({ state, roots, countByFolder, onStart, onSend, onStop, onRetry, onContinue }: Props) {
  const [draft, setDraft] = useState('');
  const [sent, setSent] = useState(0);
  const running = state.status === 'running';

  function send(text: string) {
    onSend(text);
    setSent((n) => n + 1);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    send(draft);
    setDraft('');
  }

  if (state.transcript.length === 0 && !running) {
    return <ScopePicker roots={roots} countByFolder={countByFolder} onStart={onStart} />;
  }

  const userCount = state.transcript.filter((item) => item.kind === 'user').length;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-card shadow-card">
      <div className="flex items-center justify-between border-b px-4 py-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <span aria-hidden className={cn('size-2 rounded-full', STATUS_DOT[state.status])} />
          {STATUS_LABEL[state.status]}
        </span>
        <span className="tabular-nums">已用 {state.tokens.toLocaleString('zh-CN')} tokens</span>
      </div>
      <Conversation className="min-h-0" aria-live="polite">
        <ConversationContent className="gap-4">
          {toBlocks(state.transcript).map((block) => (
            <Row key={block.id} block={block} />
          ))}
          {running && !isVisiblyBusy(state.transcript) && <Shimmer duration={1}>智能体工作中…</Shimmer>}
        </ConversationContent>
        <ConversationScrollButton aria-label="滚动到最新" />
        <ScrollOnSend trigger={sent + userCount} />
      </Conversation>
      {state.status === 'waiting' && state.question && (
        <div role="status" className="space-y-2 border-t bg-accent/40 p-4">
          <p className="text-sm font-medium">{state.question.text}</p>
          {state.question.options.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {state.question.options.map((option) => (
                <Button key={option} variant="outline" onClick={() => send(option)}>
                  {option}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}
      {state.status === 'error' && (
        <div className="flex items-center justify-between gap-2 border-t p-3 text-sm text-destructive">
          <span>
            模型调用失败。可以从中断的地方重试；如果是 401 或模型不存在，请检查设置里的 Base URL、API Key 和模型名；如果提示不支持工具调用（tools），请换成
            deepseek-chat、qwen-plus 等支持工具调用的模型。
          </span>
          <Button size="sm" variant="outline" onClick={onRetry}>
            <RotateCcw />
            重试
          </Button>
        </div>
      )}
      {state.status === 'limit' && (
        <div className="flex items-center justify-between gap-2 border-t p-3 text-sm">
          <span>已达到单次整理的模型调用上限，要继续吗？</span>
          <Button size="sm" onClick={onContinue}>
            继续
          </Button>
        </div>
      )}
      <form onSubmit={submit} className="flex gap-2 border-t p-3">
        <Input
          id="agent-input"
          aria-label="对智能体说"
          placeholder={running ? '插话调整，例如：中台并到后端' : '回答问题或提出修改'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <Button type="submit" disabled={!draft.trim()}>
          <Send />
          发送
        </Button>
        {running && (
          <Button type="button" variant="outline" onClick={onStop}>
            <Square />
            停止
          </Button>
        )}
      </form>
    </div>
  );
}
