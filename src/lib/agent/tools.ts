import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core';
import { Type, type TSchema } from '@earendil-works/pi-ai';
import { buildIndex, listFolders, type Bookmark, type TreeNode } from '../bookmarks';
import { toAiItem, type Privacy } from '../ai/prompt';
import { assignBookmarks, proposeTaxonomy, setScope, summarizePlan, type OrganizePlan } from './plan';
import type { RefTable } from './refs';

export const LIST_PAGE_MAX = 100;
const LIST_PAGE_DEFAULT = 50;

export interface ToolContext {
  /** 最新的书签树（用户在浏览器里改了书签也能看到） */
  roots(): TreeNode[];
  /** 网址 → 标签 */
  tags(): Map<string, string[]>;
  privacy: Privacy;
  refs: RefTable;
  getPlan(): OrganizePlan;
  setPlan(plan: OrganizePlan): void;
  /** 界面显示提问卡片 */
  onAsk(question: string, options: string[]): void;
  /** 界面高亮「预览并确认整理」 */
  onFinish(summary: string): void;
}

const defineTool = <P extends TSchema>(tool: AgentTool<P>): AgentTool<P> => tool;

const reply = (text: string, extra: Partial<AgentToolResult<unknown>> = {}): AgentToolResult<unknown> => ({
  content: [{ type: 'text', text }],
  details: {},
  ...extra,
});

function snapshot(ctx: ToolContext) {
  const roots = ctx.roots();
  const index = buildIndex(roots);
  const folders = listFolders(roots);
  const folderPath = new Map(folders.map((f) => [f.id, f.path]));
  return { index, folders, folderPath };
}

const underFolder = (bookmarks: Bookmark[], folderId: string) => bookmarks.filter((b) => b.ancestorIds.includes(folderId));

function inScopeOf(plan: OrganizePlan, bookmarks: Bookmark[]) {
  const scopeFolders = plan.scope?.folderIds ?? [];
  const ids = new Set(bookmarks.filter((b) => b.ancestorIds.some((a) => scopeFolders.includes(a))).map((b) => b.id));
  return (id: string) => ids.has(id);
}

/** 一行一个书签：编号 | 标题 | 域名或网址（按隐私等级）| 标签；内网书签返回 null。 */
function describeBookmark(ctx: ToolContext, ref: string, b: Bookmark): string | null {
  const item = toAiItem(ref, b, ctx.privacy);
  if (!item) return null;
  const tags = ctx.tags().get(b.url);
  return [item.ref, item.title, item.domain ?? item.url, tags?.join(',')].filter(Boolean).join(' | ');
}

export function createOrganizeTools(ctx: ToolContext): AgentTool<any>[] {
  const askUser = defineTool({
    name: 'ask_user',
    label: '向你提问',
    description: '向用户提问并停下等待回答。必须单独调用，不要和其他工具同一轮调用。',
    parameters: Type.Object({
      question: Type.String({ description: '要问用户的问题' }),
      options: Type.Optional(Type.Array(Type.String(), { description: '可选的回答选项' })),
    }),
    execute: async (_id, { question, options }) => {
      ctx.onAsk(question, options ?? []);
      return reply('已向用户提问，等待回答。', { terminate: true });
    },
  });

  const listFoldersTool = defineTool({
    name: 'list_folders',
    label: '查看目录',
    description: '列出所有书签目录：id | 路径 | 书签数（含子目录）',
    parameters: Type.Object({}),
    execute: async () => {
      const { index, folders } = snapshot(ctx);
      const lines = folders.map((f) => `${f.id} | ${f.path} | ${index.countByFolder.get(f.id) ?? 0} 个书签`);
      return reply(lines.join('\n'));
    },
  });

  const setScopeTool = defineTool({
    name: 'set_scope',
    label: '确认整理范围',
    description: '记录用户同意整理的目录（含子目录）以及新分类体系建在哪个目录下。必须先问过用户。',
    parameters: Type.Object({
      folderIds: Type.Array(Type.String(), { description: '要整理的目录 id' }),
      rootFolderId: Type.String({ description: '新分类体系建在这个目录下' }),
    }),
    execute: async (_id, { folderIds, rootFolderId }) => {
      const { index, folders, folderPath } = snapshot(ctx);
      const next = setScope(ctx.getPlan(), { folderIds, rootFolderId }, new Set(folders.map((f) => f.id)));
      ctx.setPlan(next);
      const inScope = inScopeOf(next, index.bookmarks);
      const count = index.bookmarks.filter((b) => inScope(b.id) && toAiItem('b0', b, ctx.privacy)).length;
      const names = folderIds.map((id) => folderPath.get(id)).join('、');
      return reply(`已确认整理范围：${names}；新体系建在「${folderPath.get(rootFolderId)}」下。范围内共 ${count} 个书签（不含内网）。`);
    },
  });

  const listBookmarks = defineTool({
    name: 'list_bookmarks',
    label: '查看书签',
    description: `分页列出目录（含子目录）下的书签：编号 | 标题 | 域名或网址 | 标签。每页最多 ${LIST_PAGE_MAX} 个。`,
    parameters: Type.Object({
      folderId: Type.String(),
      offset: Type.Optional(Type.Integer({ minimum: 0 })),
      limit: Type.Optional(Type.Integer({ minimum: 1, maximum: LIST_PAGE_MAX })),
    }),
    execute: async (_id, { folderId, offset = 0, limit = LIST_PAGE_DEFAULT }) => {
      const { index, folderPath } = snapshot(ctx);
      const path = folderPath.get(folderId);
      if (!path) throw new Error(`目录不存在：${folderId}，请先用 list_folders 查看目录 id`);
      const lines = underFolder(index.bookmarks, folderId)
        .map((b) => {
          const ref = ctx.refs.toRef(b.id);
          const line = ref ? describeBookmark(ctx, ref, b) : null;
          return line && ref ? { ref, line } : null;
        })
        .filter((x): x is { ref: string; line: string } => x !== null);
      const size = Math.min(limit, LIST_PAGE_MAX);
      const page = lines.slice(offset, offset + size);
      const end = offset + page.length;
      const text = [
        `目录「${path}」共 ${lines.length} 个书签，第 ${offset + 1}–${end} 个：`,
        ...page.map((p) => p.line),
        ...(end < lines.length ? [`还有 ${lines.length - end} 个，用 offset=${end} 继续读取。`] : []),
      ].join('\n');
      return reply(text, { details: { refs: page.map((p) => p.ref) } });
    },
  });

  const proposeTaxonomyTool = defineTool({
    name: 'propose_taxonomy',
    label: '提出分类体系',
    description: '提交或替换整套分类体系，路径用「 / 」分隔，最多 3 层、30 个分类。替换后，分到已删除分类的书签回到未归类。',
    parameters: Type.Object({ categories: Type.Array(Type.String()) }),
    execute: async (_id, { categories }) => {
      const next = proposeTaxonomy(ctx.getPlan(), categories);
      ctx.setPlan(next);
      return reply(`已记录分类体系（${next.categories.length} 个分类）：${next.categories.join('、')}`);
    },
  });

  const assign = defineTool({
    name: 'assign',
    label: '分配书签',
    description: '把一批书签（用编号）分到某个分类。只能分配整理范围内的书签，分类必须在当前体系中。',
    parameters: Type.Object({ refs: Type.Array(Type.String()), category: Type.String() }),
    execute: async (_id, { refs, category }) => {
      const unknown = refs.find((ref) => !ctx.refs.toId(ref));
      if (unknown) throw new Error(`编号不存在：${unknown}`);
      const { index } = snapshot(ctx);
      const plan = ctx.getPlan();
      const next = assignBookmarks(plan, refs.map((ref) => ctx.refs.toId(ref)!), category, inScopeOf(plan, index.bookmarks));
      ctx.setPlan(next);
      const inScope = inScopeOf(next, index.bookmarks);
      const scopeIds = index.bookmarks.filter((b) => inScope(b.id) && toAiItem('b0', b, ctx.privacy)).map((b) => b.id);
      const { unassigned } = summarizePlan(next, scopeIds);
      return reply(`已把 ${refs.length} 个书签分到「${category.split('/').map((s) => s.trim()).join(' / ')}」。尚未归类：${unassigned} 个。`);
    },
  });

  const finish = defineTool({
    name: 'finish',
    label: '完成整理',
    description: '分类完成后调用，交给用户在预览中确认。',
    parameters: Type.Object({ summary: Type.String({ description: '给用户的一句话总结' }) }),
    execute: async (_id, { summary }) => {
      ctx.onFinish(summary);
      return reply('已完成，等待用户在预览中确认。', { terminate: true });
    },
  });

  return [askUser, setScopeTool, listFoldersTool, listBookmarks, proposeTaxonomyTool, assign, finish];
}
