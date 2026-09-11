import type { AgentMessage, StreamFn } from '@earendil-works/pi-agent-core';
import type { Model } from '@earendil-works/pi-ai';
import { buildIndex, type TreeNode } from '../bookmarks';
import type { AiConfig } from '../ai/config';
import { emptyPlan, type OrganizePlan } from './plan';
import { createRefTable } from './refs';
import { createOrganizeSession, type OrganizeSession } from './session';
import { applyAgentEvent, type TranscriptItem } from './transcript';

export type OrganizeStatus = 'idle' | 'running' | 'waiting' | 'finished' | 'limit' | 'error';

export interface OrganizeState {
  status: OrganizeStatus;
  transcript: TranscriptItem[];
  plan: OrganizePlan;
  question: { text: string; options: string[] } | null;
  summary: string | null;
  tokens: number;
}

export interface OrganizeStoreDeps {
  getRoots(): TreeNode[];
  getTags(): Map<string, string[]>;
  createModel(config: AiConfig): { model: Model<any>; streamFn: StreamFn };
  maxModelCalls?: number;
}

export interface OrganizeStore {
  getState(): OrganizeState;
  subscribe(listener: () => void): () => void;
  start(config: AiConfig): Promise<void>;
  send(text: string): Promise<void>;
  stop(): void;
  retry(): Promise<void>;
  continueAfterLimit(): Promise<void>;
  reset(): void;
}

const START_PROMPT = '开始整理';

const initialState = (): OrganizeState => ({
  status: 'idle',
  transcript: [],
  plan: emptyPlan(),
  question: null,
  summary: null,
  tokens: 0,
});

type Pause = { kind: 'ask'; text: string; options: string[] } | { kind: 'finish'; summary: string } | { kind: 'limit' } | null;

const userMessage = (text: string): AgentMessage => ({ role: 'user', content: text, timestamp: Date.now() });

export function createOrganizeStore(deps: OrganizeStoreDeps): OrganizeStore {
  let state = initialState();
  let session: OrganizeSession | null = null;
  let pause: Pause = null;
  let unsubscribeSession: (() => void) | null = null;
  const listeners = new Set<() => void>();

  const set = (patch: Partial<OrganizeState>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };

  const lastFailed = () => {
    const last = session?.agent.state.messages.at(-1);
    return last?.role === 'assistant' && last.stopReason === 'error';
  };

  // 拆成接收 Pause 参数的函数：直接在 run() 里连续判断 pause?.kind 时，TS 会把
  // 闭包里可变的 pause 错误地窄化成 null（编译期 tsc --noEmit 报 kind 在 never 上不存在），
  // 传参重新获得声明类型 Pause 可以绕开这个类型收窄问题，运行时行为不变。
  function statusFromPause(p: Pause): Partial<OrganizeState> {
    if (p?.kind === 'ask') return { status: 'waiting', question: { text: p.text, options: p.options } };
    if (p?.kind === 'finish') return { status: 'finished', summary: p.summary };
    if (p?.kind === 'limit') return { status: 'limit' };
    return { status: 'idle' };
  }

  async function run(step: () => Promise<void>) {
    pause = null;
    set({ status: 'running', question: null });
    try {
      await step();
    } catch (e) {
      // 例如智能体仍在运行时又被调用；不让它变成未处理的 Promise 拒绝
      const text = e instanceof Error ? e.message : String(e);
      return set({ status: 'error', transcript: [...state.transcript, { kind: 'error', id: `error-${state.transcript.length}`, text }] });
    }
    if (lastFailed()) return set({ status: 'error' });
    set(statusFromPause(pause));
  }

  function reset() {
    // 先退订旧会话的事件监听，避免它未处理完的（abort 是协作式的）事件流写进新状态
    unsubscribeSession?.();
    unsubscribeSession = null;
    session?.agent.abort();
    session = null;
    pause = null;
    state = initialState();
    listeners.forEach((listener) => listener());
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async start(config) {
      reset();
      const { model, streamFn } = deps.createModel(config);
      const refs = createRefTable(buildIndex(deps.getRoots()).bookmarks.map((b) => b.id));
      session = createOrganizeSession({
        model,
        streamFn,
        maxModelCalls: deps.maxModelCalls,
        onLimit: () => {
          pause = { kind: 'limit' };
        },
        toolContext: {
          roots: deps.getRoots,
          tags: deps.getTags,
          privacy: config.privacy,
          refs,
          getPlan: () => state.plan,
          setPlan: (plan) => set({ plan }),
          onAsk: (text, options) => {
            pause = { kind: 'ask', text, options };
          },
          onFinish: (summary) => {
            pause = { kind: 'finish', summary };
          },
        },
      });
      unsubscribeSession = session.agent.subscribe((event) => {
        const used = event.type === 'message_end' && event.message.role === 'assistant' ? event.message.usage.totalTokens : 0;
        set({ transcript: applyAgentEvent(state.transcript, event), tokens: state.tokens + used });
      });
      const current = session;
      await run(() => current.agent.prompt(START_PROMPT));
    },
    async send(text) {
      const message = text.trim();
      if (!message || !session) return;
      if (state.status === 'running') {
        // 运行中：当前一步完成后生效
        session.agent.steer(userMessage(message));
        return;
      }
      const current = session;
      await run(() => current.agent.prompt(message));
    },
    stop() {
      session?.agent.abort();
    },
    async retry() {
      if (!session) return;
      const current = session;
      if (lastFailed()) current.agent.state.messages = current.agent.state.messages.slice(0, -1);
      await run(() => current.agent.continue());
    },
    async continueAfterLimit() {
      if (!session) return;
      session.grantMoreCalls();
      const current = session;
      await run(() => current.agent.prompt('继续'));
    },
    reset,
  };
}
