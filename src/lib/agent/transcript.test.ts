import { describe, expect, it } from 'vitest';
import type { AgentEvent } from '@earendil-works/pi-agent-core';
import type { AssistantMessage } from '@earendil-works/pi-ai';
import { applyAgentEvent, toolLabel, type TranscriptItem } from './transcript';

const assistant = (text: string, extra: Partial<AssistantMessage> = {}): AssistantMessage => ({
  role: 'assistant',
  content: text ? [{ type: 'text', text }] : [],
  api: 'openai-completions',
  provider: 'user-openai-compatible',
  model: 'm',
  usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
  stopReason: 'stop',
  timestamp: 1,
  ...extra,
});

const reduce = (events: AgentEvent[]) => events.reduce<TranscriptItem[]>(applyAgentEvent, []);

describe('applyAgentEvent', () => {
  it('records the user message and streams the assistant reply', () => {
    const items = reduce([
      { type: 'message_start', message: { role: 'user', content: '开始整理', timestamp: 1 } },
      { type: 'message_start', message: assistant('') },
      { type: 'message_update', message: assistant('我先看'), assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: '我先看', partial: assistant('我先看') } as never },
      { type: 'message_end', message: assistant('我先看看目录。') },
    ]);
    expect(items).toEqual([
      { kind: 'user', id: 'user-0', text: '开始整理' },
      { kind: 'assistant', id: 'assistant-1', text: '我先看看目录。', streaming: false },
    ]);
  });

  it('drops assistant messages that only contained tool calls', () => {
    const items = reduce([
      { type: 'message_start', message: assistant('') },
      { type: 'message_end', message: assistant('', { stopReason: 'toolUse' }) },
    ]);
    expect(items).toEqual([]);
  });

  it('shows one line per tool call with its outcome', () => {
    const items = reduce([
      { type: 'tool_execution_start', toolCallId: 't1', toolName: 'assign', args: { refs: ['b1', 'b2'], category: '教程' } },
      { type: 'tool_execution_end', toolCallId: 't1', toolName: 'assign', result: { content: [{ type: 'text', text: 'ok' }] }, isError: false },
      { type: 'tool_execution_start', toolCallId: 't2', toolName: 'assign', args: { refs: ['b9'], category: '教程' } },
      { type: 'tool_execution_end', toolCallId: 't2', toolName: 'assign', result: { content: [{ type: 'text', text: '编号不存在：b9' }] }, isError: true },
    ]);
    expect(items).toEqual([
      { kind: 'tool', id: 'tool-0', toolCallId: 't1', label: '分配 2 个书签到「教程」', status: 'done' },
      { kind: 'tool', id: 'tool-1', toolCallId: 't2', label: '分配 1 个书签到「教程」', status: 'error', detail: '编号不存在：b9' },
    ]);
  });

  it('tells two tool calls apart even when a backend reuses the same toolCallId', () => {
    const items = reduce([
      { type: 'tool_execution_start', toolCallId: 'call_0', toolName: 'list_folders', args: {} },
      { type: 'tool_execution_end', toolCallId: 'call_0', toolName: 'list_folders', result: { content: [{ type: 'text', text: 'ok' }] }, isError: false },
      { type: 'tool_execution_start', toolCallId: 'call_0', toolName: 'assign', args: { refs: ['b1'], category: '教程' } },
      { type: 'tool_execution_end', toolCallId: 'call_0', toolName: 'assign', result: { content: [{ type: 'text', text: 'ok' }] }, isError: false },
    ]);
    expect(items).toEqual([
      { kind: 'tool', id: 'tool-0', toolCallId: 'call_0', label: '查看目录', status: 'done' },
      { kind: 'tool', id: 'tool-1', toolCallId: 'call_0', label: '分配 1 个书签到「教程」', status: 'done' },
    ]);
  });

  it('turns a failed model call into an error item', () => {
    const items = reduce([
      { type: 'message_start', message: assistant('') },
      { type: 'message_end', message: assistant('', { stopReason: 'error', errorMessage: '401 API Key 无效' }) },
    ]);
    expect(items).toEqual([{ kind: 'error', id: 'error-0', text: '401 API Key 无效' }]);
  });
});

describe('toolLabel', () => {
  it.each([
    ['ask_user', {}, '向你提问'],
    ['list_folders', {}, '查看目录'],
    ['list_bookmarks', { folderId: '2', offset: 50 }, '查看书签（第 51 个起）'],
    ['set_scope', {}, '确认整理范围'],
    ['propose_taxonomy', { categories: ['a', 'b'] }, '提出分类体系（2 个分类）'],
    ['finish', {}, '完成整理'],
  ])('%s', (name, args, label) => {
    expect(toolLabel(name, args)).toBe(label);
  });
});
