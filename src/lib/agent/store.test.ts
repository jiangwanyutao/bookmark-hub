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

  it('delivers a message steered mid-turn once the pausing turn (finish) settles', async () => {
    const { faux, store } = setup();
    let secondCallContext: unknown;
    faux.setResponses([
      () => {
        // 模拟用户在这一轮流式返回期间打字：此时 store 状态仍是 running，
        // send() 会走 agent.steer() 而不是重新 prompt()。
        void store.send('中台并到后端');
        return call('finish', { summary: '先这样' }, 't1');
      },
      (context) => {
        secondCallContext = context;
        return fauxAssistantMessage('收到，按你的意见调整');
      },
    ]);

    await store.start(config);

    expect(faux.state.callCount).toBe(2);
    expect(JSON.stringify(secondCallContext)).toContain('中台并到后端');
    expect(store.getState().status).not.toBe('finished');
  });

  it('typing past the model-call limit also continues (grants more calls first)', async () => {
    // maxModelCalls=2：不清零计数的话，发消息后只够再打 1 通就再次撞上限。
    const { faux, store } = setup(2);
    faux.setResponses([
      call('list_folders', {}, 'l1'),
      call('list_folders', {}, 'l2'),
      call('list_folders', {}, 'l3'),
      fauxAssistantMessage('继续完成'),
    ]);

    await store.start(config);
    expect(store.getState().status).toBe('limit');
    expect(faux.state.callCount).toBe(2);

    await store.send('继续');
    expect(store.getState().status).toBe('idle');
    expect(faux.state.callCount).toBe(4);
  });

  it('an old run settling after 重新开始 does not clobber the new session', async () => {
    // abort 是协作式的（见 store.ts 里 reset() 的注释）：真实场景里旧请求未必真的
    // 停下——这里用一个不理会 abort signal 的 streamFn 模拟旧请求迟到但正常返回一次
    // 工具调用（撞上 maxModelCalls=1 的上限，与是否真的执行了工具无关），逼出 run()
    // 不按 session 校验就直接用旧会话的 pause 覆盖新会话状态的 bug。两个会话各用一个
    // 独立的 faux provider，避免共享同一个响应队列而互相偷走对方的响应。
    const faux1 = fauxProvider({ tokensPerSecond: 100000, provider: 'faux1' });
    const faux2 = fauxProvider({ tokensPerSecond: 100000, provider: 'faux2' });
    const models = createModels();
    models.setProvider(faux1.provider);
    models.setProvider(faux2.provider);
    let startCount = 0;
    let releaseFirst: () => void = () => {};
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const store = createOrganizeStore({
      getRoots: () => roots,
      getTags: () => new Map(),
      maxModelCalls: 1,
      createModel: () => {
        startCount += 1;
        const ignoresAbort = startCount === 1;
        const faux = ignoresAbort ? faux1 : faux2;
        return {
          model: faux.getModel(),
          streamFn: (model, context, options) =>
            models.streamSimple(model, context, ignoresAbort ? { ...options, signal: undefined } : options),
        };
      },
    });

    faux1.setResponses([
      async () => {
        await firstGate;
        return call('list_folders', {}, 't1');
      },
    ]);
    const firstStart = store.start(config);

    faux2.setResponses([call('ask_user', { question: '整理哪些目录？' }, 't1')]);
    await store.start(config); // 重新开始：旧的 prompt 还没落定
    expect(store.getState().status).toBe('waiting');

    releaseFirst();
    await firstStart; // 让第一次请求（本该已被 abort，但迟到地正常返回）真正落定

    expect(store.getState().status).toBe('waiting');
    expect(store.getState().question).toEqual({ text: '整理哪些目录？', options: [] });
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
