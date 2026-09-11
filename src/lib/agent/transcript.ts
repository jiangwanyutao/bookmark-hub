import type { AgentEvent, AgentMessage } from '@earendil-works/pi-agent-core';

export type TranscriptItem =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'assistant'; id: string; text: string; streaming: boolean }
  | { kind: 'tool'; id: string; toolCallId: string; label: string; status: 'running' | 'done' | 'error'; detail?: string }
  | { kind: 'error'; id: string; text: string };

const textOf = (message: AgentMessage): string => {
  if (!('content' in message)) return '';
  if (typeof message.content === 'string') return message.content;
  return message.content.map((c) => (c.type === 'text' ? c.text : '')).join('');
};

export function toolLabel(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'ask_user':
      return '向你提问';
    case 'list_folders':
      return '查看目录';
    case 'list_bookmarks':
      return `查看书签（第 ${Number(args.offset ?? 0) + 1} 个起）`;
    case 'set_scope':
      return '确认整理范围';
    case 'propose_taxonomy':
      return `提出分类体系（${Array.isArray(args.categories) ? args.categories.length : 0} 个分类）`;
    case 'assign':
      return `分配 ${Array.isArray(args.refs) ? args.refs.length : 0} 个书签到「${String(args.category ?? '')}」`;
    case 'finish':
      return '完成整理';
    default:
      return name;
  }
}

const replaceLastAssistant = (items: TranscriptItem[], update: (item: Extract<TranscriptItem, { kind: 'assistant' }>) => TranscriptItem | null) => {
  const index = items.findLastIndex((item) => item.kind === 'assistant' && item.streaming);
  if (index === -1) return items;
  const next = update(items[index] as Extract<TranscriptItem, { kind: 'assistant' }>);
  return next ? items.map((item, i) => (i === index ? next : item)) : items.filter((_, i) => i !== index);
};

// 有些 OpenAI 兼容后端会在每次响应里重复同一个 toolCallId（如都叫 call_0），不能拿它当 React key，
// 也不能用来找「是哪一条工具记录该更新」：只更新同一个 toolCallId 里最后一条还在 running 的记录。
const replaceLastRunningTool = (items: TranscriptItem[], toolCallId: string, update: (item: Extract<TranscriptItem, { kind: 'tool' }>) => TranscriptItem) => {
  const index = items.findLastIndex((item) => item.kind === 'tool' && item.toolCallId === toolCallId && item.status === 'running');
  if (index === -1) return items;
  return items.map((item, i) => (i === index ? update(item as Extract<TranscriptItem, { kind: 'tool' }>) : item));
};

/** Agent 事件 → 界面对话记录（不修改入参）。 */
export function applyAgentEvent(items: TranscriptItem[], event: AgentEvent): TranscriptItem[] {
  switch (event.type) {
    case 'message_start':
      if (event.message.role === 'user') return [...items, { kind: 'user', id: `user-${items.length}`, text: textOf(event.message) }];
      if (event.message.role === 'assistant') {
        return [...items, { kind: 'assistant', id: `assistant-${items.length}`, text: '', streaming: true }];
      }
      return items;
    case 'message_update':
      return event.message.role === 'assistant' ? replaceLastAssistant(items, (item) => ({ ...item, text: textOf(event.message) })) : items;
    case 'message_end': {
      if (event.message.role !== 'assistant') return items;
      const { stopReason, errorMessage } = event.message;
      const text = textOf(event.message);
      const settled = replaceLastAssistant(items, (item) => (text ? { ...item, text, streaming: false } : null));
      if (stopReason === 'error') return [...settled, { kind: 'error', id: `error-${settled.length}`, text: errorMessage ?? '模型调用失败' }];
      return settled;
    }
    case 'tool_execution_start':
      return [...items, { kind: 'tool', id: `tool-${items.length}`, toolCallId: event.toolCallId, label: toolLabel(event.toolName, event.args ?? {}), status: 'running' }];
    case 'tool_execution_end': {
      const detail = event.isError ? textOf({ role: 'toolResult', ...event.result } as AgentMessage).split('\n')[0] : undefined;
      return replaceLastRunningTool(items, event.toolCallId, (item) => ({
        ...item,
        status: event.isError ? 'error' : 'done',
        ...(detail ? { detail } : {}),
      }));
    }
    default:
      return items;
  }
}
