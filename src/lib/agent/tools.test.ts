import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import { buildIndex, type TreeNode } from '../bookmarks';
import type { Privacy } from '../ai/prompt';
import { emptyPlan, type OrganizePlan } from './plan';
import { createRefTable } from './refs';
import { createOrganizeTools, type ToolContext } from './tools';

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
        children: [
          {
            id: '20',
            title: '杂项',
            children: [
              bm('a', 'React 文档', 'https://react.dev/'),
              bm('b', 'Go 语言', 'https://go.dev/'),
              bm('i', 'Jira', 'http://jira/'),
            ],
          },
          bm('c', 'MDN', 'https://developer.mozilla.org/'),
        ],
      },
    ],
  },
];
// 编号按树的顺序：x=b1 a=b2 b=b3 i=b4 c=b5
const refs = createRefTable(buildIndex(roots).bookmarks.map((b) => b.id));

let plan: OrganizePlan;
let ctx: ToolContext;
let tools: Map<string, AgentTool<any>>;

function setup(privacy: Privacy = 'title_domain') {
  plan = emptyPlan();
  ctx = {
    roots: () => roots,
    tags: () => new Map([['https://react.dev/', ['前端']]]),
    privacy,
    refs,
    getPlan: () => plan,
    setPlan: (next) => {
      plan = next;
    },
    onAsk: vi.fn(),
    onFinish: vi.fn(),
  };
  tools = new Map(createOrganizeTools(ctx).map((t) => [t.name, t]));
}

const run = async (name: string, params: Record<string, unknown> = {}) => {
  const result = await tools.get(name)!.execute('call', params as never);
  return { ...result, text: result.content.map((c) => ('text' in c ? c.text : '')).join('\n') };
};

beforeEach(() => setup());

describe('list_folders', () => {
  it('lists every folder with id, path and bookmark count', async () => {
    const { text } = await run('list_folders');
    expect(text.split('\n')).toEqual(['1 | 书签栏 | 1 个书签', '2 | 其他书签 | 4 个书签', '20 | 其他书签 / 杂项 | 3 个书签']);
  });
});

describe('list_bookmarks', () => {
  it('pages through a folder and its subfolders, skipping intranet bookmarks', async () => {
    const first = await run('list_bookmarks', { folderId: '2', offset: 0, limit: 2 });
    expect(first.text.split('\n')).toEqual([
      '目录「其他书签」共 3 个书签，第 1–2 个：',
      'b2 | React 文档 | react.dev | 前端',
      'b3 | Go 语言 | go.dev',
      '还有 1 个，用 offset=2 继续读取。',
    ]);
    expect(first.details).toEqual({ refs: ['b2', 'b3'] });

    const second = await run('list_bookmarks', { folderId: '2', offset: 2, limit: 2 });
    expect(second.text.split('\n')).toEqual(['目录「其他书签」共 3 个书签，第 3–3 个：', 'b5 | MDN | developer.mozilla.org']);
  });

  it('sends only what the privacy level allows', async () => {
    setup('title');
    expect((await run('list_bookmarks', { folderId: '20' })).text).toContain('b2 | React 文档 | 前端');
    setup('title_url');
    expect((await run('list_bookmarks', { folderId: '20' })).text).toContain('b2 | React 文档 | https://react.dev/ | 前端');
  });

  it('rejects unknown folders', async () => {
    await expect(run('list_bookmarks', { folderId: '99' })).rejects.toThrow('目录不存在：99');
  });

  it('says there is nothing more when the page is empty', async () => {
    const result = await run('list_bookmarks', { folderId: '2', offset: 3 });
    expect(result.text.split('\n')).toEqual(['目录「其他书签」共 3 个书签，没有更多了。']);
    expect(result.details).toEqual({ refs: [] });
  });
});

describe('scope, taxonomy and assign', () => {
  it('refuses to assign before the scope is confirmed', async () => {
    await run('propose_taxonomy', { categories: ['教程'] });
    await expect(run('assign', { refs: ['b2'], category: '教程' })).rejects.toThrow('请先确认整理范围');
  });

  it('records scope, taxonomy and assignments in the plan', async () => {
    const scope = await run('set_scope', { folderIds: ['2'], rootFolderId: '1' });
    expect(scope.text).toContain('范围内共 3 个书签');
    await run('propose_taxonomy', { categories: ['文档/前端', '教程'] });
    const assigned = await run('assign', { refs: ['b2', 'b5'], category: '文档 / 前端' });

    expect(plan.assignments).toEqual({ a: '文档 / 前端', c: '文档 / 前端' });
    expect(assigned.text).toContain('尚未归类：1 个');
  });

  it('rejects unknown refs and bookmarks outside the scope', async () => {
    await run('set_scope', { folderIds: ['20'], rootFolderId: '1' });
    await run('propose_taxonomy', { categories: ['教程'] });
    await expect(run('assign', { refs: ['b99'], category: '教程' })).rejects.toThrow('编号不存在：b99');
    await expect(run('assign', { refs: ['b5'], category: '教程' })).rejects.toThrow('不在整理范围内');
  });

  it('rejects an intranet bookmark even though it sits inside the scope folder', async () => {
    // b4 = Jira（内网），就在范围目录 20 下面；list_bookmarks 从不会把它的编号发给模型，
    // 但如果模型（或坏数据）猜出了这个编号，assign 也不该把它当作范围内的书签接受。
    await run('set_scope', { folderIds: ['20'], rootFolderId: '1' });
    await run('propose_taxonomy', { categories: ['教程'] });
    await expect(run('assign', { refs: ['b4'], category: '教程' })).rejects.toThrow('不在整理范围内');
  });
});

describe('ask_user and finish', () => {
  it('ask_user shows the question and stops the agent', async () => {
    const result = await run('ask_user', { question: '整理哪些目录？', options: ['其他书签', '全部'] });
    expect(ctx.onAsk).toHaveBeenCalledWith('整理哪些目录？', ['其他书签', '全部']);
    expect(result.terminate).toBe(true);
  });

  it('finish hands over to the preview and stops the agent', async () => {
    const result = await run('finish', { summary: '分成 3 类' });
    expect(ctx.onFinish).toHaveBeenCalledWith('分成 3 类');
    expect(result.terminate).toBe(true);
  });
});
