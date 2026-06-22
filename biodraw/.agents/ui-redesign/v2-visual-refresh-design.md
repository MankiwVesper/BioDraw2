# BioDraw 编辑器 v2 视觉刷新 · 设计方案

> 状态:已审议待落地 · 创建 2026-06-22 · 分支 `ui-redesign`
> 关联记忆:UI 重构范围与隔离决策 / UI 重新设计计划

本文件是 v2 视觉刷新的唯一事实来源(single source of truth),供后续实现追溯。
实现前若与代码现状冲突,以代码为准并回头更新本文件。

---

## 1. 目标与边界

**目标**:把编辑器五面板从"功能性初版"升级为更专业、克制、统一的视觉,提升中学生物老师的使用体验。

**已确认的范围决策**:
- **深度**:纯视觉刷新 —— 保留现有布局与交互,不碰画布拖拽、时间轴拖拽/边缘缩放、播放状态机等高风险逻辑。只升级 token(色彩/字体/间距/圆角/阴影)与控件样式。
- **覆盖面**:仅编辑器五面板(工具栏 / 素材库 / 画布 / 属性 / 时间轴)。登录、项目列表、各弹窗页留作后续期。
- **视觉基调**:方向 A「精炼中性」—— 冷灰白中性阶 + 蓝色主色 `#3B82F6`、保 6px 圆角、专业克制,从现状演化最近、风险最低。
- **字体策略**:拉丁/数字用**自托管 Inter**(woff2,**不依赖 Google CDN**——大陆会被墙);中文走系统字体(微软雅黑 / 苹方),中文不全量内嵌以控体积。`font-display: swap`。
- **隔离方式**:`ui-redesign` 分支 + 可切换的 `v2` 并行主题。`?ui=v2` 开启,默认仍是旧 UI。全部满意后才翻默认并合并到 main。

**非目标(YAGNI)**:不做暗色模式、不做移动端响应式(工具软件固定尺寸 + 内部滚动是对的)、不引入 spring/bounce 动效、不重排任何面板布局。

---

## 2. 范围护栏 · 三类色彩(最重要)

刷新前必须区分三类色彩,精确划定"动什么、绝不动什么":

| 类别 | 内容 | 处理 |
|---|---|---|
| **① UI chrome** | 面板 / 按钮 / 输入 / 菜单 / 边框 / hover / 阴影 | **刷新目标 ✅** |
| **② 画布编辑 chrome** | 选中框、对齐辅助线、吸附线、路径编辑手柄(Konva 绘制) | **可选对齐 ⚠️**(语义色已自洽,不动也不影响) |
| **③ 内容 / 图形色** | 图形默认填充/描边、画布底色板、20 色元素身份板、`object.style` 取值 | **锁死不碰 🚫**(等同素材,改了就改了用户内容) |

**③ 的具体清单(护栏)**:
- `MaterialsPanel.tsx` L8–15:新建图形默认色(矩形 `#3b82f6/#1d4ed8`、圆 `#ef4444/#b91c1c`、三角 `#10b981/#047857`、梯形 `#f59e0b/#b45309`、箭头/线 `#334155`、曲线 `#4f46e5`、文本 `#1e293b`)
- `ToolbarPanel.tsx`:画布底色板 `['#ffffff','#f8fafc','#e2e8f0','#f0fdf4','#1e3a5f','#0f172a']` + 默认 `#ffffff`
- `TimelinePanel.tsx` L58–61:20 色元素身份色板 `#FF6B6B … #FFDD59`
- `SceneObjectRenderer.tsx`:所有 `sceneObject.style?.fill || '#xxx'` 兜底默认色、所有 `object.style` 取值

**② 的具体清单(可选,实现到 P6 再定)**:
- `AnimationPathOverlay.tsx`:起点绿 `#10b981` / 终点蓝 `#3b82f6` / 中点靛 `#6366f1` / 控制点琥珀 `#f59e0b`·`#fb923c`、辅助线 slate `rgba(100,116,139,.7)`
- `SceneObjectRenderer.tsx`:选中框 `#22c55e`+`rgba(34,197,94,.08)`、线/曲线编辑点 `#fff`+`#2563eb`、高亮 `#f59e0b`
- `CanvasPanel.tsx`:选中/对齐线 `#3b82f6`、`rgba(59,130,246,.07)`、对齐提示 tooltip `rgba(59,130,246,.80)`、阴影 `rgba(0,0,0,.18)`

---

## 3. UI 样式盘点(① chrome 的分布)

样式散落在**三处**,这是"改 token 会漏网"的根因:

| 位置 | 内容 | 改 token 是否自动生效 |
|---|---|---|
| `index.css` 全局 | 仅 8 个变量(蓝/灰/边框/圆角) | — 源头 |
| 各面板 CSS | 大量 `var(--…)` + **大量硬编码字面量** | `var()` 传导;字面量**不传导** |
| TSX 内联 `style={{}}` | 369 处,集中在 **Inspector 191 + Timeline 122** | 完全不传导,逐处改 |

**按文件工作量**:

| 文件 | chrome 形态 | 量 |
|---|---|---|
| `index.css` | 8 token(待扩建) | 地基重写 |
| `ToolbarPanel.css`(788 行) | 全 `var()` + 蓝 tint / 琥珀 / 危险字面量 | 中 |
| `MaterialsPanel.css` | 几乎纯 `var()` | 低 |
| `CanvasPanel.css` | `var()` + 导出条蓝硬编码 `#dce8ff/#b0ccf8/#3a5080/#a0bce8` | 低 |
| `InspectorPanel.css`(262 行) | `var()` + `backdrop-filter: blur(8px)` / 阴影 / tint | 中 |
| `TimelinePanel.css`(**2515 行**) | 海量字面量:轨道灰 `#eceef1`、类型色、绿窗、危险红、阴影 | **高** |
| `InspectorPanel.tsx` | **191 内联 + JS 命令式 hover**(`el.style.background=`) | **高** |
| `TimelinePanel.tsx` | **122 内联**(弹窗 / 菜单 / 删除红 `#ef4444`) | **高** |
| `LayerPanel.tsx` / `KeyframeEditor.tsx` | 少量内联 / CSS | 低 |
| `App.css` | **Vite 脚手架死代码**(引用不存在的 `--accent/--border/--social-bg`) | 只标记,经确认后删 |

**散落的实际色板(token 化靶子)**:
- 中性:`#eceef1`(轨道底)、`#9ca3af`、`rgba(0,0,0,.15/.22/.85)`
- 主色蓝 tint:`rgba(59,130,246, .02/.04/.05/.06/.07/.08/.10/.14/.15/.18/.35)`——同一蓝,十几种透明度散写
- 8 类型色(dot + `.65` 填充两套):move `#3b82f6` / polyline `#6366f1` / path `#06b6d4` / fade `#8b5cf6` / scale `#10b981` / rotate `#f59e0b` / shake `#ef4444` / state `#8b5cf6`
- 时间窗绿:`rgba(34,197,94,.22/.55)` + `#22c55e`(含蚂蚁线 `--seg-color`)
- 播放态琥珀:`#f59e0b` / `#d97706`
- 危险红族:`#ef4444 #b91c1c #be123c #fca5a5 #fee2e2 #fff1f2 #fef2f2 #fecaca`
- 生物绿:`rgba(16,185,129,…)` / `#059669`
- 阴影梯:`rgba(15,23,42, .06/.10/.12/.15)` + `rgba(0,0,0,.1/.12/.2/.22/.25)`

---

## 4. Token 架构(两层)

全部挂在 `[data-ui="v2"]` 作用域下,旧默认零改动。

### Tier 1 · Palette(原始值,组件不直接用)
- 中性灰阶 `--gray-0 … --gray-900`(冷灰白)
- 蓝阶 `--blue-50 … --blue-900`(`--blue-500 #3b82f6`、`--blue-600 #2563eb`)
- 语义原色:`--green-500 #22c55e`、`--amber-500 #f59e0b`、`--red-500 #ef4444`、`--bio-500 #10b981` 及各自深浅
- 8 类型色:`--type-move/polylineMove/moveAlongPath/fade/scale/rotate/shake/stateChange`(固化现有值,不变 hue)

### Tier 2 · Semantic(组件只用这层)
- 背景:`--bg-app` `--bg-panel` `--bg-subtle`
- 文字:`--fg-default` `--fg-muted` `--fg-subtle`
- 边框:`--border-default` `--border-strong`
- 主色:`--primary` `--primary-hover` `--primary-fg`(白)
- **主色 tint 阶**:`--primary-tint-weak`(≈.04)`--primary-tint`(≈.08)`--primary-tint-strong`(≈.14)—— 收编散写的 `rgba(59,130,246,X)`
- 焦点环:`--focus-ring`(`0 0 0 2px rgba(primary,.18)`)
- 语义:`--success/--warning/--danger` + 各自 `-bg`/`-border`
- 时间窗:`--seg-window-bg` `--seg-window-border`
- 阴影梯:`--shadow-sm/md/lg`
- 圆角:`--radius-sm`(4)`--radius-md`(6)`--radius-pill`(999)
- 字号梯:`--fs-xs`(11)`--fs-sm`(12)`--fs-base`(13)`--fs-md`(14)`--fs-lg`(16)
- 字体:`--font-sans`(`'Inter', 系统中文栈`)`--font-mono`
- 动效:`--dur-fast`(.12s)`--dur-base`(.2s)`--ease-standard`(`cubic-bezier(.4,0,.2,1)`)

> 兼容旧名:`[data-ui="v2"]` 下同时覆盖现有 `--primary-color/--border-color/--bg-color/--panel-bg/--text-main/--text-muted/--radius` 为 v2 值,使已用 `var()` 的样式自动翻新。

---

## 5. 隔离机制(关键 · 保证默认 UI 像素不变)

**不复制两套样式表**。一套 CSS 渐进 token 化,靠属性切换出两种皮肤:

1. **已用 `var()` 的属性**(border/bg/primary…):仅在 `[data-ui="v2"]` 下覆盖根变量值 → 全部自动翻新,**零文件改动**。
2. **硬编码字面量**:逐处改成 `var(--新token, 原字面量)`。
   - 默认态:新 token 未定义 → **回退到原字面量 → 与今天逐像素一致**(no-op);
   - v2 态:token 解析 → 新值生效。
   - **每一处字面量替换对默认 UI 都是 no-op** → 可零风险增量改造。
3. **Inspector 的 JS 命令式 hover**(`el.style.background = "rgba(...)"`):浏览器会解析内联里的 `var()`,同样写成 `var(--ip-hover, rgba(59,130,246,0.05))` 即可,无需改成 class。

> 核心保证:**默认 UI 始终走"回退值"= 现状;v2 仅在开关打开时由 token 接管。**

**开关读取**:在编辑器根容器读 `?ui=v2`(URL 查询参数),命中则设 `data-ui="v2"`,否则不设。开关逻辑独立、最小侵入,默认路径无任何变化。

---

## 6. 落地分期(每期独立验证、可回滚)

| 期 | 内容 | 验证 |
|---|---|---|
| **P0 地基** | 建 v2 token 层(Tier1+Tier2)+ 自托管 Inter + `?ui=v2` 开关写 `data-ui` | 开关切换生效;**默认 UI 截图与现状逐像素一致** |
| **P1 工具栏** | `ToolbarPanel.css` 字面量 → `var(--token, 回退)` | 同屏对照新旧 |
| **P2 素材库** | `MaterialsPanel.css`(量少) | 同上 |
| **P3 画布 chrome** | `CanvasPanel.css` 导出条等 | 同上 |
| **P4 属性面板** | `InspectorPanel.css` + `InspectorPanel.tsx` 191 内联 + JS hover | 同上(内联大户,重点回归) |
| **P5 时间轴** | `TimelinePanel.css`(2515 行)+ `TimelinePanel.tsx` 122 内联 | 同上(最重,分块推进) |
| **P6 收尾** | ② 画布编辑 chrome 是否对齐新 token(可选);移除 `App.css` 死代码(经确认) | 全面回归 + `npm.cmd run check` |

每期完成后用 Playwright 截图,**同时对照"默认态(应无变化)"与"v2 态(应呈现新设计)"**。

**实现顺序遵循**(每期内):token → CSS / 内联替换 → Playwright 验证 → 提交。

---

## 7. 风险与注意

- **高风险区**(CLAUDE.md):时间轴拖拽、画布多选、播放状态机、导出 —— 本方案**不改其逻辑**,只改其视觉字面量,但 P5 仍需重点回归这些交互。
- **字体加载**:Inter woff2 自托管,放 `src/assets/fonts/` 或 `public/fonts/`;`@font-face` 全局声明,仅 v2 引用,默认态不下载。
- **`color-mix()` 现状**:部分文件已用 `color-mix(in srgb, var(--primary-color) X%, transparent)`,与 tint 阶语义一致,P 期可统一收口到 `--primary-tint-*`。
- **测试闸门**:UI 改动不进 Vitest(纯逻辑层),但每期提交前跑 `npm.cmd run check`(lint+test+build)确保不破坏构建。

---

## 8. 待办引用

- 探索阶段方向稿:`.superpowers/brainstorm/directions-v1.html`(已 gitignore)
- 旧 Claude Design 项目「BioDraw Design System」:**已弃用**,不作参考(与现状差距过大)
