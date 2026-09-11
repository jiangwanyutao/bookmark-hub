import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createModels, fauxAssistantMessage, fauxProvider, fauxToolCall, type Context } from '@earendil-works/pi-ai';
import { buildIndex, type TreeNode } from '../bookmarks';
import { HANDLED_PLACEHOLDER } from './context';
import { emptyPlan, type OrganizePlan } from './plan';
import { createRefTable } from './refs';
import { createOrganizeSession } from './session';
import type { ToolContext } from './tools';

const bm = (id: string, title: string, url: string): TreeNode => ({ id, title, url });
const roots: TreeNode[] = [
  {
    id: '0',
    title: '',
    children: [
      { id: '1', title: '书签栏', children: [bm('x', 'X', 'https://x.com/')] },
      {
        id: '2',
        title: '其他书签',
        children: [bm('a', 'React 文档', 'https://react.dev/'), bm('b', 'Go 教程', 'https://go.dev/tour'), bm('c', 'MDN', 'https://developer.mozilla.org/')],
      },
    ],
  },
];
// x=b1 a=b2 b=b3 c=b4
const refs = createRefTable(buildIndex(roots).bookmarks.map((bk) => bk.id));

let plan: OrganizePlan;
let toolContext: ToolContext;

beforeEach(() => {
  plan = emptyPlan();
  toolContext = {
    roots: () => roots,
    tags: () => new Map(),
    privacy: 'title_domain',
    refs,
    getPlan: () => plan,
    setPlan: (next) => {
      plan = next;
    },
    onAsk: vi.fn(),
    onFinish: vi.fn(),
  };
});

function start(maxModelCalls?: number, onLimit?: () => void) {
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  const session = createOrganizeSession({
    model: faux.getModel(),
    streamFn: models.streamSimple.bind(models),
    toolContext,
    maxModelCalls,
    onLimit,
  });
  return { faux, session };
}

const call = (name: string, args: Record<string, unknown>, id: string) =>
  fauxAssistantMessage(fauxToolCall(name, args, { id }), { stopReason: 'toolUse' });

describe('createOrganizeSession', () => {
  it('stops after ask_user and continues once the user answers', async () => {
    const { faux, session } = start();
    faux.setResponses([call('ask_user', { question: '整理哪些目录？' }, 't1'), fauxAssistantMessage('好的')]);

    await session.agent.prompt('开始整理');
    expect(faux.state.callCount).toBe(1);
    expect(toolContext.onAsk).toHaveBeenCalledWith('整理哪些目录？', []);

    await session.agent.prompt('其他书签');
    expect(faux.state.callCount).toBe(2);
  });

  it('still stops when ask_user shares a turn with another tool', async () => {
    const { faux, session } = start();
    faux.setResponses([
      fauxAssistantMessage([fauxToolCall('list_folders', {}, { id: 'a' }), fauxToolCall('ask_user', { question: '范围？' }, { id: 'b' })], {
        stopReason: 'toolUse',
      }),
      fauxAssistantMessage('不应被调用'),
    ]);
    await session.agent.prompt('开始整理');
    expect(faux.state.callCount).toBe(1);
  });

  it('runs a full organize conversation into a plan and prunes handled listings', async () => {
    const { faux, session } = start();
    let sawPlaceholder = false;
    faux.setResponses([
      call('ask_user', { question: '整理哪些目录？', options: ['其他书签'] }, 't1'),
      call('set_scope', { folderIds: ['2'], rootFolderId: '1' }, 't2'),
      call('list_bookmarks', { folderId: '2' }, 't3'),
      call('propose_taxonomy', { categories: ['文档 / 前端', '教程'] }, 't4'),
      call('assign', { refs: ['b2', 'b4'], category: '文档 / 前端' }, 't5'),
      call('assign', { refs: ['b3'], category: '教程' }, 't6'),
      (context: Context) => {
        sawPlaceholder = context.messages.some(
          (m) => m.role === 'toolResult' && m.toolName === 'list_bookmarks' && m.content.some((c) => 'text' in c && c.text === HANDLED_PLACEHOLDER),
        );
        return call('finish', { summary: '分成 2 类' }, 't7');
      },
    ]);

    await session.agent.prompt('开始整理');
    await session.agent.prompt('就整理其他书签，新体系放书签栏');

    expect(plan.assignments).toEqual({ a: '文档 / 前端', c: '文档 / 前端', b: '教程' });
    expect(toolContext.onFinish).toHaveBeenCalledWith('分成 2 类');
    expect(sawPlaceholder).toBe(true);
    expect(faux.getPendingResponseCount()).toBe(0);
  });

  it('stops at the model call limit and lets the user grant more', async () => {
    const onLimit = vi.fn();
    const { faux, session } = start(2, onLimit);
    faux.setResponses([call('list_folders', {}, 'l1'), call('list_folders', {}, 'l2'), call('list_folders', {}, 'l3'), fauxAssistantMessage('完')]);

    await session.agent.prompt('开始整理');
    expect(faux.state.callCount).toBe(2);
    expect(onLimit).toHaveBeenCalledTimes(1);

    session.grantMoreCalls();
    await session.agent.prompt('继续');
    expect(faux.state.callCount).toBe(4);
  });
});
