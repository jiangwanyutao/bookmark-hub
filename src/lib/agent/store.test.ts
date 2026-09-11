import { afterEach, describe, expect, it, vi } from 'vitest';
import { Agent } from '@earendil-works/pi-agent-core';
import { createModels, fauxAssistantMessage, fauxProvider, fauxToolCall } from '@earendil-works/pi-ai';
import type { TreeNode } from '../bookmarks';
import { createOrganizeStore } from './store';

const bm = (id: string, title: string, url: string): TreeNode => ({ id, title, url });
const roots: TreeNode[] = [
  {
    id: '0',
    title: '',
    children: [
      { id: '1', title: '书签栏', children: [] },
      { id: '2', title: '其他书签', children: [bm('a', 'React 文档', 'https://react.dev/'), bm('b', 'Go 教程', 'https://go.dev/tour')] },
    ],
  },
];
// a=b1 b=b2
const config = { baseUrl: 'https://example.com/v1', apiKey: 'sk', model: 'm', privacy: 'title_domain' as const };
const call = (name: string, args: Record<string, unknown>, id: string) =>
  fauxAssistantMessage(fauxToolCall(name, args, { id }), { stopReason: 'toolUse' });

function setup(maxModelCalls?: number) {
  const faux = fauxProvider({ tokensPerSecond: 100000 });
  const models = createModels();
  models.setProvider(faux.provider);
  const store = createOrganizeStore({
    getRoots: () => roots,
    getTags: () => new Map(),
    createModel: () => ({ model: faux.getModel(), streamFn: models.streamSimple.bind(models) }),
    maxModelCalls,
  });
  return { faux, store };
}

describe('createOrganizeStore', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('waits for the user after the agent asks a question', async () => {
    const { faux, store } = setup();
    faux.setResponses([call('ask_user', { question: '整理哪些目录？', options: ['其他书签'] }, 't1')]);

    await store.start(config);

    const state = store.getState();
    expect(state.status).toBe('waiting');
    expect(state.question).toEqual({ text: '整理哪些目录？', options: ['其他书签'] });
    expect(state.transcript[0]).toEqual({ kind: 'user', id: 'user-0', text: '开始整理' });
    expect(state.transcript.some((i) => i.kind === 'tool' && i.label === '向你提问')).toBe(true);
  });

  it('finishes with a plan once the user answers', async () => {
    const { faux, store } = setup();
    faux.setResponses([
      call('ask_user', { question: '整理哪些目录？' }, 't1'),
      call('set_scope', { folderIds: ['2'], rootFolderId: '1' }, 't2'),
      call('propose_taxonomy', { categories: ['文档 / 前端', '教程'] }, 't3'),
      call('assign', { refs: ['b1'], category: '文档 / 前端' }, 't4'),
      call('assign', { refs: ['b2'], category: '教程' }, 't5'),
      call('finish', { summary: '分成 2 类' }, 't6'),
    ]);

    await store.start(config);
    await store.send('其他书签，放书签栏下');

    const state = store.getState();
    expect(state.status).toBe('finished');
    expect(state.summary).toBe('分成 2 类');
    expect(state.question).toBeNull();
    expect(state.plan.assignments).toEqual({ a: '文档 / 前端', b: '教程' });
  });

  it('reports model errors and retries from where it stopped', async () => {
    const { faux, store } = setup();
    faux.setResponses([fauxAssistantMessage('', { stopReason: 'error', errorMessage: '401 API Key 无效' }), fauxAssistantMessage('好了')]);

    await store.start(config);
    expect(store.getState().status).toBe('error');
    expect(store.getState().transcript.some((i) => i.kind === 'error' && i.text === '401 API Key 无效')).toBe(true);

    await store.retry();
    expect(store.getState().status).toBe('idle');
    expect(faux.state.callCount).toBe(2);
  });

  it('pauses at the model call limit until the user agrees to continue', async () => {
    const { faux, store } = setup(1);
    faux.setResponses([call('list_folders', {}, 'l1'), fauxAssistantMessage('继续完成')]);

    await store.start(config);
    expect(store.getState().status).toBe('limit');

    await store.continueAfterLimit();
    expect(store.getState().status).toBe('idle');
    expect(faux.state.callCount).toBe(2);
  });

  it('reset clears the conversation', async () => {
    const { faux, store } = setup();
    faux.setResponses([call('ask_user', { question: '范围？' }, 't1')]);
    await store.start(config);
    store.reset();
    expect(store.getState()).toMatchObject({ status: 'idle', transcript: [], question: null, summary: null, tokens: 0 });
  });

  it('unsubscribes the previous session agent listener before starting a new one', async () => {
    // 端到端地让旧会话“迟到”触发监听器很难摆脱真实计时（abort 后流式返回的是空占位消息，
    // 对 transcript/tokens 是天然无副作用的净空操作，测不出区别）；这里直接验证 store.ts
    // 拿到的 unsubscribe 函数确实在 reset() 时被调用——即改动本身生效。
    const originalSubscribe = Agent.prototype.subscribe;
    const unsubscribeSpy = vi.fn();
    vi.spyOn(Agent.prototype, 'subscribe').mockImplementation(function (this: Agent, listener) {
      const unsubscribe = originalSubscribe.call(this, listener);
      return () => {
        unsubscribeSpy();
        unsubscribe();
      };
    });

    const { faux, store } = setup();
    faux.setResponses([fauxAssistantMessage('第一次')]);
    await store.start(config);
    expect(unsubscribeSpy).not.toHaveBeenCalled();

    faux.setResponses([fauxAssistantMessage('第二次')]);
    await store.start(config); // 内部 reset() 应在 abort 旧会话前退订它的监听器
    expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
  });
});
