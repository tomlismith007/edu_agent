# edu_agent 前端 UI 开发规范（shadcn/ui）

> 适用范围：`web/` 前端。本规范在「仅视觉/组件标准化、不改业务逻辑」的前提下统一设计语言、组件用法与可访问性要求。
> 技术基线：React 19 + Vite 6 + TypeScript（strict）+ **Tailwind CSS v4** + **shadcn/ui（default / neutral）**。

---

## 1. 设计令牌（Design Tokens）

所有视觉常量集中在 `src/index.css` 的 `:root` 与 `@theme inline`，**禁止在组件里写死颜色/间距/圆角**。颜色采用 shadcn 默认 neutral 基调（HSL/oklch），并补充 `--success`。

### 1.1 颜色（节选）
| 令牌 | 用途 | 默认(light) |
|---|---|---|
| `--background` / `--foreground` | 页面底色 / 主文字 | 白 / 近黑 |
| `--card` / `--card-foreground` | 卡片（原 `.panel`） | 白 / 近黑 |
| `--primary` / `--primary-foreground` | 主操作、品牌强调（按钮/Tab/链接/用户气泡） | 靛蓝 `oklch(0.55 0.17 256)` / 白 |
| `--brand` | 品牌原色分量（用于半透明合成 `oklch(var(--brand)/a)`） | `0.55 0.17 256` |
| `--secondary` / `--secondary-foreground` | 次级表面 | 浅灰 / 近黑 |
| `--muted` / `--muted-foreground` | 次要背景 / 次要文字 | 浅灰 / 中灰 |
| `--accent` / `--accent-foreground` | 悬停/高亮 | 浅灰 / 近黑 |
| `--destructive` / `--destructive-foreground` | 错误/危险（原 `.error`） | 红 / 白 |
| `--border` / `--input` / `--ring` | 边框 / 输入边框 / 焦点环 | 浅灰 / 浅灰 / 中灰 |
| `--success` / `--success-foreground` | 成功态（缓存命中、毕业完成） | 绿 / 白 |

> 使用方式：Tailwind 工具类自动映射，例如 `bg-card` `text-muted-foreground` `border-border` `bg-primary` `text-success` `ring-ring`。不要直接写 `var(--xxx)`（动画/特殊场景除外，如 `chat.css`）。

### 1.2 间距 / 圆角 / 字体
- **间距**：统一用 Tailwind 步进（`p-3`=12px、`gap-3`=12px、`p-4`=16px…），禁止散落 `px/py` 字面量（除 1px 边框）。垂直堆叠一律 `flex flex-col gap-*`，禁用 `space-y-*`。容器内边距采用 shadcn 默认：`px-4 sm:px-6 lg:px-8`。
- **圆角**：`--radius` 采用 shadcn 默认 `0.625rem`；卡片 `rounded-xl`、对话卡/气泡 `rounded-xl`（消息角靠头像侧用 `rounded-br-sm`/`rounded-bl-sm`）、按钮/输入 `rounded-md`、头像/徽章/进度条 `rounded-full`。不要混用 6/8/10px 字面量。
- **字体**：`Geist Variable`（拉丁/数字，已 `@fontsource-variable` 本地打包）+ 中文系统回退（PingFang SC / Microsoft YaHei），在 `@theme inline` 覆盖 `--font-sans`/`--font-mono`。字号基准 14px；标题用 `font-semibold`/`font-bold` + `tracking-tight`。
- **数字对齐**：所有数据列/统计数字用 `tnum`（tabular-nums），避免跳动。
- **图标**：统一 `lucide-react`（`components.json` iconLibrary 已声明）。图标在 `Button` 内不加尺寸类（组件 `[&_svg]:size-4` 统一处理）；装饰性图标一律 `aria-hidden`。

### 1.3 视觉表层工具（统一在 `index.css` 的 `@layer components/utilities`）
| 工具类 | 用途 |
|---|---|
| `.app-bg` | 全站环境光纹理背景（双角径向渐变 + 极淡点阵），替代纯平底色 |
| `.glass` | 玻璃拟态顶栏（`backdrop-blur` + 半透明 + 内描边模拟边缘折射） |
| `.brand-mark` | 品牌字标渐变文字（靛蓝→紫罗兰） |
| `.card-lift` | 卡片悬停抬升（translateY + 着色阴影，GPU 合成） |
| `.tnum` | 等宽数字 |
| `.text-balance` | 标题视觉平衡，避免孤字 |
| `.sr-only` / `focus:not-sr-only` | 「跳到主内容」无障碍跳转链接 |

---

## 2. 组件使用标准

组件源码位于 `src/components/ui/`（复制式，基于 Radix），业务组件放 `src/components/` 与 `src/pages/`。

| shadcn 组件 | 用途 | 约定 |
|---|---|---|
| `Button` | 所有按钮（原 `.btn`/`.btn.primary`） | `variant=default/outline/secondary/ghost`、`size=sm`；禁用用 `disabled` |
| `Card`(+Header/Title/Content) | 面板、统计卡（原 `.panel`/`.stat`） | 面板：`CardHeader`+`CardTitle`+`CardContent`；统计卡 `items-center` |
| `Tabs`(+List/Trigger/Content) | 顶部 6 视图切换 | 受控 `value`/`onValueChange`；非激活内容自动卸载（等同原行为） |
| `Table`(+Header/Body/Row/Head/Cell) | 所有数据表（经 `components/Table.tsx` 封装） | 业务统一走 `Table` 封装，不裸写 `<table>` |
| `Badge` | 状态徽章（缓存/实时） | `variant=secondary`(缓存) / `success`(实时) |
| `Input` | 学期/查询条件输入 | **必须**配 `<label htmlFor>` 或 `aria-label` |
| `Textarea` | 对话输入框 | `resize-none`；Enter 发送 |
| `Progress` | 进度条（毕业/学分） | `value` 为 0–100 |
| `Avatar`(+Fallback) | 消息头像（原 `.msg-role`） | `size-8`；用户/助手用不同 `bg` |
| `ScrollArea` | 滚动容器（聊天体等） | 替代裸 `overflow-y-auto` 以获得更顺滑滚动条 |
| `Skeleton` | 加载占位 | 已接入：6 个 Dashboard 视图初始加载时显示骨架屏（`ViewSkeleton`） |
| `Alert`(+Description) | 错误/提示（原 `.error`/`.chat-hint`） | `variant=destructive` 报错；默认虚线用于提示，可带 `Sparkles` 图标 |
| `Separator` | 分隔线 | 按需 |

**对话态**：流式「正在思考」用三点弹跳 `TypingDots`（`.typing-dot` 动画，`chat.css`）+ `aria-live="polite"`；用户气泡 `bg-gradient-to-br from-primary to-primary/85`，助手气泡 `bg-card shadow-sm`。

**禁止**：
- 新增手写 CSS 类（`.panel/.btn/.tab/.data-table` 等已废弃）；一律改用 shadcn 组件 + Tailwind 工具类。
- 在组件内写死颜色（如 `text-[#2563eb]`）、固定像素间距（如 `mt-[10px]`）。
- 自研按钮/输入框/卡片样式；复用 `components/ui` 中的原语。

---

## 3. 可访问性（A11y）要求

- **焦点可见**：所有可交互元素必须有 `focus-visible:ring`（shadcn 默认已含），不得 `outline:none` 后无替代。
- **表单标签**：`Input`/`Textarea` 必须配 `<label htmlFor>` 或 `aria-label`（已实现 `Field` 封装）。
- **语义**：按钮用 `<button>` + 明确 `disabled`；Tab 用 Radix `Tabs`（自带 `aria-selected`/`role`）。
- **动态内容**：流式「正在思考」包 `aria-live="polite"`。
- **对比度**：文字/背景满足 WCAG AA（shadcn 默认令牌满足）。
- **键盘**：Tab 顺序合理，Radix 组件自带焦点陷阱。

---

## 4. 响应式规范

- 顶栏：`flex justify-between`，始终单行。
- 主区：`flex flex-col gap-3 p-3` 默认上下堆叠；`lg:` 断点（≥1024px）切换为 `flex-row`，左栏 `flex-1`、右栏 `w-[400px] shrink-0`。
- 窄屏（<lg）：两栏堆叠，主区 `overflow-y-auto` 整体滚动；聊天容器 `min-h-[480px]`。
- 统计卡：`grid-cols-2 sm:grid-cols-3 lg:grid-cols-4` 自适应。
- 禁止出现水平溢出（表格用 `overflow-x-auto` 容器）。

---

## 5. 目录与文件约定

```
web/src/
├── index.css            # 设计令牌 + shadcn base（唯一样式入口之一）
├── chat.css             # 仅聊天气泡 markdown 排版 + 光标动画（shadcn 未覆盖）
├── lib/utils.ts         # cn(clsx + tailwind-merge)
├── components/ui/       # shadcn 原语（button/card/tabs/table/...）
├── components/Table.tsx # 业务封装：Table / Panel / CacheBar
├── pages/Dashboard.tsx  # 左栏 6 视图
└── pages/Chat.tsx       # 右栏对话
```
- 路径别名：`@/*` → `src/*`（tsconfig + vite 已配置）。
- 逻辑文件（`api/client.ts`、`lib/grade.ts`）**不在 UI 规范范围内**，保持不动。

---

## 6. 重构任务清单与优先级

| 优先级 | 任务 | 状态 | 涉及文件 |
|---|---|---|---|
| **P0** | Tailwind v4 + @tailwindcss/vite + cn 依赖 | ✅ 完成 | `package.json`, `vite.config.ts` |
| **P0** | `index.css` 设计令牌 + shadcn base；`lib/utils.ts`；`components.json` | ✅ 完成 | `src/index.css`, `src/lib/utils.ts`, `components.json` |
| **P0** | 沉淀 13 个 shadcn 基础组件 | ✅ 完成 | `src/components/ui/*` |
| **P1** | App 响应式布局（顶栏 + 双栏/堆叠） | ✅ 完成 | `src/App.tsx` |
| **P1** | Dashboard 迁移（Card/Tabs/Input/Progress/Alert/Stat） | ✅ 完成 | `src/pages/Dashboard.tsx`, `src/components/Table.tsx` |
| **P1** | Chat 迁移（Card/Avatar/Textarea/Button/ScrollArea/Alert） | ✅ 完成 | `src/pages/Chat.tsx` |
| **P2** | 清理 `styles.css`（已删除） | ✅ 完成 | 已移除 |
| **P2** | a11y / 响应式复查 | 🟡 待人工验收 | 全量 |
| **P2** | 骨架屏（Skeleton）接入加载态 | ✅ 完成 | `Dashboard`（ViewSkeleton） |
| **P2** | 暗色模式开关（令牌已含 `.dark`） | ⚪ 可选增强 | `App` + toggle |

### 7.x 视觉美化增强（redesign 技能，第二轮）
| 优先级 | 任务 | 状态 | 涉及文件 |
|---|---|---|---|
| — | 设计令牌升级：品牌靛蓝主色 `--primary`/`--brand`、Geist 字体、`--radius` 0.75rem | ✅ 完成 | `src/index.css` |
| — | `index.html`：内联 SVG favicon、meta/og/theme-color、title | ✅ 完成 | `index.html` |
| — | 布局层：`.app-bg` 纹理背景、`max-w-[1440px]` 居中、`sticky` 玻璃顶栏 + SVG 品牌标识、skip-to-content、用户状态药丸 | ✅ 完成 | `src/App.tsx` |
| — | 表格/面板：行 hover 高亮、表头 sticky、数字 `tnum`、品牌强调点 Panel、虚线空态 | ✅ 完成 | `src/components/Table.tsx` |
| — | Dashboard：统计卡渐变数字 + hover 抬升 + 顶部强调条；6 视图骨架屏加载态 | ✅ 完成 | `src/pages/Dashboard.tsx` |
| — | Chat：用户/助手气泡分化、活动卡按状态着色左边框、三点打字动画、头部光晕 | ✅ 完成 | `src/pages/Chat.tsx`, `src/chat.css` |
| — | 构建验证（`npm run build` 通过，Geist 字体打包） | ✅ 完成 | `dist/` |

### 7.y 第三轮视觉统一（shadcn 默认规范对齐）
| 优先级 | 任务 | 状态 | 涉及文件 |
|---|---|---|---|
| — | `--radius` 对齐 shadcn 默认 `0.625rem`；`@theme inline` 派生 token 不变 | ✅ 完成 | `src/index.css` |
| — | 容器间距对齐 shadcn 默认（`px-4 sm:px-6 lg:px-8`、主区 `gap-4 lg:gap-6`） | ✅ 完成 | `src/App.tsx` |
| — | 用户状态药丸改用 `Avatar` 组件；`lucide-react` 图标接入（Tab/按钮/空态/活动卡） | ✅ 完成 | `src/App.tsx`, `src/pages/*`, `src/components/Table.tsx` |
| — | 对话卡/气泡圆角对齐（`rounded-xl` + 消息角），markdown 排版圆角用令牌 | ✅ 完成 | `src/pages/Chat.tsx`, `src/chat.css` |
| — | Panel 头部去装饰点，标准化 `CardHeader`+`CardTitle`；筛选区改栅格 `grid-cols-*`；`space-y-*` 全部清理 | ✅ 完成 | `src/components/Table.tsx`, `src/pages/Dashboard.tsx` |
| — | 构建验证（`npm run build` 通过） | ✅ 完成 | `dist/` |

### 验证
- `npm run build` 通过（`tsc --noEmit` 无类型错误，`vite build` 成功产出 `dist/`）。
- 视觉：全站统一 shadcn 默认令牌、圆角、间距；无散落硬编码样式。
- 响应式：≥lg 双栏，<lg 单栏堆叠，无溢出。

---

## 7. 已知范围外（按用户决策未实现）
- 路由拆分（保持 Tab 切换，不引 react-router）。
- 对话「停止/清空」、localStorage 持久化、Tab 数据缓存、学期下拉 Select（仅视觉升级为 `Input`）。
- 业务逻辑/统计口径/接口路径一律不变。
