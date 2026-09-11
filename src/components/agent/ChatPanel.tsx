import { useState, type FormEvent } from 'react';
import { AlertCircle, Bot, Check, Loader2, RotateCcw, Send, Square } from 'lucide-react';
import type { OrganizeState } from '@/lib/agent/store';
import type { TranscriptItem } from '@/lib/agent/transcript';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const STATUS_LABEL: Record<OrganizeState['status'], string> = {
  idle: '等你发话',
  running: '智能体工作中…',
  waiting: '等你回答',
  finished: '已完成，去右侧预览并确认',
  limit: '已暂停',
  error: '出错了',
};

function Row({ item }: { item: TranscriptItem }) {
  switch (item.kind) {
    case 'user':
      return (
        <li className="flex justify-end">
          <span className="max-w-[80%] rounded-2xl bg-primary px-3 py-2 text-sm whitespace-pre-wrap text-primary-foreground">{item.text}</span>
        </li>
      );
    case 'assistant':
      return (
        <li className="flex gap-2">
          <Bot className="mt-1 size-4 shrink-0 text-primary" />
          <span className="max-w-[85%] text-sm whitespace-pre-wrap">
            {item.text}
            {item.streaming && <span className="motion-safe:animate-pulse">▍</span>}
          </span>
        </li>
      );
    case 'tool':
      return (
        <li className="flex items-center gap-2 pl-6 text-xs text-muted-foreground">
          {item.status === 'running' && <Loader2 className="size-3.5 animate-spin" />}
          {item.status === 'done' && <Check className="size-3.5" />}
          {item.status === 'error' && <AlertCircle className="size-3.5 text-destructive" />}
          <span>{item.label}</span>
          {item.detail && <span className="text-destructive">：{item.detail}</span>}
        </li>
      );
    case 'error':
      return (
        <li className="flex gap-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {item.text}
        </li>
      );
  }
}

interface Props {
  state: OrganizeState;
  onStart: () => void;
  onSend: (text: string) => void;
  onStop: () => void;
  onRetry: () => void;
  onContinue: () => void;
}

export function ChatPanel({ state, onStart, onSend, onStop, onRetry, onContinue }: Props) {
  const [draft, setDraft] = useState('');
  const running = state.status === 'running';

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    onSend(draft);
    setDraft('');
  }

  if (state.transcript.length === 0 && !running) {
    return (
      <div className="flex min-h-[480px] flex-col items-center justify-center gap-3 rounded-xl border p-8 text-center">
        <Bot className="size-8 text-primary" />
        <p className="max-w-md text-sm text-muted-foreground">
          智能体会先问你要整理哪些目录，然后提出分类体系；过程中你可以随时插话调整，确认后才会移动书签。
        </p>
        <Button onClick={onStart}>开始整理</Button>
      </div>
    );
  }

  return (
    <div className="flex h-[70vh] min-h-[480px] flex-col rounded-xl border">
      <div className="flex items-center justify-between border-b px-4 py-2 text-xs text-muted-foreground">
        <span>{STATUS_LABEL[state.status]}</span>
        <span className="tabular-nums">已用 {state.tokens.toLocaleString('zh-CN')} tokens</span>
      </div>
      <ol className="flex-1 space-y-3 overflow-auto p-4" aria-live="polite">
        {state.transcript.map((item) => (
          <Row key={item.id} item={item} />
        ))}
      </ol>
      {state.status === 'waiting' && state.question && (
        <div className="space-y-2 border-t bg-accent/40 p-4">
          <p className="text-sm font-medium">{state.question.text}</p>
          {state.question.options.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {state.question.options.map((option) => (
                <Button key={option} size="sm" variant="outline" onClick={() => onSend(option)}>
                  {option}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}
      {state.status === 'error' && (
        <div className="flex items-center justify-between gap-2 border-t p-3 text-sm text-destructive">
          <span>模型调用失败，可以从中断的地方重试。如果提示不支持工具调用（tools），请在设置里换成 deepseek-chat、qwen-plus 等支持工具调用的模型。</span>
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
