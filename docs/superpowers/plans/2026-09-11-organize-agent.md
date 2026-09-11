# 智能整理智能体 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「智能整理」改成基于 Pi SDK 的对话式智能体：问清范围、提出分类体系、分配书签，预览确认后作为一个可撤销批次重排 Chrome 书签文件夹。

**Architecture:** `src/lib/agent/` 放纯逻辑（模型接入、编号表、整理方案、工具、上下文裁剪、会话组装），工具只读书签或写入不可变的整理方案；页面级 store 持有 Agent 会话并把事件归约成对话记录；界面两栏（对话 / 方案），确认后把方案转成 `history.ts` 的 `Intent[]` 交给现有 `runBatch` 执行。

**Tech Stack:** WXT + React 19 + TypeScript，`@earendil-works/pi-agent-core@0.85.1`、`@earendil-works/pi-ai@0.85.1`（含 TypeBox `Type`、测试用 `fauxProvider`），vitest，shadcn/ui，Playwright（端到端）。

**Spec:** `docs/superpowers/specs/2026-09-11-organize-agent-design.md`

## Global Constraints

- Pi 包锁定精确版本 `0.85.1`（`pnpm add -E`），`package.json` 中不得出现 `^`。
- 只支持 OpenAI 兼容接口，复用 `src/lib/ai/config.ts` 的 `AiConfig`（`baseUrl`、`apiKey`、`model`、`privacy`）。
- 智能体工具**不得**调用 `chrome.bookmarks` 的任何写接口；书签只在用户点「确认整理」后经 `runBatch` 修改。
- 分类体系：最多 3 层；每级名称 1–30 字；最多 30 个分类；路径分隔符为 `' / '`（输入时斜杠两侧空格不敏感）。
- `list_bookmarks` 单页最多 100 条，每条一行：`b12 | 标题 | 域名 | 标签`（字段随隐私等级取舍，内网书签不返回）。
- 单次会话最多 60 次模型调用，按 `turn_start` 事件计数。
- `ask_user` 调用后本轮结束必须停下：工具返回 `terminate: true`，并用 `shouldStopAfterTurn` 兜底（已验证：同轮混调其他工具时仅靠 `terminate` 不会停）。
- 整理方案是不可变数据：每个修改函数返回新对象，不修改入参。
- 界面文案一律中文；错误提示说明原因和解决办法。
- 每个任务 TDD（先写失败测试再实现），每个任务结束提交一次；中文提交信息写入 UTF-8 文件后用 `git commit -F <file>`，末尾加 `Claude-Session: https://claude.ai/code/session_012gN5RKkXQz5p6iZUgwNUQu`。
- 每个任务结束前运行 `pnpm test`、`pnpm compile`；涉及界面的任务再运行 `pnpm build`。

## File Structure

| 文件 | 职责 |
|---|---|
| `src/lib/agent/model.ts` | `AiConfig` → pi-ai `Model` + `streamFn`（OpenAI 兼容） |
| `src/lib/agent/refs.ts` | 会话内书签编号表 `b1…bN` ↔ 真实 id |
| `src/lib/agent/plan.ts` | 整理方案类型与纯函数：范围、分类体系、分配、校验 |
| `src/lib/agent/applyPlan.ts` | 方案 → `Intent[]`（复用已有目录、`ref` 新建、跳过已变动书签） |
| `src/lib/agent/tools.ts` | 7 个 `AgentTool` |
| `src/lib/agent/context.ts` | `transformContext`：裁剪已处理的 `list_bookmarks` 结果 |
| `src/lib/agent/systemPrompt.ts` | 系统提示词 |
| `src/lib/agent/session.ts` | 组装 `Agent`（工具、提示词、裁剪、停止条件） |
| `src/lib/agent/transcript.ts` | Agent 事件 → 界面对话记录（纯归约） |
| `src/lib/agent/store.ts` | 页面级会话 store（切换页面不丢） |
| `src/hooks/useOrganizeAgent.ts` | 订阅 store 的 React hook |
| `src/components/agent/ChatPanel.tsx` | 左栏对话、提问卡片、输入框 |
| `src/components/agent/PlanPanel.tsx` | 右栏方案树 |
| `src/components/agent/PlanPreviewDialog.tsx` | 预览并确认 |
| `src/components/AgentOrganizeView.tsx` | 「智能整理」页（两栏 + AI 标签卡片） |
| `src/components/AiTagsCard.tsx` | 从 `OrganizeView` 拆出的 AI 标签卡片 |
| 删除 `src/components/OrganizeView.tsx`、`src/lib/ai/organize.ts(+test)`、`src/lib/ai/parse.ts(+test)` | 被智能体取代；`prompt.ts` 删除 `buildMessages` 及其测试 |
| `e2e/agent-organize.mjs` | Playwright 端到端（本地假 OpenAI 兼容服务） |

---

### Task 1: 依赖与模型接入

**Files:**
- Modify: `package.json`（新增依赖）
- Create: `src/lib/agent/model.ts`
- Test: `src/lib/agent/model.test.ts`

**Interfaces:**
- Consumes: `AiConfig`（`src/lib/ai/config.ts`）
- Produces:
  - `toAgentModel(config: AiConfig): Model<'openai-completions'>`
  - `createAgentModel(config: AiConfig): { model: Model<'openai-completions'>; streamFn: StreamFn }`
  - 常量 `AGENT_PROVIDER_ID = 'user-openai-compatible'`

- [ ] **Step 1: 安装依赖（锁定精确版本）**

Run: `pnpm add -E @earendil-works/pi-agent-core@0.85.1 @earendil-works/pi-ai@0.85.1`
Expected: `package.json` 出现 `"@earendil-works/pi-agent-core": "0.85.1"` 与 `"@earendil-works/pi-ai": "0.85.1"`（无 `^`）。

- [ ] **Step 2: 写失败测试** `src/lib/agent/model.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { AGENT_PROVIDER_ID, createAgentModel, toAgentModel } from './model';

const config = { baseUrl: 'https://api.deepseek.com/v1', apiKey: 'sk-test', model: 'deepseek-chat', privacy: 'title_domain' as const };

describe('toAgentModel', () => {
  it('maps the saved AI config to an OpenAI-compatible pi model', () => {
    expect(toAgentModel(config)).toMatchObject({
      id: 'deepseek-chat',
      api: 'openai-completions',
      provider: AGENT_PROVIDER_ID,
      baseUrl: 'https://api.deepseek.com/v1',
      input: ['text'],
      reasoning: false,
    });
  });
});

describe('createAgentModel', () => {
  it('returns the model and a stream function for the agent', () => {
    const { model, streamFn } = createAgentModel(config);
    expect(model.id).toBe('deepseek-chat');
    expect(typeof streamFn).toBe('function');
  });
});
```

- [ ] **Step 3: 运行确认失败**

Run: `pnpm test src/lib/agent/model.test.ts`
Expected: FAIL，`Cannot find module './model'`。

- [ ] **Step 4: 实现** `src/lib/agent/model.ts`

```ts
import type { StreamFn } from '@earendil-works/pi-agent-core';
import { createModels, createProvider, type Model } from '@earendil-works/pi-ai';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';
import type { AiConfig } from '../ai/config';

export const AGENT_PROVIDER_ID = 'user-openai-compatible';
const CONTEXT_WINDOW = 64_000;
const MAX_OUTPUT_TOKENS = 8_000;

/** 用户在设置页配置的 OpenAI 兼容服务 → pi 的模型描述。 */
export function toAgentModel(config: AiConfig): Model<'openai-completions'> {
  return {
    id: config.model,
    name: config.model,
    api: 'openai-completions',
    provider: AGENT_PROVIDER_ID,
    baseUrl: config.baseUrl,
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: CONTEXT_WINDOW,
    maxTokens: MAX_OUTPUT_TOKENS,
  };
}

/** Key 显式传入（浏览器没有环境变量），只发给用户填写的 Base URL。 */
export function createAgentModel(config: AiConfig): { model: Model<'openai-completions'>; streamFn: StreamFn } {
  const model = toAgentModel(config);
  const provider = createProvider({
    id: AGENT_PROVIDER_ID,
    name: '用户配置的 OpenAI 兼容服务',
    baseUrl: config.baseUrl,
    auth: { apiKey: { name: 'API Key', resolve: async () => ({ auth: { apiKey: config.apiKey } }) } },
    models: [model],
    api: openAICompletionsApi(),
  });
  const models = createModels();
  models.setProvider(provider);
  return { model, streamFn: models.streamSimple.bind(models) };
}
```

- [ ] **Step 5: 运行确认通过**

Run: `pnpm test src/lib/agent/model.test.ts && pnpm compile`
Expected: 2 passed；`tsc` exit 0。

- [ ] **Step 6: 构建确认浏览器可打包**

Run: `pnpm build`
Expected: `Built extension`；允许出现 `Module "node:fs" has been externalized`（pi-ai 从环境变量取 Key 的模块，本项目不走该路径）。

- [ ] **Step 7: 提交**

提交 `package.json`、`pnpm-lock.yaml`、`src/lib/agent/model.ts`、`src/lib/agent/model.test.ts`，信息：`feat: 接入 Pi SDK 与 OpenAI 兼容模型`。

---

### Task 2: 书签编号表

**Files:**
- Create: `src/lib/agent/refs.ts`
- Test: `src/lib/agent/refs.test.ts`

**Interfaces:**
- Produces:
  - `interface RefTable { toRef(bookmarkId: string): string | undefined; toId(ref: string): string | undefined }`
  - `createRefTable(bookmarkIds: string[]): RefTable` —— 按传入顺序编号 `b1…bN`，会话内固定

- [ ] **Step 1: 写失败测试** `src/lib/agent/refs.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { createRefTable } from './refs';

describe('createRefTable', () => {
  const refs = createRefTable(['101', '205', '9']);

  it('numbers bookmarks b1…bN in the given order', () => {
    expect(['101', '205', '9'].map((id) => refs.toRef(id))).toEqual(['b1', 'b2', 'b3']);
  });

  it('maps refs back to real ids, tolerating surrounding spaces', () => {
    expect(refs.toId('b2')).toBe('205');
    expect(refs.toId(' b3 ')).toBe('9');
  });

  it('returns undefined for unknown ids and refs', () => {
    expect(refs.toRef('404')).toBeUndefined();
    expect(refs.toId('b99')).toBeUndefined();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test src/lib/agent/refs.test.ts`
Expected: FAIL，`Cannot find module './refs'`。

- [ ] **Step 3: 实现** `src/lib/agent/refs.ts`

```ts
/** 会话内书签编号：模型只见 b1、b2…，看不到也编不出真实 id。 */
export interface RefTable {
  toRef(bookmarkId: string): string | undefined;
  toId(ref: string): string | undefined;
}

export function createRefTable(bookmarkIds: string[]): RefTable {
  const refById = new Map(bookmarkIds.map((id, i) => [id, `b${i + 1}`]));
  const idByRef = new Map([...refById].map(([id, ref]) => [ref, id]));
  return {
    toRef: (bookmarkId) => refById.get(bookmarkId),
    toId: (ref) => idByRef.get(ref.trim()),
  };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test src/lib/agent/refs.test.ts && pnpm compile`
Expected: 3 passed；exit 0。

- [ ] **Step 5: 提交**

提交两个文件，信息：`feat: 智能体书签编号表`。

---

### Task 3: 整理方案（范围、分类体系、分配）

**Files:**
- Create: `src/lib/agent/plan.ts`
- Test: `src/lib/agent/plan.test.ts`

**Interfaces:**
- Produces:
  - `interface PlanScope { folderIds: string[]; rootFolderId: string }`
  - `interface OrganizePlan { scope: PlanScope | null; categories: string[]; assignments: Readonly<Record<string, string>> }`（`assignments`：书签 id → 分类路径）
  - `emptyPlan(): OrganizePlan`
  - `normalizeCategory(path: string): string` —— 规范化并校验，失败抛错
  - `setScope(plan: OrganizePlan, scope: PlanScope, knownFolderIds: Set<string>): OrganizePlan`
  - `proposeTaxonomy(plan: OrganizePlan, categories: string[]): OrganizePlan`
  - `assignBookmarks(plan: OrganizePlan, bookmarkIds: string[], category: string, inScope: (id: string) => boolean): OrganizePlan`
  - `summarizePlan(plan: OrganizePlan, scopeBookmarkIds: string[]): { counts: Record<string, number>; unassigned: number }`
  - 常量 `CATEGORY_SEPARATOR = ' / '`、`MAX_CATEGORY_DEPTH = 3`、`MAX_CATEGORY_NAME = 30`、`MAX_CATEGORIES = 30`

- [ ] **Step 1: 写失败测试** `src/lib/agent/plan.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { assignBookmarks, emptyPlan, normalizeCategory, proposeTaxonomy, setScope, summarizePlan } from './plan';

const folders = new Set(['1', '2', '20']);
const scoped = setScope(emptyPlan(), { folderIds: ['2'], rootFolderId: '1' }, folders);
const inScope = (id: string) => ['a', 'b', 'c'].includes(id);

describe('normalizeCategory', () => {
  it('trims around slashes and joins with " / "', () => {
    expect(normalizeCategory(' 文档/前端 ')).toBe('文档 / 前端');
  });

  it.each([
    ['', '分类名称不能为空'],
    ['文档 / / 前端', '分类名称不能为空'],
    ['一 / 二 / 三 / 四', '最多 3 层'],
    [`${'长'.repeat(31)}`, '不超过 30 个字'],
  ])('rejects "%s"', (path, message) => {
    expect(() => normalizeCategory(path)).toThrow(message);
  });
});

describe('setScope', () => {
  it('records the scope and does not modify the input plan', () => {
    const plan = emptyPlan();
    const next = setScope(plan, { folderIds: ['2', '20'], rootFolderId: '1' }, folders);
    expect(next.scope).toEqual({ folderIds: ['2', '20'], rootFolderId: '1' });
    expect(plan.scope).toBeNull();
  });

  it('rejects unknown or empty folders', () => {
    expect(() => setScope(emptyPlan(), { folderIds: [], rootFolderId: '1' }, folders)).toThrow('至少选择一个目录');
    expect(() => setScope(emptyPlan(), { folderIds: ['99'], rootFolderId: '1' }, folders)).toThrow('目录不存在：99');
    expect(() => setScope(emptyPlan(), { folderIds: ['2'], rootFolderId: '99' }, folders)).toThrow('目录不存在：99');
  });

  it('clears earlier assignments when the scope changes', () => {
    const withAssign = assignBookmarks(proposeTaxonomy(scoped, ['教程']), ['a'], '教程', inScope);
    expect(setScope(withAssign, { folderIds: ['20'], rootFolderId: '1' }, folders).assignments).toEqual({});
  });
});

describe('proposeTaxonomy', () => {
  it('normalizes and de-duplicates categories', () => {
    expect(proposeTaxonomy(scoped, ['文档/前端', '文档 / 前端', '教程']).categories).toEqual(['文档 / 前端', '教程']);
  });

  it('rejects more than 30 categories or an empty list', () => {
    expect(() => proposeTaxonomy(scoped, Array.from({ length: 31 }, (_, i) => `类${i}`))).toThrow('最多 30 个分类');
    expect(() => proposeTaxonomy(scoped, [])).toThrow('至少需要一个分类');
  });

  it('moves bookmarks of removed categories back to unassigned', () => {
    const plan = assignBookmarks(proposeTaxonomy(scoped, ['文档 / 中台', '教程']), ['a'], '文档 / 中台', inScope);
    expect(proposeTaxonomy(plan, ['教程']).assignments).toEqual({});
  });
});

describe('assignBookmarks', () => {
  const plan = proposeTaxonomy(scoped, ['文档 / 前端', '教程']);

  it('assigns in-scope bookmarks, the latest assignment winning', () => {
    const once = assignBookmarks(plan, ['a', 'b'], '文档/前端', inScope);
    const twice = assignBookmarks(once, ['b'], '教程', inScope);
    expect(twice.assignments).toEqual({ a: '文档 / 前端', b: '教程' });
    expect(once.assignments).toEqual({ a: '文档 / 前端', b: '文档 / 前端' });
  });

  it('requires a confirmed scope', () => {
    expect(() => assignBookmarks(proposeTaxonomy(emptyPlan(), ['教程']), ['a'], '教程', inScope)).toThrow('请先确认整理范围');
  });

  it('rejects categories outside the taxonomy and bookmarks outside the scope', () => {
    expect(() => assignBookmarks(plan, ['a'], '后端', inScope)).toThrow('分类「后端」不在当前体系中');
    expect(() => assignBookmarks(plan, ['a', 'z'], '教程', inScope)).toThrow('1 个书签不在整理范围内');
  });
});

describe('summarizePlan', () => {
  it('counts bookmarks per category and those still unassigned', () => {
    const plan = assignBookmarks(proposeTaxonomy(scoped, ['文档 / 前端', '教程']), ['a', 'b'], '教程', inScope);
    expect(summarizePlan(plan, ['a', 'b', 'c'])).toEqual({ counts: { '文档 / 前端': 0, 教程: 2 }, unassigned: 1 });
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test src/lib/agent/plan.test.ts`
Expected: FAIL，`Cannot find module './plan'`。

- [ ] **Step 3: 实现** `src/lib/agent/plan.ts`

```ts
export const CATEGORY_SEPARATOR = ' / ';
export const MAX_CATEGORY_DEPTH = 3;
export const MAX_CATEGORY_NAME = 30;
export const MAX_CATEGORIES = 30;

export interface PlanScope {
  /** 要整理的目录（含子目录） */
  folderIds: string[];
  /** 新分类体系建在这个目录下 */
  rootFolderId: string;
}

/** 整理方案：不可变，每个函数返回新对象。 */
export interface OrganizePlan {
  scope: PlanScope | null;
  categories: string[];
  /** 书签 id → 分类路径 */
  assignments: Readonly<Record<string, string>>;
}

export const emptyPlan = (): OrganizePlan => ({ scope: null, categories: [], assignments: {} });

export function normalizeCategory(path: string): string {
  const parts = path.split('/').map((part) => part.trim());
  if (parts.some((part) => part.length === 0)) throw new Error(`分类名称不能为空：「${path}」`);
  if (parts.length > MAX_CATEGORY_DEPTH) throw new Error(`分类「${path}」超过限制：最多 ${MAX_CATEGORY_DEPTH} 层`);
  const tooLong = parts.find((part) => part.length > MAX_CATEGORY_NAME);
  if (tooLong) throw new Error(`分类名「${tooLong}」太长：每级不超过 ${MAX_CATEGORY_NAME} 个字`);
  return parts.join(CATEGORY_SEPARATOR);
}

export function setScope(plan: OrganizePlan, scope: PlanScope, knownFolderIds: Set<string>): OrganizePlan {
  if (scope.folderIds.length === 0) throw new Error('整理范围至少选择一个目录');
  const unknown = [...scope.folderIds, scope.rootFolderId].find((id) => !knownFolderIds.has(id));
  if (unknown) throw new Error(`目录不存在：${unknown}，请先用 list_folders 查看目录 id`);
  return { ...plan, scope: { folderIds: [...scope.folderIds], rootFolderId: scope.rootFolderId }, assignments: {} };
}

export function proposeTaxonomy(plan: OrganizePlan, categories: string[]): OrganizePlan {
  const normalized = [...new Set(categories.map(normalizeCategory))];
  if (normalized.length === 0) throw new Error('分类体系至少需要一个分类');
  if (normalized.length > MAX_CATEGORIES) throw new Error(`分类太多：最多 ${MAX_CATEGORIES} 个分类`);
  const kept = Object.fromEntries(Object.entries(plan.assignments).filter(([, category]) => normalized.includes(category)));
  return { ...plan, categories: normalized, assignments: kept };
}

export function assignBookmarks(
  plan: OrganizePlan,
  bookmarkIds: string[],
  category: string,
  inScope: (id: string) => boolean,
): OrganizePlan {
  if (!plan.scope) throw new Error('请先确认整理范围（set_scope），再分配书签');
  const target = normalizeCategory(category);
  if (!plan.categories.includes(target)) {
    throw new Error(`分类「${target}」不在当前体系中。现有分类：${plan.categories.join('、')}`);
  }
  const outside = bookmarkIds.filter((id) => !inScope(id));
  if (outside.length > 0) throw new Error(`${outside.length} 个书签不在整理范围内，不能分配`);
  return { ...plan, assignments: { ...plan.assignments, ...Object.fromEntries(bookmarkIds.map((id) => [id, target])) } };
}

export function summarizePlan(plan: OrganizePlan, scopeBookmarkIds: string[]) {
  const counts = Object.fromEntries(plan.categories.map((c) => [c, 0]));
  for (const category of Object.values(plan.assignments)) counts[category] = (counts[category] ?? 0) + 1;
  const unassigned = scopeBookmarkIds.filter((id) => !(id in plan.assignments)).length;
  return { counts, unassigned };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test src/lib/agent/plan.test.ts && pnpm compile`
Expected: 全部通过；exit 0。

- [ ] **Step 5: 提交**

提交两个文件，信息：`feat: 智能体整理方案（范围、分类体系、分配）`。

---

### Task 4: 方案转成批次

**Files:**
- Create: `src/lib/agent/applyPlan.ts`
- Test: `src/lib/agent/applyPlan.test.ts`

**Interfaces:**
- Consumes: `OrganizePlan`、`CATEGORY_SEPARATOR`（Task 3）；`Intent`（`src/lib/history.ts`，`create` 支持 `ref`，`move` 的 `parentId` 可写 ref）；`TreeNode`（`src/lib/bookmarks.ts`）
- Produces:
  - `interface ApplyResult { intents: Intent[]; createdFolders: number; moved: number; skipped: number }`
  - `planToIntents(plan: OrganizePlan, roots: TreeNode[], inScope: (id: string) => boolean): ApplyResult`

规则：只为有书签的分类建目录（连同其上级）；分类目录在体系根下已存在同名目录则复用；新建目录用 `ref = 'new:<序号>'`，子级的 `parentId` 引用父级 ref；先 create 后 move；书签已删除或已不在范围内的计入 `skipped`；已在目标目录的不生成 move。

- [ ] **Step 1: 写失败测试** `src/lib/agent/applyPlan.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import type { TreeNode } from '../bookmarks';
import { planToIntents } from './applyPlan';
import type { OrganizePlan } from './plan';

const bm = (id: string): TreeNode => ({ id, title: id, url: `https://${id}.com/` });
const roots: TreeNode[] = [
  {
    id: '0',
    title: '',
    children: [
      { id: '1', title: '书签栏', children: [{ id: '10', title: '教程', children: [bm('t')] }] },
      { id: '2', title: '其他书签', children: [bm('a'), bm('b'), bm('c')] },
    ],
  },
];
const inScope = (id: string) => ['a', 'b', 'c', 't'].includes(id);
const plan = (assignments: Record<string, string>): OrganizePlan => ({
  scope: { folderIds: ['2'], rootFolderId: '1' },
  categories: ['文档 / 前端', '文档 / 后端', '教程', '空分类'],
  assignments,
});

describe('planToIntents', () => {
  it('reuses existing folders, creates missing ones with refs, then moves bookmarks', () => {
    const result = planToIntents(plan({ a: '文档 / 前端', b: '文档 / 前端', c: '教程' }), roots, inScope);
    expect(result.intents).toEqual([
      { type: 'create', parentId: '1', node: { title: '文档' }, ref: 'new:0' },
      { type: 'create', parentId: 'new:0', node: { title: '前端' }, ref: 'new:1' },
      { type: 'move', id: 'a', parentId: 'new:1' },
      { type: 'move', id: 'b', parentId: 'new:1' },
      { type: 'move', id: 'c', parentId: '10' },
    ]);
    expect(result).toMatchObject({ createdFolders: 2, moved: 3, skipped: 0 });
  });

  it('does not create folders for empty categories', () => {
    const result = planToIntents(plan({ c: '教程' }), roots, inScope);
    expect(result.intents).toEqual([{ type: 'move', id: 'c', parentId: '10' }]);
  });

  it('does not move bookmarks already in the target folder', () => {
    expect(planToIntents(plan({ t: '教程' }), roots, inScope)).toMatchObject({ intents: [], moved: 0, skipped: 0 });
  });

  it('skips bookmarks that were deleted or left the scope', () => {
    const result = planToIntents(plan({ gone: '教程', a: '教程' }), roots, (id) => id !== 'a');
    expect(result).toMatchObject({ intents: [], moved: 0, skipped: 2 });
  });

  it('refuses to build intents without a scope', () => {
    expect(() => planToIntents({ ...plan({}), scope: null }, roots, inScope)).toThrow('请先确认整理范围');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test src/lib/agent/applyPlan.test.ts`
Expected: FAIL，`Cannot find module './applyPlan'`。

- [ ] **Step 3: 实现** `src/lib/agent/applyPlan.ts`

```ts
import type { TreeNode } from '../bookmarks';
import type { Intent } from '../history';
import { CATEGORY_SEPARATOR, type OrganizePlan } from './plan';

export interface ApplyResult {
  intents: Intent[];
  createdFolders: number;
  moved: number;
  skipped: number;
}

function indexTree(roots: TreeNode[]) {
  const byId = new Map<string, TreeNode>();
  const parentOf = new Map<string, string>();
  const walk = (node: TreeNode) => {
    byId.set(node.id, node);
    for (const child of node.children ?? []) {
      parentOf.set(child.id, node.id);
      walk(child);
    }
  };
  roots.forEach(walk);
  return { byId, parentOf };
}

/** 方案 → 一个批次的操作：先建目录（复用同名已有目录），再移动书签。 */
export function planToIntents(plan: OrganizePlan, roots: TreeNode[], inScope: (id: string) => boolean): ApplyResult {
  if (!plan.scope) throw new Error('请先确认整理范围（set_scope）');
  const { byId, parentOf } = indexTree(roots);
  const creates: Intent[] = [];
  const moves: Intent[] = [];
  // 分类路径 → 目录 id（已有）或 ref（本批次新建）
  const folderFor = new Map<string, string>();
  let skipped = 0;

  const ensureFolder = (path: string): string => {
    const known = folderFor.get(path);
    if (known) return known;
    const parts = path.split(CATEGORY_SEPARATOR);
    const name = parts.at(-1)!;
    const parent = parts.length === 1 ? plan.scope!.rootFolderId : ensureFolder(parts.slice(0, -1).join(CATEGORY_SEPARATOR));
    const existing = byId.get(parent)?.children?.find((c) => c.url === undefined && c.title.trim() === name);
    const id = existing?.id ?? `new:${creates.length}`;
    if (!existing) creates.push({ type: 'create', parentId: parent, node: { title: name }, ref: id });
    folderFor.set(path, id);
    return id;
  };

  for (const [bookmarkId, category] of Object.entries(plan.assignments)) {
    const node = byId.get(bookmarkId);
    if (!node || node.url === undefined || !inScope(bookmarkId)) {
      skipped += 1;
      continue;
    }
    const target = ensureFolder(category);
    if (parentOf.get(bookmarkId) !== target) moves.push({ type: 'move', id: bookmarkId, parentId: target });
  }

  return { intents: [...creates, ...moves], createdFolders: creates.length, moved: moves.length, skipped };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test src/lib/agent/applyPlan.test.ts && pnpm compile`
Expected: 5 passed；exit 0。

- [ ] **Step 5: 提交**

提交两个文件，信息：`feat: 整理方案转成可撤销批次`。

---

### Task 5: 智能体工具

**Files:**
- Create: `src/lib/agent/tools.ts`
- Test: `src/lib/agent/tools.test.ts`

**Interfaces:**
- Consumes: `RefTable`（Task 2）；`OrganizePlan`、`setScope`、`proposeTaxonomy`、`assignBookmarks`、`summarizePlan`（Task 3）；`buildIndex`、`listFolders`、`TreeNode`、`Bookmark`（`src/lib/bookmarks.ts`）；`toAiItem`、`Privacy`（`src/lib/ai/prompt.ts`）；`AgentTool`（pi-agent-core）；`Type`（pi-ai）
- Produces:
  - `interface ToolContext { roots(): TreeNode[]; tags(): Map<string, string[]>; privacy: Privacy; refs: RefTable; getPlan(): OrganizePlan; setPlan(plan: OrganizePlan): void; onAsk(question: string, options: string[]): void; onFinish(summary: string): void }`
  - `createOrganizeTools(ctx: ToolContext): AgentTool<any>[]`，工具名：`ask_user`、`set_scope`、`list_folders`、`list_bookmarks`、`propose_taxonomy`、`assign`、`finish`
  - `list_bookmarks` 结果的 `details` 形如 `{ refs: string[] }`（Task 6 用来判断哪些列表已处理）
  - 常量 `LIST_PAGE_MAX = 100`

- [ ] **Step 1: 写失败测试** `src/lib/agent/tools.test.ts`

```ts
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
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test src/lib/agent/tools.test.ts`
Expected: FAIL，`Cannot find module './tools'`。

- [ ] **Step 3: 实现** `src/lib/agent/tools.ts`

```ts
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
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test src/lib/agent/tools.test.ts && pnpm compile`
Expected: 全部通过；exit 0。若 `Type.Optional` 字段在 `execute` 参数上推断为 `unknown`，给 `defineTool` 显式标注 `AgentTool<typeof params>`（先把 `Type.Object(...)` 抽成 `const params`）。

- [ ] **Step 5: 提交**

提交两个文件，信息：`feat: 智能整理智能体工具`。

---

### Task 6: 上下文裁剪

**Files:**
- Create: `src/lib/agent/context.ts`
- Test: `src/lib/agent/context.test.ts`

**Interfaces:**
- Consumes: `OrganizePlan`（Task 3）、`RefTable`（Task 2）、`list_bookmarks` 结果 `details.refs`（Task 5）、`AgentMessage`（pi-agent-core）
- Produces:
  - `HANDLED_PLACEHOLDER = '（已处理，省略）'`
  - `pruneHandledListings(messages: AgentMessage[], plan: OrganizePlan, refs: RefTable): AgentMessage[]` —— 一页列表中的编号**全部**已分配时，替换其内容为占位文字；其余消息原样返回；不修改入参

- [ ] **Step 1: 写失败测试** `src/lib/agent/context.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import type { AgentMessage } from '@earendil-works/pi-agent-core';
import { HANDLED_PLACEHOLDER, pruneHandledListings } from './context';
import type { OrganizePlan } from './plan';
import { createRefTable } from './refs';

const refs = createRefTable(['a', 'b', 'c']); // a=b1 b=b2 c=b3
const plan: OrganizePlan = { scope: { folderIds: ['2'], rootFolderId: '1' }, categories: ['教程'], assignments: { a: '教程', b: '教程' } };

const listing = (id: string, listed: string[]): AgentMessage => ({
  role: 'toolResult',
  toolCallId: id,
  toolName: 'list_bookmarks',
  content: [{ type: 'text', text: `列表 ${listed.join(',')}` }],
  details: { refs: listed },
  isError: false,
  timestamp: 1,
});

describe('pruneHandledListings', () => {
  const messages: AgentMessage[] = [
    { role: 'user', content: '开始', timestamp: 1 },
    listing('l1', ['b1', 'b2']),
    listing('l2', ['b2', 'b3']),
    { role: 'toolResult', toolCallId: 'f', toolName: 'list_folders', content: [{ type: 'text', text: '目录' }], details: {}, isError: false, timestamp: 1 },
  ];

  it('replaces listings whose bookmarks are all assigned, keeping details', () => {
    const pruned = pruneHandledListings(messages, plan, refs);
    const first = pruned[1] as Extract<AgentMessage, { role: 'toolResult' }>;
    expect(first.content).toEqual([{ type: 'text', text: HANDLED_PLACEHOLDER }]);
    expect(first.details).toEqual({ refs: ['b1', 'b2'] });
  });

  it('keeps partially handled listings and other messages unchanged', () => {
    const pruned = pruneHandledListings(messages, plan, refs);
    expect(pruned[2]).toBe(messages[2]);
    expect(pruned[3]).toBe(messages[3]);
    expect(pruned[0]).toBe(messages[0]);
  });

  it('does not mutate the input', () => {
    pruneHandledListings(messages, plan, refs);
    expect((messages[1] as { content: { text: string }[] }).content[0]!.text).toBe('列表 b1,b2');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test src/lib/agent/context.test.ts`
Expected: FAIL，`Cannot find module './context'`。

- [ ] **Step 3: 实现** `src/lib/agent/context.ts`

```ts
import type { AgentMessage } from '@earendil-works/pi-agent-core';
import type { OrganizePlan } from './plan';
import type { RefTable } from './refs';

export const HANDLED_PLACEHOLDER = '（已处理，省略）';

const listedRefs = (message: AgentMessage): string[] | null => {
  if (message.role !== 'toolResult' || message.toolName !== 'list_bookmarks') return null;
  const refs = (message.details as { refs?: unknown } | undefined)?.refs;
  return Array.isArray(refs) ? refs.filter((r): r is string => typeof r === 'string') : null;
};

/** 书签已全部分配过的旧列表换成占位文字，避免上下文随书签数一直增长。 */
export function pruneHandledListings(messages: AgentMessage[], plan: OrganizePlan, refs: RefTable): AgentMessage[] {
  const handled = (ref: string) => {
    const id = refs.toId(ref);
    return id !== undefined && id in plan.assignments;
  };
  return messages.map((message) => {
    const listed = listedRefs(message);
    if (!listed || listed.length === 0 || !listed.every(handled) || message.role !== 'toolResult') return message;
    return { ...message, content: [{ type: 'text', text: HANDLED_PLACEHOLDER }] };
  });
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test src/lib/agent/context.test.ts && pnpm compile`
Expected: 3 passed；exit 0。

- [ ] **Step 5: 提交**

提交两个文件，信息：`feat: 智能体上下文裁剪`。

---

### Task 7: 系统提示词与会话组装

**Files:**
- Create: `src/lib/agent/systemPrompt.ts`
- Create: `src/lib/agent/session.ts`
- Test: `src/lib/agent/session.test.ts`

**Interfaces:**
- Consumes: `createOrganizeTools`、`ToolContext`（Task 5）；`pruneHandledListings`（Task 6）；`Agent`、`StreamFn`（pi-agent-core）；`Model`（pi-ai）
- Produces:
  - `SYSTEM_PROMPT: string`
  - `MAX_MODEL_CALLS = 60`
  - `interface OrganizeSession { agent: Agent; modelCalls(): number; grantMoreCalls(): void }`
  - `createOrganizeSession(options: { model: Model<any>; streamFn: StreamFn; toolContext: ToolContext; maxModelCalls?: number; onLimit?: () => void }): OrganizeSession`

停止条件（`shouldStopAfterTurn`）：本轮工具结果含 `ask_user` 或 `finish`，或模型调用次数（`turn_start` 计数）达到上限（此时调用 `onLimit`）。`grantMoreCalls` 把计数清零，供用户同意继续后使用。

- [ ] **Step 1: 写系统提示词** `src/lib/agent/systemPrompt.ts`

```ts
export const SYSTEM_PROMPT = [
  '你是 Bookmark Hub 的书签整理助手，帮用户把浏览器书签按主题重新整理成清晰的分类体系。你只能通过工具查看书签和记录方案，不能直接修改书签；用户会在预览里确认后才执行。',
  '',
  '工作流程：',
  '1. 先用 list_folders 了解目录，再用 ask_user 问用户：这次整理哪些目录？新的分类体系建在哪个目录下？选项写目录路径。',
  '2. 用户确认后调用 set_scope（使用目录 id）。',
  '3. 用 list_bookmarks 分页浏览范围内的书签，参考标题、域名和已有标签。',
  '4. 用 propose_taxonomy 提出分类体系，按主题分组，例如「文档 / 前端」「文档 / 后端」「文档 / 中台」「教程」「工具」；最多 3 层、30 个分类。提出后用 ask_user 请用户确认或调整。',
  '5. 用 assign 分配书签，每次可以传多个编号。',
  '6. 全部分完后调用 finish，用一句话总结。',
  '',
  '规则：',
  '- ask_user 必须单独调用，不要和其他工具放在同一轮。',
  '- 只使用 list_bookmarks 返回的编号，不要编造。',
  '- 用户中途插话时，优先按用户的意思调整。',
  '- 工具报错时，按错误信息修正后重试。',
  '- 回复简短，用中文。',
].join('\n');
```

- [ ] **Step 2: 写失败测试** `src/lib/agent/session.test.ts`

```ts
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
```

- [ ] **Step 3: 运行确认失败**

Run: `pnpm test src/lib/agent/session.test.ts`
Expected: FAIL，`Cannot find module './session'`。

- [ ] **Step 4: 实现** `src/lib/agent/session.ts`

```ts
import { Agent, type StreamFn } from '@earendil-works/pi-agent-core';
import type { Model } from '@earendil-works/pi-ai';
import { pruneHandledListings } from './context';
import { SYSTEM_PROMPT } from './systemPrompt';
import { createOrganizeTools, type ToolContext } from './tools';

export const MAX_MODEL_CALLS = 60;
const PAUSING_TOOLS = new Set(['ask_user', 'finish']);

export interface OrganizeSession {
  agent: Agent;
  modelCalls(): number;
  /** 用户同意继续后清零调用计数 */
  grantMoreCalls(): void;
}

export function createOrganizeSession(options: {
  model: Model<any>;
  streamFn: StreamFn;
  toolContext: ToolContext;
  maxModelCalls?: number;
  onLimit?: () => void;
}): OrganizeSession {
  const { model, streamFn, toolContext, maxModelCalls = MAX_MODEL_CALLS, onLimit } = options;
  let calls = 0;

  const agent = new Agent({
    initialState: { systemPrompt: SYSTEM_PROMPT, model, tools: createOrganizeTools(toolContext) },
    streamFn,
    // 工具会读写同一份方案，逐个执行避免交错
    toolExecution: 'sequential',
    transformContext: async (messages) => pruneHandledListings(messages, toolContext.getPlan(), toolContext.refs),
    // ask_user / finish 之后停下等用户；同轮混调其他工具时仅靠 terminate 不会停，这里兜底
    shouldStopAfterTurn: ({ toolResults }) => {
      if (toolResults.some((r) => PAUSING_TOOLS.has(r.toolName))) return true;
      if (calls >= maxModelCalls) {
        onLimit?.();
        return true;
      }
      return false;
    },
  });

  agent.subscribe((event) => {
    if (event.type === 'turn_start') calls += 1;
  });

  return {
    agent,
    modelCalls: () => calls,
    grantMoreCalls: () => {
      calls = 0;
    },
  };
}
```

- [ ] **Step 5: 运行确认通过**

Run: `pnpm test src/lib/agent/session.test.ts && pnpm compile`
Expected: 4 passed；exit 0。若 `fauxProvider` 在 vitest 中因 `tokensPerSecond` 节流导致超时，创建时传 `fauxProvider({ tokensPerSecond: 100000 })`。

- [ ] **Step 6: 提交**

提交三个文件，信息：`feat: 智能整理会话组装与系统提示词`。

---

### Task 8: 事件 → 对话记录

**Files:**
- Create: `src/lib/agent/transcript.ts`
- Test: `src/lib/agent/transcript.test.ts`

**Interfaces:**
- Consumes: `AgentEvent`（pi-agent-core）；工具名（Task 5）
- Produces:
  - `type TranscriptItem =`
    - `{ kind: 'user'; id: string; text: string }`
    - `| { kind: 'assistant'; id: string; text: string; streaming: boolean }`
    - `| { kind: 'tool'; id: string; label: string; status: 'running' | 'done' | 'error'; detail?: string }`
    - `| { kind: 'error'; id: string; text: string }`
  - `applyAgentEvent(items: TranscriptItem[], event: AgentEvent): TranscriptItem[]` —— 纯函数，返回新数组
  - `toolLabel(name: string, args: Record<string, unknown>): string`

- [ ] **Step 1: 写失败测试** `src/lib/agent/transcript.test.ts`

```ts
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
      { kind: 'tool', id: 't1', label: '分配 2 个书签到「教程」', status: 'done' },
      { kind: 'tool', id: 't2', label: '分配 1 个书签到「教程」', status: 'error', detail: '编号不存在：b9' },
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
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test src/lib/agent/transcript.test.ts`
Expected: FAIL，`Cannot find module './transcript'`。

- [ ] **Step 3: 实现** `src/lib/agent/transcript.ts`

```ts
import type { AgentEvent, AgentMessage } from '@earendil-works/pi-agent-core';

export type TranscriptItem =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'assistant'; id: string; text: string; streaming: boolean }
  | { kind: 'tool'; id: string; label: string; status: 'running' | 'done' | 'error'; detail?: string }
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
      return [...items, { kind: 'tool', id: event.toolCallId, label: toolLabel(event.toolName, event.args ?? {}), status: 'running' }];
    case 'tool_execution_end': {
      const detail = event.isError ? textOf({ role: 'toolResult', ...event.result } as AgentMessage).split('\n')[0] : undefined;
      return items.map((item) =>
        item.kind === 'tool' && item.id === event.toolCallId
          ? { ...item, status: event.isError ? 'error' : 'done', ...(detail ? { detail } : {}) }
          : item,
      );
    }
    default:
      return items;
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm test src/lib/agent/transcript.test.ts && pnpm compile`
Expected: 全部通过；exit 0。若 `findLastIndex` 在 `lib` 设置下报类型错误，改用 `items.map((x, i) => [x, i] as const).filter(...).at(-1)` 取索引。

- [ ] **Step 5: 提交**

提交两个文件，信息：`feat: 智能体事件转对话记录`。

---

### Task 9: 会话 store 与 hook

**Files:**
- Create: `src/lib/agent/store.ts`
- Create: `src/hooks/useOrganizeAgent.ts`
- Test: `src/lib/agent/store.test.ts`

**Interfaces:**
- Consumes: `createOrganizeSession`、`OrganizeSession`（Task 7）；`applyAgentEvent`、`TranscriptItem`（Task 8）；`createRefTable`（Task 2）；`emptyPlan`、`OrganizePlan`（Task 3）；`ToolContext`（Task 5）；`createAgentModel`（Task 1）；`AiConfig`
- Produces:
  - `type OrganizeStatus = 'idle' | 'running' | 'waiting' | 'finished' | 'limit' | 'error'`
  - `interface OrganizeState { status: OrganizeStatus; transcript: TranscriptItem[]; plan: OrganizePlan; question: { text: string; options: string[] } | null; summary: string | null; tokens: number }`
  - `interface OrganizeStoreDeps { getRoots(): TreeNode[]; getTags(): Map<string, string[]>; createModel(config: AiConfig): { model: Model<any>; streamFn: StreamFn }; maxModelCalls?: number }`
  - `interface OrganizeStore { getState(): OrganizeState; subscribe(listener: () => void): () => void; start(config: AiConfig): Promise<void>; send(text: string): Promise<void>; stop(): void; retry(): Promise<void>; continueAfterLimit(): Promise<void>; reset(): void }`
  - `createOrganizeStore(deps: OrganizeStoreDeps): OrganizeStore`
  - `useOrganizeAgent(roots: TreeNode[], tags: Map<string, string[]>): { state: OrganizeState; store: OrganizeStore }`（模块级单例，切换页面不丢会话）

- [ ] **Step 1: 写失败测试** `src/lib/agent/store.test.ts`

```ts
import { describe, expect, it } from 'vitest';
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
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm test src/lib/agent/store.test.ts`
Expected: FAIL，`Cannot find module './store'`。

- [ ] **Step 3: 实现** `src/lib/agent/store.ts`

```ts
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
  const listeners = new Set<() => void>();

  const set = (patch: Partial<OrganizeState>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };

  const lastFailed = () => {
    const last = session?.agent.state.messages.at(-1);
    return last?.role === 'assistant' && last.stopReason === 'error';
  };

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
    if (pause?.kind === 'ask') return set({ status: 'waiting', question: { text: pause.text, options: pause.options } });
    if (pause?.kind === 'finish') return set({ status: 'finished', summary: pause.summary });
    if (pause?.kind === 'limit') return set({ status: 'limit' });
    set({ status: 'idle' });
  }

  function reset() {
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
      session.agent.subscribe((event) => {
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
```

- [ ] **Step 4: 实现 hook** `src/hooks/useOrganizeAgent.ts`

```ts
import { useEffect, useSyncExternalStore } from 'react';
import type { TreeNode } from '@/lib/bookmarks';
import { createAgentModel } from '@/lib/agent/model';
import { createOrganizeStore } from '@/lib/agent/store';

// 模块级：切换 Dashboard 页面不丢会话；工具通过 getter 读取最新书签树和标签
const environment: { roots: TreeNode[]; tags: Map<string, string[]> } = { roots: [], tags: new Map() };

const store = createOrganizeStore({
  getRoots: () => environment.roots,
  getTags: () => environment.tags,
  createModel: createAgentModel,
});

export function useOrganizeAgent(roots: TreeNode[], tags: Map<string, string[]>) {
  useEffect(() => {
    environment.roots = roots;
    environment.tags = tags;
  }, [roots, tags]);
  const state = useSyncExternalStore(store.subscribe, store.getState);
  return { state, store };
}
```

- [ ] **Step 5: 运行确认通过**

Run: `pnpm test src/lib/agent/store.test.ts && pnpm compile`
Expected: 5 passed；exit 0。若 retry 用例里 `continue()` 报「最后一条必须是用户或工具结果」，确认失败的助手消息已从 `agent.state.messages` 移除。

- [ ] **Step 6: 提交**

提交三个文件，信息：`feat: 智能整理会话 store 与 hook`。

---

### Task 10: 清理旧的一次性整理，拆出 AI 标签卡片

**Files:**
- Create: `src/lib/ai/json.ts`（从 `parse.ts` 迁出 `extractJson`、`INVALID_JSON`）
- Modify: `src/lib/ai/tags.ts`（改为从 `./json` 导入）
- Modify: `src/lib/ai/prompt.ts`（删除 `SYSTEM_PROMPT`、`buildMessages`，保留 `Privacy`、`PRIVACY_LABEL`、`AiItem`、`ChatMessage`、`toAiItem`）
- Modify: `src/lib/ai/prompt.test.ts`（删除 `describe('buildMessages')`）
- Delete: `src/lib/ai/organize.ts`、`src/lib/ai/organize.test.ts`、`src/lib/ai/parse.ts`、`src/lib/ai/parse.test.ts`
- Create: `src/components/AiTagsCard.tsx`（从 `OrganizeView.tsx` 拆出，行为不变）

**Interfaces:**
- Produces:
  - `extractJson(content: string): unknown`、`INVALID_JSON: string`（`src/lib/ai/json.ts`）
  - `AiTagsCard({ index, config }: { index: BookmarkIndex; config: AiConfig })`

说明：`OrganizeView.tsx` 本任务**先不删**（仍被 `App.tsx` 引用，且依赖 `organize.ts`），因此本任务里先把 `OrganizeView.tsx` 中对 `organize.ts`、`parse.ts` 的依赖连同整理部分一并移除、只保留 `<AiTagsCard>`，Task 11 再用新页面替换它。

- [ ] **Step 1: 迁出 JSON 提取** `src/lib/ai/json.ts`

```ts
export const INVALID_JSON = 'AI 返回的内容不是有效的 JSON';

/** 容忍 ```json 代码块和前后说明文字：取第一个 { 到最后一个 }。 */
export function extractJson(content: string): unknown {
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error(INVALID_JSON);
  try {
    return JSON.parse(content.slice(start, end + 1));
  } catch {
    throw new Error(INVALID_JSON);
  }
}
```

- [ ] **Step 2: 改 `tags.ts` 的导入**

把 `import { extractJson, INVALID_JSON } from './parse';` 改为 `import { extractJson, INVALID_JSON } from './json';`。

- [ ] **Step 3: 删除旧实现**

Run:
```bash
git rm src/lib/ai/organize.ts src/lib/ai/organize.test.ts src/lib/ai/parse.ts src/lib/ai/parse.test.ts
```
在 `src/lib/ai/prompt.ts` 删除 `SYSTEM_PROMPT` 常量与 `buildMessages` 函数；在 `src/lib/ai/prompt.test.ts` 删除 `buildMessages` 的导入与 `describe('buildMessages', …)` 整块。

- [ ] **Step 4: 新建** `src/components/AiTagsCard.tsx`

```tsx
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Tags } from 'lucide-react';
import type { BookmarkIndex } from '@/lib/bookmarks';
import { requestAiHostPermission, type AiConfig } from '@/lib/ai/config';
import { chatCompletion } from '@/lib/ai/client';
import { estimateRequests } from '@/lib/ai/batches';
import { runTagging } from '@/lib/ai/tags';
import { useTags } from '@/hooks/useTags';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

export function AiTagsCard({ index, config }: { index: BookmarkIndex; config: AiConfig }) {
  const { tags, save } = useTags();
  const [tagging, setTagging] = useState(false);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const untagged = useMemo(() => index.bookmarks.filter((b) => !tags.has(b.url)), [index, tags]);
  const bookmarkById = useMemo(() => new Map(index.bookmarks.map((b) => [b.id, b])), [index]);

  async function generate() {
    // 授权须是点击后的第一个 await
    const access = await requestAiHostPermission(config.baseUrl);
    if (access !== 'granted') {
      if (access === 'denied') toast.error('没有获得访问 AI 服务地址的权限');
      return;
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    setTagging(true);
    setProgress(null);
    try {
      const res = await runTagging(
        (messages) => chatCompletion(config, messages, { signal: controller.signal }),
        { bookmarks: untagged, privacy: config.privacy },
        { signal: controller.signal, onProgress: (done, total) => setProgress([done, total]) },
      );
      const entries = [...res.tags].flatMap(([id, bookmarkTags]): [string, string[]][] => {
        const b = bookmarkById.get(id);
        return b ? [[b.url, bookmarkTags]] : [];
      });
      await save(entries);
      if (res.failures.length > 0) toast.warning(`${res.failures.length} 批请求失败：${res.failures[0]}`);
      else if (!controller.signal.aborted) toast.success(`已为 ${entries.length} 个书签生成标签`);
    } catch (e) {
      toast.error(`生成标签失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTagging(false);
      controllerRef.current = null;
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <CardTitle className="text-base">AI 标签</CardTitle>
          <CardDescription>给书签打上主题标签，搜索时能按标签找到。标签只存在本机，不改动浏览器书签。</CardDescription>
        </div>
        {tagging ? (
          <Button variant="outline" onClick={() => controllerRef.current?.abort()}>
            停止
          </Button>
        ) : (
          <Button variant="outline" disabled={untagged.length === 0} onClick={() => void generate()}>
            <Tags />
            生成标签
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>
          {untagged.length > 0
            ? `${untagged.length} 个书签还没有标签，约 ${estimateRequests(untagged.length)} 次请求。`
            : '所有书签都有标签了。'}
        </p>
        {tagging && progress && (
          <div className="space-y-2">
            <Progress value={(progress[0] / progress[1]) * 100} aria-label="标签生成进度" />
            <p className="tabular-nums">
              第 {progress[0]} / {progress[1]} 批
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: 精简 `OrganizeView.tsx` 为过渡版本**（Task 11 会整体替换）

用以下内容整体替换 `src/components/OrganizeView.tsx`：

```tsx
import { useEffect, useState } from 'react';
import type { BookmarkIndex, TreeNode } from '@/lib/bookmarks';
import { loadAiConfig, type AiConfig } from '@/lib/ai/config';
import { Button } from '@/components/ui/button';
import { AiTagsCard } from './AiTagsCard';

interface Props {
  index: BookmarkIndex;
  roots: TreeNode[];
  onOpenSettings: () => void;
}

export function OrganizeView({ index, onOpenSettings }: Props) {
  const [config, setConfig] = useState<AiConfig | null | undefined>(undefined);
  useEffect(() => {
    void loadAiConfig().then(setConfig);
  }, []);
  if (config === undefined) return null;
  if (!config) {
    return (
      <section className="mx-auto max-w-3xl space-y-4 p-8">
        <h1 className="text-2xl font-semibold">智能整理</h1>
        <p className="text-sm text-muted-foreground">先在设置里配置一个 OpenAI 兼容的 AI 服务。</p>
        <Button onClick={onOpenSettings}>去设置</Button>
      </section>
    );
  }
  return (
    <section className="mx-auto max-w-4xl space-y-5 p-8">
      <h1 className="text-2xl font-semibold">智能整理</h1>
      <AiTagsCard index={index} config={config} />
    </section>
  );
}
```

- [ ] **Step 6: 验证**

Run: `pnpm test && pnpm compile && pnpm build`
Expected: 测试全部通过（`organize` / `parse` 相关用例已随文件删除，`tags` 用例仍覆盖无效 JSON）；`tsc` exit 0；构建成功。
再运行：`git grep -n "ai/organize\|ai/parse\|buildMessages" -- src`
Expected: 无输出。

- [ ] **Step 7: 提交**

提交本任务所有改动（含删除），信息：`refactor: 移除一次性智能整理，拆出 AI 标签卡片`。

---

### Task 11: 对话 / 方案 / 预览界面，接入「智能整理」页

**Files:**
- Create: `src/components/agent/ChatPanel.tsx`
- Create: `src/components/agent/PlanPanel.tsx`
- Create: `src/components/agent/PlanPreviewDialog.tsx`
- Create: `src/components/AgentOrganizeView.tsx`
- Modify: `src/entrypoints/dashboard/App.tsx`（`OrganizeView` → `AgentOrganizeView`）
- Delete: `src/components/OrganizeView.tsx`

**Interfaces:**
- Consumes: `OrganizeState`、`useOrganizeAgent`（Task 9）；`OrganizePlan`、`summarizePlan`（Task 3）；`planToIntents`（Task 4）；`AiTagsCard`（Task 10）；`runBatch`（`src/lib/actions.ts`）；`requestAiHostPermission`、`loadAiConfig`、`AiConfig`；`PRIVACY_LABEL`；`skipReason`；`listFolders`；`useTags`
- Produces: `AgentOrganizeView({ index, roots, onOpenSettings }: { index: BookmarkIndex; roots: TreeNode[]; onOpenSettings: () => void })`

- [ ] **Step 1: 对话面板** `src/components/agent/ChatPanel.tsx`

```tsx
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
```

- [ ] **Step 2: 方案面板** `src/components/agent/PlanPanel.tsx`

```tsx
import { listFolders, type TreeNode } from '@/lib/bookmarks';
import { summarizePlan, type OrganizePlan } from '@/lib/agent/plan';
import { Button } from '@/components/ui/button';

interface Props {
  plan: OrganizePlan;
  roots: TreeNode[];
  scopeBookmarkIds: string[];
  highlight: boolean;
  onPreview: () => void;
}

export function PlanPanel({ plan, roots, scopeBookmarkIds, highlight, onPreview }: Props) {
  const folderPath = new Map(listFolders(roots).map((f) => [f.id, f.path]));
  const { counts, unassigned } = summarizePlan(plan, scopeBookmarkIds);
  const hasAssignments = Object.keys(plan.assignments).length > 0;

  return (
    <aside className="space-y-4 rounded-xl border p-4">
      <h2 className="font-semibold">整理方案</h2>
      <dl className="space-y-2 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">整理范围</dt>
          <dd>{plan.scope ? plan.scope.folderIds.map((id) => folderPath.get(id) ?? id).join('、') : '尚未确认'}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">新体系建在</dt>
          <dd>{plan.scope ? (folderPath.get(plan.scope.rootFolderId) ?? plan.scope.rootFolderId) : '尚未确认'}</dd>
        </div>
      </dl>
      {plan.categories.length === 0 ? (
        <p className="text-sm text-muted-foreground">智能体提出分类体系后会显示在这里。</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {plan.categories.map((category) => (
            <li key={category} className="flex justify-between gap-2">
              <span className="truncate">{category}</span>
              <span className="text-muted-foreground tabular-nums">{counts[category] ?? 0}</span>
            </li>
          ))}
          <li className="flex justify-between border-t pt-1 text-muted-foreground">
            <span>未归类</span>
            <span className="tabular-nums">{unassigned}</span>
          </li>
        </ul>
      )}
      <Button className="w-full" variant={highlight ? 'default' : 'outline'} disabled={!hasAssignments} onClick={onPreview}>
        预览并确认整理
      </Button>
    </aside>
  );
}
```

- [ ] **Step 3: 预览确认** `src/components/agent/PlanPreviewDialog.tsx`

```tsx
import { useMemo } from 'react';
import type { TreeNode } from '@/lib/bookmarks';
import { planToIntents } from '@/lib/agent/applyPlan';
import type { OrganizePlan } from '@/lib/agent/plan';
import { runBatch } from '@/lib/actions';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: OrganizePlan;
  roots: TreeNode[];
  inScope: (id: string) => boolean;
  bookmarkTitle: (id: string) => string;
}

export function PlanPreviewDialog({ open, onOpenChange, plan, roots, inScope, bookmarkTitle }: Props) {
  const result = useMemo(() => (open && plan.scope ? planToIntents(plan, roots, inScope) : null), [open, plan, roots, inScope]);
  const byCategory = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const [id, category] of Object.entries(plan.assignments)) groups.set(category, [...(groups.get(category) ?? []), id]);
    return [...groups];
  }, [plan]);

  async function confirm() {
    if (!result) return;
    const skipped = result.skipped > 0 ? `，跳过 ${result.skipped} 个已变动的书签` : '';
    const ok = await runBatch('AI 智能整理', result.intents, `已移动 ${result.moved} 个书签${skipped}`);
    if (ok) onOpenChange(false);
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>确认整理</AlertDialogTitle>
          <AlertDialogDescription>执行前会自动创建恢复点，可以在「操作记录」里撤销。开启 Chrome 同步时，改动会同步到其他设备。</AlertDialogDescription>
        </AlertDialogHeader>
        {result && (
          <div className="space-y-3 text-sm">
            <ul className="grid grid-cols-3 gap-2 text-center">
              <li className="rounded-lg border p-2">
                <p className="text-lg font-semibold tabular-nums">{result.createdFolders}</p>
                <p className="text-xs text-muted-foreground">新建目录</p>
              </li>
              <li className="rounded-lg border p-2">
                <p className="text-lg font-semibold tabular-nums">{result.moved}</p>
                <p className="text-xs text-muted-foreground">移动书签</p>
              </li>
              <li className="rounded-lg border p-2">
                <p className="text-lg font-semibold tabular-nums">{result.skipped}</p>
                <p className="text-xs text-muted-foreground">跳过</p>
              </li>
            </ul>
            <div className="max-h-64 space-y-1 overflow-auto">
              {byCategory.map(([category, ids]) => (
                <details key={category} className="rounded-md border px-3 py-1.5">
                  <summary className="cursor-pointer">
                    {category}（{ids.length}）
                  </summary>
                  <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                    {ids.map((id) => (
                      <li key={id} className="truncate">
                        {bookmarkTitle(id)}
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction disabled={!result || result.intents.length === 0} onClick={() => void confirm()}>
            确认整理
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 4: 页面** `src/components/AgentOrganizeView.tsx`

```tsx
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { BookmarkIndex, TreeNode } from '@/lib/bookmarks';
import { loadAiConfig, requestAiHostPermission, type AiConfig } from '@/lib/ai/config';
import { PRIVACY_LABEL } from '@/lib/ai/prompt';
import { skipReason } from '@/lib/scan/rules';
import { useOrganizeAgent } from '@/hooks/useOrganizeAgent';
import { useTags } from '@/hooks/useTags';
import { Button } from '@/components/ui/button';
import { AiTagsCard } from './AiTagsCard';
import { ChatPanel } from './agent/ChatPanel';
import { PlanPanel } from './agent/PlanPanel';
import { PlanPreviewDialog } from './agent/PlanPreviewDialog';

interface Props {
  index: BookmarkIndex;
  roots: TreeNode[];
  onOpenSettings: () => void;
}

export function AgentOrganizeView({ index, roots, onOpenSettings }: Props) {
  const [config, setConfig] = useState<AiConfig | null | undefined>(undefined);
  const [previewOpen, setPreviewOpen] = useState(false);
  const { tags } = useTags();
  const { state, store } = useOrganizeAgent(roots, tags);

  useEffect(() => {
    void loadAiConfig().then(setConfig);
  }, []);

  const scopeIds = useMemo(() => {
    const folders = state.plan.scope?.folderIds ?? [];
    return index.bookmarks
      .filter((b) => b.ancestorIds.some((a) => folders.includes(a)) && skipReason(b.url) !== 'intranet')
      .map((b) => b.id);
  }, [index, state.plan.scope]);
  const inScope = useMemo(() => {
    const ids = new Set(scopeIds);
    return (id: string) => ids.has(id);
  }, [scopeIds]);
  const bookmarkTitle = useMemo(() => {
    const titles = new Map(index.bookmarks.map((b) => [b.id, b.title || b.url]));
    return (id: string) => titles.get(id) ?? id;
  }, [index]);

  async function start() {
    if (!config) return;
    // 授权须是点击后的第一个 await
    const access = await requestAiHostPermission(config.baseUrl);
    if (access !== 'granted') {
      if (access === 'denied') toast.error('没有获得访问 AI 服务地址的权限');
      return;
    }
    await store.start(config);
  }

  if (config === undefined) return null;
  if (!config) {
    return (
      <section className="mx-auto max-w-3xl space-y-4 p-8">
        <h1 className="text-2xl font-semibold">智能整理</h1>
        <p className="text-sm text-muted-foreground">
          智能体会和你对话，梳理出一套分类体系并按它重排书签。先在设置里配置一个支持工具调用的 OpenAI 兼容服务。
        </p>
        <Button onClick={onOpenSettings}>去设置</Button>
      </section>
    );
  }

  return (
    <section className="space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">智能整理</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          智能体会问清范围、提出分类体系，你确认后才会移动书签，执行前自动创建恢复点。当前发送给 AI：{PRIVACY_LABEL[config.privacy]}。
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <ChatPanel
          state={state}
          onStart={() => void start()}
          onSend={(text) => void store.send(text)}
          onStop={() => store.stop()}
          onRetry={() => void store.retry()}
          onContinue={() => void store.continueAfterLimit()}
        />
        <div className="space-y-3">
          <PlanPanel
            plan={state.plan}
            roots={roots}
            scopeBookmarkIds={scopeIds}
            highlight={state.status === 'finished'}
            onPreview={() => setPreviewOpen(true)}
          />
          {state.transcript.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => store.reset()}>
              重新开始
            </Button>
          )}
        </div>
      </div>
      <PlanPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        plan={state.plan}
        roots={roots}
        inScope={inScope}
        bookmarkTitle={bookmarkTitle}
      />
      <AiTagsCard index={index} config={config} />
    </section>
  );
}
```

- [ ] **Step 5: 接入 App 并删除旧页面**

在 `src/entrypoints/dashboard/App.tsx`：
- 把 `import { OrganizeView } from '@/components/OrganizeView';` 改为 `import { AgentOrganizeView } from '@/components/AgentOrganizeView';`
- 把 `<OrganizeView index={index} roots={tree} onOpenSettings={() => setView('settings')} />` 改为 `<AgentOrganizeView index={index} roots={tree} onOpenSettings={() => setView('settings')} />`

Run: `git rm src/components/OrganizeView.tsx`

- [ ] **Step 6: 验证**

Run: `pnpm test && pnpm compile && pnpm build`
Expected: 全部通过；构建成功。
Run: `git grep -n "OrganizeView\b" -- src`
Expected: 只剩 `AgentOrganizeView` 相关行。

- [ ] **Step 7: 提交**

提交本任务所有改动，信息：`feat: 智能整理对话界面、方案面板与预览确认`。

---

### Task 12: 端到端测试与收尾

**Files:**
- Modify: `package.json`（新增 `playwright` 开发依赖与 `e2e` 脚本）
- Create: `e2e/agent-organize.mjs`
- Modify: `C:\Users\yutao\.claude\projects\D--fusion\memory\project_bookmark_hub.md`（进度）

**Interfaces:**
- Consumes: 构建产物 `.output/chrome-mv3`；设置存储键 `aiConfig`（`src/lib/ai/config.ts`）；界面文案「智能整理」「开始整理」「已完成，去右侧预览并确认」「预览并确认整理」「确认整理」「操作记录」「撤销」
- Produces: `pnpm e2e` —— 退出码 0 表示整条链路通过

- [ ] **Step 1: 安装 Playwright**

Run: `pnpm add -D -E playwright@latest && pnpm exec playwright install chromium`
在 `package.json` 的 `scripts` 中加入 `"e2e": "pnpm build && node e2e/agent-organize.mjs"`。

- [ ] **Step 2: 写端到端脚本** `e2e/agent-organize.mjs`

```js
// 端到端：本地假 OpenAI 兼容服务按轮次返回工具调用，走完整个智能整理流程并验证撤销。
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const SRC = path.resolve('.output/chrome-mv3');
const AI_HOST = 'ai.test';

// ---------- 假模型：按请求里已有的助手消息数决定下一步 ----------
const lastToolText = (messages, name) => {
  const calls = new Map();
  for (const m of messages) if (m.role === 'assistant') for (const c of m.tool_calls ?? []) calls.set(c.id, c.function.name);
  const result = [...messages].reverse().find((m) => m.role === 'tool' && calls.get(m.tool_call_id) === name);
  return typeof result?.content === 'string' ? result.content : (result?.content ?? []).map((c) => c.text ?? '').join('');
};

function nextToolCall(messages) {
  const step = messages.filter((m) => m.role === 'assistant').length;
  const folders = lastToolText(messages, 'list_folders').split('\n').map((l) => l.split(' | '));
  const idOf = (name) => folders.find(([, p]) => p === name)?.[0];
  const listing = lastToolText(messages, 'list_bookmarks').split('\n').filter((l) => /^b\d+ \|/.test(l));
  const refsWhere = (re) => listing.filter((l) => re.test(l)).map((l) => l.split(' | ')[0]);
  switch (step) {
    case 0: return ['list_folders', {}];
    case 1: return ['ask_user', { question: '这次整理哪些目录？', options: ['其他书签'] }];
    case 2: return ['set_scope', { folderIds: [idOf('其他书签')], rootFolderId: idOf('书签栏') }];
    case 3: return ['list_bookmarks', { folderId: idOf('其他书签') }];
    case 4: return ['propose_taxonomy', { categories: ['文档 / 前端', '教程'] }];
    case 5: return ['assign', { refs: refsWhere(/React|Vue/), category: '文档 / 前端' }];
    case 6: return ['assign', { refs: refsWhere(/Go|Rust/), category: '教程' }];
    case 7: return ['finish', { summary: '分成「文档 / 前端」和「教程」两类' }];
    default: return null;
  }
}

const chunk = (delta, finish = null) =>
  `data: ${JSON.stringify({ id: 'c', object: 'chat.completion.chunk', created: 0, model: 'mock', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;

const server = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const { messages } = JSON.parse(raw || '{}');
    const call = nextToolCall(messages ?? []);
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    if (call) {
      const [name, args] = call;
      res.write(chunk({ role: 'assistant', content: null, tool_calls: [{ index: 0, id: `call_${messages.length}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }));
      res.write(chunk({}, 'tool_calls'));
    } else {
      res.write(chunk({ role: 'assistant', content: '好的。' }));
      res.write(chunk({}, 'stop'));
    }
    res.end('data: [DONE]\n\n');
  });
});

const fail = (message) => {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
};

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

// 测试副本：直接授予网站权限，免去自动化里无法点击的授权框
const extDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-e2e-ext-'));
fs.cpSync(SRC, extDir, { recursive: true });
const manifestPath = path.join(extDir, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
manifest.host_permissions = ['<all_urls>'];
fs.writeFileSync(manifestPath, JSON.stringify(manifest));

const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'bh-e2e-')), {
  headless: true,
  args: [
    `--disable-extensions-except=${extDir}`,
    `--load-extension=${extDir}`,
    `--host-resolver-rules=MAP ${AI_HOST} 127.0.0.1`,
    '--no-proxy-server',
  ],
});

try {
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const page = await ctx.newPage();
  page.setDefaultTimeout(30_000);
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`chrome-extension://${new URL(sw.url()).host}/dashboard.html`);

  const otherId = await page.evaluate(async (baseUrl) => {
    await chrome.storage.local.set({ aiConfig: { baseUrl, apiKey: 'sk-test', model: 'mock', privacy: 'title_domain' } });
    for (const [title, url] of [['React 文档', 'https://react.dev/'], ['Vue 指南', 'https://vuejs.org/guide/'], ['Go 教程', 'https://go.dev/tour/'], ['Rust 教程', 'https://doc.rust-lang.org/book/']]) {
      await chrome.bookmarks.create({ parentId: '2', title, url });
    }
    return '2';
  }, `http://${AI_HOST}:${port}/v1`);
  await page.reload();

  await page.getByRole('button', { name: '智能整理' }).click();
  await page.getByRole('button', { name: '开始整理' }).click();
  await page.getByRole('button', { name: '其他书签', exact: true }).click();
  await page.getByText('已完成，去右侧预览并确认').waitFor();
  await page.getByRole('button', { name: '预览并确认整理' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '确认整理' }).click();
  await page.getByText(/已移动 4 个书签/).waitFor();

  const after = await page.evaluate(async () => {
    const [bar] = await chrome.bookmarks.getSubTree('1');
    const find = (node, title) => node.children?.find((c) => c.title === title);
    const docs = find(bar, '文档');
    const titles = (node) => (node?.children ?? []).map((c) => c.title).sort();
    return { frontend: titles(find(docs ?? {}, '前端')), tutorials: titles(find(bar, '教程')) };
  });
  if (JSON.stringify(after) !== JSON.stringify({ frontend: ['React 文档', 'Vue 指南'], tutorials: ['Go 教程', 'Rust 教程'] })) {
    fail(`整理结果不对：${JSON.stringify(after)}`);
  } else console.log('PASS: 书签已按体系移动');

  await page.getByRole('button', { name: '操作记录' }).click();
  await page.getByRole('button', { name: '撤销' }).first().click();
  // 提示「已撤销 N 项操作」和列表里的「已撤销」会同时出现，取第一个避免严格模式报错
  await page.getByText(/已撤销/).first().waitFor();
  const restored = await page.evaluate(async (id) => {
    const back = (await chrome.bookmarks.getChildren(id)).map((c) => c.title).sort();
    const barFolders = (await chrome.bookmarks.getChildren('1')).filter((c) => !c.url).map((c) => c.title);
    return { back, barFolders };
  }, otherId);
  if (restored.back.length !== 4 || restored.barFolders.length !== 0) fail(`撤销后未恢复：${JSON.stringify(restored)}`);
  else console.log('PASS: 撤销后书签回到原处，新建目录已删除');
} finally {
  await ctx.close();
  server.close();
}
```

- [ ] **Step 3: 运行端到端测试**

Run: `pnpm e2e`
Expected: 输出两行 `PASS`，退出码 0。若卡在「其他书签」按钮，检查 `ChatPanel` 的提问卡片是否在 `status === 'waiting'` 时渲染；若 502，确认启动参数含 `--no-proxy-server`。

- [ ] **Step 4: 真实模型手动验证（由用户执行）**

1. `pnpm build`，在 `chrome://extensions` 重新加载扩展（manifest 未变时也需要重新加载以更新页面代码）。
2. 设置页填 DeepSeek（`https://api.deepseek.com/v1`，`deepseek-chat`）或通义（`https://dashscope.aliyuncs.com/compatible-mode/v1`，`qwen-plus`）的 Key 并保存。
3. 「智能整理」→「开始整理」，回答范围问题，在对话中插话调整一次，确认预览，执行后到「操作记录」撤销一次。
4. 记录：模型名、是否正确停在提问处、是否出现「模型不支持工具调用」等错误。

- [ ] **Step 5: 更新记忆**

在 `project_bookmark_hub.md` 的进度行把「智能整理改成智能体（进行中）」改为「✅（Pi SDK，src/lib/agent/*，e2e: pnpm e2e）」，并记下真实模型验证结果。

- [ ] **Step 6: 提交**

提交 `package.json`、`pnpm-lock.yaml`、`e2e/agent-organize.mjs`，信息：`test: 智能整理端到端测试`。
