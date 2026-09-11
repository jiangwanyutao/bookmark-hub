# 智能整理智能体 · 设计

- 日期：2026-09-11
- 状态：设计已逐段确认，待实现计划
- 取代：现有「智能整理」的一次性分批建议（`runOrganize` + 「建议新建目录」卡片）

## 1. 目标

把「智能整理」做成一个对话式智能体：它先问清整理范围，查看书签，提出一套整体分类体系
（例如「文档 / 前端、文档 / 后端、文档 / 中台」「教程」），用户可随时插话调整，
最后按体系**真的重排浏览器书签文件夹**——先预览、确认后执行、可撤销。

参考：[huggingface/tau](https://github.com/huggingface/tau)（Python 版 Pi 编程智能体）、
[dg-ai-notes](https://github.com/buchidonggua/dg-ai-notes)（Pi-Agent SDK 中文教程）。

## 2. 已确认的决定

| 议题 | 决定 |
|---|---|
| AI 服务 | 仅 OpenAI 兼容接口，沿用设置页的 Base URL + API Key + 模型名 |
| 实现方式 | 用 Pi SDK：`@earendil-works/pi-agent-core` + `@earendil-works/pi-ai`，锁定精确版本 `0.85.1` |
| 产出 | 按体系重排 Chrome 书签文件夹（预览确认、执行前建恢复点、可撤销） |
| 整理范围 | 不预设，由智能体通过 `ask_user` 在对话里问用户 |
| 新体系建在哪 | 同样由智能体问用户确认 |

## 3. 可行性验证（一次性，代码已丢弃）

- **打包**：Vite 以浏览器目标打包 `Agent` + `createProvider(openAICompletionsApi)` 成功，
  主包 191KB + 按需加载的 openai-completions 166KB，合计约 100KB gzip。
  `pi-ai/utils/provider-env.js` 引用的 `node:fs` 被外置（仅用于从环境变量取 Key，本项目显式传 Key，走不到）。
- **运行**：Chromium 中跑真实 Agent 循环，对接本地假 OpenAI 兼容服务：
  模型请求工具 → `list_folders` 执行 1 次 → 工具结果以 `tool` 角色回传 → 模型给出最终回答，
  事件序列与文档一致。

## 4. 架构

新增 `src/lib/agent/`：

| 文件 | 职责 | 依赖 |
|---|---|---|
| `model.ts` | 由 `AiConfig` 构造 pi-ai 的 `Model` 与 `createProvider(openAICompletionsApi)` | pi-ai |
| `plan.ts` | 整理方案暂存区（纯数据）：分类体系、书签分配、校验、转成操作记录批次 | `history.ts` 的 `Intent` |
| `tools.ts` | 智能体工具；书签数据与方案通过参数注入，可脱离浏览器测试 | `plan.ts`、pi-agent-core 类型、TypeBox |
| `context.ts` | `transformContext`：裁剪已处理的书签列表 | pi-agent-core 类型 |
| `session.ts` | 组装 `Agent`：系统提示词、工具、事件订阅、`ask_user` 暂停/恢复 | 以上全部 |

界面：`src/components/AgentOrganizeView.tsx`（及拆出的对话、方案子组件），替换现有 `OrganizeView` 的整理部分；
「AI 标签」卡片保留在页面下方。

## 5. 智能体工具

所有工具只读或写入暂存方案，**不直接修改 Chrome 书签**。

| 工具 | 参数 | 行为 |
|---|---|---|
| `ask_user` | `question`，`options?: string[]` | 界面显示提问卡片；返回 `terminate: true`，智能体停下等待；用户回答后以 `prompt()` 继续 |
| `set_scope` | `folderIds: string[]`，`rootFolderId` | 记录用户同意的整理范围与新体系建在哪个目录下；右栏显示，供用户核对 |
| `list_folders` | 无 | 目录树及每个目录的书签数 |
| `list_bookmarks` | `folderId`，`offset`，`limit ≤ 100` | 分页返回该目录（含各级子目录）下的书签：`b12 \| 标题 \| 域名 \| 标签`；按隐私等级决定字段；内网书签不返回；网址去掉敏感参数 |
| `propose_taxonomy` | `categories: string[]`（路径，如「文档 / 前端」） | 提交或替换分类体系；界面右栏实时显示 |
| `assign` | `refs: string[]`，`category` | 把一批书签分到某分类，写入方案；只接受整理范围内的书签 |
| `finish` | `summary` | 结束；界面高亮「预览并确认整理」 |

书签编号 `b1、b2…` 在一次会话内固定映射到真实 id，模型看不到真实 id。

**`ask_user` 必须真的停下**：pi-agent-core 只有当同一批工具结果**全部** `terminate` 时才会停。
因此系统提示词要求 `ask_user` 单独调用；另外用 `shouldStopAfterTurn` 兜底——本轮只要调用过 `ask_user`，
本轮结束后即停下等待用户。`set_scope` 之前调用 `assign` 会报错，提示先确认范围。

## 6. 方案（plan.ts）与执行

- **分类体系约束**：最多 3 层；每级名称 1–30 字；最多 30 个分类；路径分隔符统一为「 / 」（两侧空格不敏感）。
- **分配约束**：编号必须存在且在整理范围内；分类必须在当前体系内；同一书签重复分配以最后一次为准。
- **体系变更**：`propose_taxonomy` 替换体系时，分到已不存在分类的书签回到「未归类」。
- **转成批次**：体系根建在用户确认的位置；分类对应的目录已存在则复用，否则用 `create` + `ref` 新建；
  书签用 `move` 移入（`parentId` 可引用本批次 `ref`）。整个方案是**一个批次**，执行前自动建恢复点，可撤销。
- **执行时冲突**：书签已被删除或已不在范围内的跳过并计数，执行后告知用户。

## 7. 对话界面

两栏：

- **左栏对话**：智能体回复流式显示；每次工具调用显示一行进度（如「正在查看「其他书签」第 1–50 个书签」）；
  `ask_user` 显示为卡片，有选项给按钮，也可自由输入。
- **输入框**：智能体运行中发送 → `agent.steer()`（当前一步完成后生效）；
  智能体停下等待时发送 → `agent.prompt()`。「停止」→ `agent.abort()`。
- **右栏方案**：分类体系树 + 每类已分配书签数，实时更新；「未归类」单独列出。
- **预览并确认**：`finish` 后高亮，也可随时点击。弹窗显示新建目录数、移动书签数，可按分类展开明细；
  确认后执行批次。
- **生命周期**：切换 Dashboard 页面不丢对话（会话状态放在页面级模块）；关闭标签页丢失，已执行的整理不受影响。
  需要时再持久化到 IndexedDB。

## 8. 上下文与费用

- 书签分页读取，单行压缩格式，编号代替 id。
- `transformContext`：已被分配过的书签所在的旧 `list_bookmarks` 结果替换为「（已处理，省略）」。
- `assign` 支持批量编号，减少轮数。
- 实时显示累计 token（来自消息 `usage`）；单次会话默认最多 60 次模型调用（按 `turn_start` 事件计数），
  到上限由 `shouldStopAfterTurn` 停下，询问是否继续。
- 隐私沿用现有规则：隐私等级、内网不发送、敏感参数去除。

## 9. 错误处理

| 情况 | 处理 |
|---|---|
| 模型不支持工具调用 | 明确提示，建议换 `deepseek-chat`、`qwen-plus` 等支持工具调用的模型 |
| 网络 / Key 无效 / 限流 | 对话中显示错误消息与「重试」（`agent.continue()` 从断点继续） |
| 工具参数或方案校验失败 | 工具抛错，由 Agent 以 `isError` 回传给模型自行纠正 |
| 执行时书签已变动 | 跳过并计数 |
| 分类目录已存在 | 复用现有目录，不重复新建 |

## 10. 测试

- **单元测试（vitest）**
  - `plan.ts`：体系约束、范围校验、未知编号、体系变更后的回退、转成批次（复用已有目录、`ref`）、冲突跳过。
  - `tools.ts`：内存版书签接口 + 方案，逐个工具测输出格式、分页、隐私、`ask_user` 的 `terminate`、错误参数。
  - `context.ts`：裁剪只影响已处理的书签列表。
  - 会话流程：按剧本返回的假 `streamFn`，走完「问范围 → 回答 → set_scope → 体系 → 分配 → 完成」并核对方案；
    另测「`ask_user` 与其他工具同一轮调用时仍会停下」。
- **端到端（Playwright + Chromium）**：本地假 OpenAI 兼容服务按剧本返回工具调用；
  开始整理 → 点提问卡片选项 → 右栏出现体系 → 预览确认 → 校验 Chrome 书签已移动 → 撤销后恢复。
- **真实模型**：用户用自己的 DeepSeek / 通义 Key 手动验证。

## 11. 不在本次范围

- 会话持久化到 IndexedDB、多会话管理
- 智能体读取网页正文
- 除 OpenAI 兼容接口外的服务商
- 基于体系的「虚拟分类」展示（书签导航仍按真实文件夹）
