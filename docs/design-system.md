# Bookmark Hub 设计规范

> 适用：扩展 Dashboard（React 19 + shadcn/ui new-york + Tailwind v4 + lucide-react + AI Elements）。
> 方向：**灯塔品牌暖色**（2026-09-14 定）。配色取自 logo，吉祥物是 logo 里的灯塔。
> 依据：hallmark（`.agents/skills/hallmark`，中性色朝主色色相着色、不用纯黑纯白）+ ui-ux-pro-max 检索（采纳无障碍与层级规则，未采纳其落地页布局、Google 字体、青橙配色）+ dataviz 规范（大数字 / 进度条 / 单色色阶）。

## 1. 原则

- **有温度的工具**：像 Things 3、Arc，不像后台模板。冷静克制但有品牌感，不用营销页式渐变和大面积装饰。
- **不要千篇一律的白卡片**：区块标题放在卡片外面；每页最多一个品牌色主视觉；同一区块里的条目可以有各自的颜色芯片。
- **文案说人话**：标题描述状况（「发现 36 条重复书签」），不写「我的书签」「需要你处理」这类模板标题；按钮用动词短语（「去清理」「开始检查」）。
- **可撤销是卖点**：批量操作都说明「执行前创建恢复点，可在操作记录撤销」，toast 带「撤销」。
- **中文界面**：不用全大写、拉开字间距这类只对拉丁字母有效的样式。

## 2. 颜色

组件里只用语义变量（`bg-primary`、`bg-accent`、`bg-coral`…），不写具体色值。暗色跟随系统，`:root` 与暗色块两套变量都要完整定义。

| 变量 | 亮色 | 暗色 | 用途 / 对比度 |
|---|---|---|---|
| `--background` | 薄荷调近白 `#f1f9f7` | 深青 `#0a1618` | 页面底：朝主色色相轻微着色，**不用暖黄底**、不用纯白 |
| `--card` | 近白 `#fbfefd` | `#112123` | 卡片、列表面板 |
| `--foreground` | 冷墨 `#121d1d` | `#f5f1ea` | 正文：亮 16.1 / 暗 16.4 |
| `--muted-foreground` | `#5a6667` | `#b2aa9d` | 次要文字：亮 5.6（在 muted / accent 上 ≥ 5.1）/ 暗 7.2 |
| `--primary` / `-foreground` | 深薄荷 `#007b6b` / 白 | 薄荷 `#65d5bb` / 深青 | 主按钮：亮 5.0 / 暗 10.1；主色文字在卡片上 亮 5.1 / 暗 9.3（放在页面底上 4.8，尽量放卡片里） |
| `--accent` / `-foreground` | 薄荷浅底 / 深薄荷字 | 深薄荷底 / 浅薄荷字 | 选中、悬停、主视觉区块：亮 7.4 / 暗 8.6 |
| `--coral` / `-foreground` | 珊瑚浅底 / 深珊瑚字 | 深珊瑚底 / 浅珊瑚字 | 失效等提醒：亮 5.6 / 暗 8.5 |
| `--destructive` | 红 | 红 | 删除；危险操作二次确认：亮 4.7 / 暗 5.7 |
| 琥珀芯片 `bg-amber-100 text-amber-800`（暗 `amber-950 / amber-200`） | | | 重复等警示：亮 6.4 / 暗 12.0 |
| `--brand-mint` `--brand-mint-deep` `--brand-coral` `--brand-cream` `--brand-ink` | logo 原色 | 同 | **只给插图用，不用于文字** |

规则：
- 文字对比度 ≥ 4.5:1，图标等图形 ≥ 3:1。**改任何颜色前先算对比度**（oklch → sRGB → WCAG 相对亮度）。
- 状态不能只靠颜色：失效 / 重复 / 待确认同时配图标和文字。
- 珊瑚是提醒，不是危险；真正的删除用 `destructive`。
- 数据色阶（Treemap）：`color-mix(in srgb, var(--primary) 6%–32%, var(--card))`，浅色阶、文字一律 `text-foreground`。上限不得超过 45%：暗色下薄荷偏亮，55% 时浅字对比度仅 3.9。
- 品牌色不做大面积铺底：每屏只有主视觉一个 `bg-accent` 色块，图表用浅色阶。

## 3. 插图

- 吉祥物组件 `src/components/brand/Lighthouse.tsx`，`beam` 属性加两侧光束（跟随所在区块文字色半透明）。
- 用在：总览主视觉、智能整理的范围选择横幅、未配置 AI 引导、「一切正常」空状态。**每屏最多一处**，不当图标用。
- 纯装饰，`aria-hidden`；不承载信息。

## 4. 字体与字号

- 字体：系统字体栈 `-apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`。不引入 Web 字体（拉丁字体没有中文字形，扩展里远程加载要联网）。
- 字号：主视觉标题 `text-3xl font-semibold`；页面标题 `text-2xl font-semibold tracking-tight`；区块标题 `text-base font-semibold`；正文 `text-sm`（对话 `text-base`）；辅助 `text-xs`。**不小于 12px**。
- 大号单个数字（健康度、主视觉数字）用默认比例数字；列里对齐的数字用 `tabular-nums`。

## 5. 布局与间距

- 框架：顶栏 60px ｜ 左侧导航 224px（与页面同底色，选中项 `bg-accent text-accent-foreground`）｜ 主内容独立滚动。
- 内容宽度：总览 `max-w-6xl`；清单类 `max-w-4xl`；设置 / 扫描 / 操作记录 `max-w-3xl`；三栏与对话页铺满。
- 间距：页面 `p-8`；大区块之间 `space-y-10`；区块标题与内容 `mb-3`；栅格 `gap-8`（区块）/ `gap-2`（小芯片）。
- 圆角：`--radius: 0.75rem`；卡片、列表面板 `rounded-xl`；主视觉 `rounded-2xl`；图标芯片 `rounded-lg`。

## 6. 组件

- **容器只套一层**：卡片里不再放卡片或色块；卡片只用描边，不加阴影（`ui/card.tsx` 已去掉 `shadow-sm`）。侧栏类信息用 `border-l` 分隔，不用卡片。
- **主视觉（每页最多一个）**：`bg-accent` 色块 + 一句状况标题（`text-balance`）+ 主操作 + 关键指标（直接排在色块上，用 `border-l` 隔开，不套卡片）+ 灯塔插图。不加日期之类的眉标。
- **次要功能**：一行入口（图标 + 标题 + 一句说明 + 小按钮，`border-t` 分隔），不单独占一张卡片。例：AI 标签。
- **长内容页**（书签导航这类）：页面固定高度，搜索、标签等入口固定，分类栏与内容区各自 `overflow-auto`；切换分类时内容区滚回顶部。
- **排行 / 列表**：无边框两列紧凑列表 + `border-b` 行分隔，数量右对齐，不做等大卡片网格。
- **批量操作列表**（失效 / 重定向 / 待确认）：一个 `rounded-xl border bg-card` 面板，操作栏 `sticky top-0` 贴顶（面板不能加 `overflow-hidden`，否则贴顶失效）；每行网站图标 + 标题 + 网址 + 按含义着色的原因芯片。
- **分组列表**（重复书签）：多组放进同一个面板用 `divide-y` 分隔，组头放芯片 + 条数 + 本组操作，不每组一张卡片；没有可执行项时隐藏按钮，不显示「0 组」。
- **时间线**（操作记录）：`border-l` 竖线 + 圆点，已撤销的圆点和标题变灰。
- **设置页**：段落用 `border-t` 分隔，表单两列（相关字段并排），输入框 `bg-card`，不套卡片。
- **状态分布**（健康扫描）：一条分段条做概览（段间 2px 间隔）+ 带图标芯片的清单给出每项数字，分段条本身 `aria-hidden`。
- **Treemap**：9:2 比例（宽屏约 240px 高）；格子够大才显示名称，更大才显示「数量 · 占比」，完整信息放 `title` / `aria-label`。
- **清单**：一个 `rounded-xl border bg-card` 面板内 `divide-y`，整行可点；左侧 `size-10 rounded-lg` 颜色芯片（按含义选 coral / amber / accent / muted），右侧主色动词按钮文字。
- **按钮**：每个区域最多一个 `default`；次要 `outline`；行内 `ghost`；危险 `destructive` 并弹 AlertDialog 确认。图标按钮必须有 `aria-label`。
- **进度 / 分数**：大数字 + `role="meter"` 进度条，轨道用同色浅一档；分档用图标 + 文字（良好 / 一般 / 较差）。
- **网站图标**：`Favicon` 组件（浏览器本地缓存，取不到显示首字母）。
- **空状态**：图标圆底或灯塔 + 一句加粗结论 + 一句说明（可带下一步按钮）。
- **弹窗**：`DialogContent` / `AlertDialogContent` 已是 `grid-cols-1` + 最大高度内部滚动，长内容 `truncate`。
- **长列表**：固定行高 + 虚拟滚动（`@tanstack/react-virtual`）；选中行 `bg-accent` + 左侧 2px 主色竖线。
- **智能整理对话**：AI Elements —— `Conversation` 贴底、`Reasoning` 折叠思考、`ChainOfThought` 步骤链。

## 7. 交互与动效

- 悬停 / 选中过渡 150–250ms；只动 `opacity`、`transform`、颜色，不动宽高。不用 `transition-all`（按钮已改为只过渡颜色与透明度，焦点框即时出现）。
- 所有动画包 `motion-safe:`，尊重 `prefers-reduced-motion`。
- 可点击元素手型光标（`tailwind.css` 全局设置）；保留 `focus-visible:ring-2 ring-ring`。

## 8. 交付前检查

- [ ] 亮色、暗色各截图看一遍
- [ ] 新增颜色组合算过对比度（文字 ≥ 4.5，图形 ≥ 3）
- [ ] 没有退回「一排同款白卡片 + 灰图标方块 + 模板标题」
- [ ] 灯塔插图每屏最多一处
- [ ] 图标按钮有 `aria-label`，状态不只靠颜色
- [ ] 1280px 与 1920px 下不溢出；长标题在列表、弹窗里截断
