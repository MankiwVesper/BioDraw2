# BioDraw 架构与设计速览（AI 接手指南）

> 目的：让新接手的 AI 读完这一份就建立完整心智模型，无需通读代码。
> 配套：`CLAUDE.md`（工作约束/规范，会被自动加载）、`AGENTS.md`（Windows/PowerShell/编码/浏览器验证硬约束）、`app/.agents/skills/`（早期中文设计文档）、`app/.agents/static-review/`（两轮静态审查的计划与 A1 重构记录）。
> 本文为概览，**具体不变量以代码为准**；引用到的文件/函数名如与现状不符，以代码为准并请更新本文。

---

## 1. 这是什么

**BioDraw**：面向高中生物老师的浏览器端动画示意图编辑器。老师用它把生物结构（细胞、膜、蛋白、离子等 SVG 素材）摆到画布上，加动画（移动、淡入淡出、状态切换等），预览并导出为序列帧或视频。

**用户主流程**：素材(Materials) → 画布(Canvas) → 动画(Animation) → 预览(Preview) → 导出(Export)。

**技术栈**：React + TypeScript + Vite；Konva/react-konva 画布渲染；Zustand + Immer 状态；Supabase 账号与项目云存储；WebCodecs 视频编码。**Vitest** 单测（仅覆盖纯逻辑层，见 §12）。

**仓库布局**：应用源码在 `app/` 子目录，所有 `npm` 命令在那里跑（用 `npm.cmd`）。仓库根目录是工作区（放 CLAUDE.md/AGENTS.md 等）。

**常用命令**（在 `app/` 下）：`npm.cmd run dev`（HMR 开发服 http://localhost:5173/）、`npm.cmd run check`（lint+build，**提交前必跑的门**）、`npm.cmd run test`（Vitest 纯逻辑单测）、`npm.cmd run build`、`npm.cmd run preview`。
> npm 遇用户目录权限问题时，把缓存固定到项目目录：`$env:npm_config_cache='D:\Project\BioDraw2\.codex\npm-cache'`（见 AGENTS.md）。

---

## 2. 分层架构（依赖只能向下；render 单独旁挂）

```
pages / features          UI 组件（页面、五大面板）
       ↓
     state                Zustand store（editorStore 为核心）
       ↓
  纯逻辑层                 types + animation + utils —— 绝不依赖 React/Konva/DOM
       ↓
 infrastructure           序列化、视频编码、Supabase

 render                   唯一接触 Konva 节点的桥接层（依赖 domain + state）
```

铁律：**纯逻辑层不得 import React/Konva/DOM**；**render 是 Konva 节点的规范封装层**；业务规则放纯函数，不嵌进组件（CLAUDE.md 反复强调"不要把 pathData/动画数学塞进 React 组件"）。
> **Konva 例外（现状，非违规但要知道）**：`features/canvas-panel/CanvasPanel.tsx` 持有 Konva `Stage`/`Layer` 并直接渲染部分形状，`canvas-panel/useVideoExport.ts` 调 `stage.draw()` 抓帧——这是 Stage 宿主与导出的必要耦合。所以"render 是唯一接触 Konva 的层"是**理想化表述**：对象级映射确实只在 render，但 Konva 不止 render 用。

> 历史注意：曾有 `src/domain/` 目录，但其唯一文件 `clipFactory.ts` 成了死代码被删、目录已移除。现纯逻辑统一落在 `src/animation/`、`src/types/`、`src/utils/`。CLAUDE.md 里"domain"是**概念层名**，不是真实目录。

### 目录速查（`app/src/`）

| 层 | 路径 | 内容 |
|---|---|---|
| 纯逻辑 | `types/index.ts` | 全部领域类型（一个文件） |
| 纯逻辑 | `animation/engine.ts` | 动画求值引擎 `buildAnimatedPreviewObjects` |
| 纯逻辑 | `animation/easing.ts` | 缓动/cubic-bezier 解析 + 曲线编辑数学 |
| 纯逻辑 | `animation/clipFactory.ts` | `buildClip` / `buildPresetClips` 片段工厂 |
| 纯逻辑 | `animation/conflictDomain.ts` | clip→冲突域映射（store 与 UI 共用） |
| 纯逻辑 | `utils/clone.ts` | `cloneDeep`（JSON 深拷贝） |
| state | `state/editorStore.ts` | 编辑器单一大 store（最核心，~1800 行） |
| state | `state/authStore.ts` / `projectStore.ts` | 登录态 / 当前项目元信息 |
| infra | `infrastructure/documentSerializer.ts` | `.biodraw` 文件序列化、版本号 |
| infra | `infrastructure/projectService.ts` | Supabase 项目 CRUD + 乐观锁 |
| infra | `infrastructure/supabaseClient.ts` | Supabase 客户端（会话存 sessionStorage） |
| infra | `infrastructure/video-encoder/` | WebCodecs 视频编码 |
| render | `render/objects/SceneObjectRenderer.tsx` | SceneObject→Konva 节点的唯一映射 |
| render | `render/animation/AnimationPathOverlay.tsx` | 运动路径叠加层 |
| UI | `features/{timeline,inspector,canvas,materials,toolbar}-panel/` | 五大面板 |
| UI | `pages/` | 编辑器页、项目列表、登录/注册 |
| UI | `hooks/` | 键盘、云保存、关闭拦截等 |

---

## 3. 核心数据模型（`types/index.ts`）

- **`SceneObject`**：画布元素。`type` ∈ material/rect/circle/line/arrow/text/triangle/trapezoid/curve。通用变换字段 `x,y,width,height,rotation,scaleX,scaleY,opacity`。类型专属数据放 `data: Record<string, unknown>`（如线/箭头/曲线的 `points: number[]` 扁平数组、material 的 `url`）。
- **`AppearSegment`**：元素出现时间窗 `{id,startMs,endMs}`。`SceneObject.appearSegments[]`（多段）优先于旧字段 `appearStartMs/appearEndMs`。
- **`AnimationClip`**：8 子类型判别联合——`move / moveAlongPath / polylineMove / shake / fade / scale / rotate / stateChange`。共有字段（`AnimationClipBase`）`id / objectId / type / startTimeMs / durationMs / easing / enabled / segmentId`，各自带 typed `payload`。**`objectId` 是 clip 关联对象的主键，引擎按它给 clip 分组**。
- **`MotionPath`**：bezier/polyline 路径，供 `moveAlongPath` 用。
- **`MaterialItem`**：SVG 素材库条目（含 style/animation 能力位、状态变体）。
- **`.biodraw` 实际存盘格式 = `DocumentSnapshot`**（定义在 `infrastructure/documentSerializer.ts`，**扁平**结构：`version:number(=FILE_VERSION=1)` + `savedAt` + `objects/animations/globalDurationMs/canvasWidth/canvasHeight/canvasBgColor`）。
- **`SceneDocument` / `ProjectDocument`**（`types/index.ts`，`version:string`、嵌套 `scene.{objects,materials,paths,...}`）是另一套领域类型，**当前序列化器并不使用它们**——存盘**不含** `materials`/`paths`。改存盘逻辑请去 `documentSerializer.ts`，别动 `SceneDocument`。

---

## 4. 不读代码会踩坑的关键不变量

1. **z-order = `objects` 数组顺序**：数组最后一个 = 最前层。图层操作 = 交换/移动数组位置。（`SceneObject` 上虽有 `zIndex` 字段、新建时会被写入，但**它不是权威**——渲染层序只看数组顺序，`zIndex` 目前是冗余字段，不要据它判断图层。）
2. **组合 = 共享 `groupId` 字符串**，不是容器对象。选中/移动组内任一元素 → 整组联动；图层移动把整组当一层跨过障碍组。
3. **`SceneObject.animationIds` 是 clip id 的反规范化索引**，clip 增删时必须同步维护。
4. **`appearSegments` 优先级**：存在（含空数组）按多段语义；`undefined` 才回退 `appearStartMs/appearEndMs`；都无则整段显示。新对象默认获得覆盖 `[0, globalDurationMs]` 的初始段。
5. **`AnimationClip.segmentId`** 把 clip 绑到某个 `AppearSegment.id`；无 segmentId 的旧 clip 视为 unbound。
6. **冲突域**（`animation/conflictDomain.ts`）：`move/moveAlongPath/polylineMove/shake→position`、`fade→opacity`、`scale→scale`、`rotate→rotation`、`stateChange→state`。**同段内同域的两个 clip 冲突**（但只在套用时拦截，时间轴只做提示、不阻止手动叠加）。
7. **`stateChange` 在引擎里单独解析**：它**就在 `buildAnimatedPreviewObjects` 函数体内**被处理——把所有 stateChange 的 steps 合并、按 `atMs` 全局排序，算出当前 `stateKey` **写回对象**；只是不走 `applyClip` 的数值变换通道。renderer 是**被动消费者**：读对象上已算好的 `stateKey` 去选对应 `stateVariants` 的 SVG（引擎完成状态解析，renderer 不处理 stateChange clip 逻辑）。
8. **`t=0` 默认编辑态**：引擎在 `currentTimeMs<=0` 时原样返回对象（不裁出现窗口），除非传 `evaluateAtZero:true`。

---

## 5. 状态层（`editorStore.ts`）

- 单一 Zustand+Immer store 管整个编辑器。开发期 `window.__store` 暴露。
- **撤销规则**：每个可 undo 的 mutation 在改 state 前先调 `pushHistory(state)`（最多 50 条快照）。`toggleObjectLock` 故意不入历史（锁定是元操作）。
- **Silent 变体**：很多 action 有 `...Silent` 版（如拖拽中连续更新），不入历史/不置脏，拖拽结束才用非 silent 版落一条历史。
- **undo/redo 后会置 `hasUnsavedChanges=true`**（撤销/重做相对上次保存即是改动；精确"等于磁盘状态"未追踪，属已知折中）。
- **播放状态机**：`play/pause/stop/advancePlayback` + `playbackStatus(stopped/playing/paused)`；`EditorPage` 用 RAF 驱动 `advancePlayback`。
- 片段创建走 `clipFactory.buildClip/buildPresetClips`（纯构造）→ 组件做暂停/选段/夹时间/`addAnimationClip`/flash 编排。套用动画 `applyAnimationClipsToObjects` 含段复用/创建、冲突检测、坐标/缩放/旋转换算（`buildAppliedClip`）。

---

## 6. 渲染桥（`render/`）

- **`SceneObjectRenderer.tsx` 把 SceneObject 映射成 Konva 节点**（对象级渲染的唯一映射点；但 Konva 不止这里用，见 §2 的 Konva 例外）。每个对象一个组件，按 type 走不同 Konva 形状；名称标签、箭头头部、曲线控制点等几何在此（这部分纯几何数学尚未抽出，是 A1 计划里**未做的 Phase 4**）。
- 选中时挂 Konva `Transformer`（手动 `nodes()` + effect 依赖要覆盖渲染门控值，历史上漏依赖出过 bug）。
- `AnimationPathOverlay.tsx` 画运动路径编辑叠加。

---

## 7. 关键链路

- **新建对象**：拖素材到画布 → `addSceneObject`（补初始 appearSegment、选中）。批量粘贴用 `addSceneObjects`（单条历史，原子）。
- **保存**：`useCloudSave` 监听 store 变化，防抖 5s 自动存 Supabase；串行化 + 版本号乐观锁（`updateProjectData` 带 `currentVersion`，冲突抛 `CONFLICT` 并重新拉版本）。`Ctrl+S` 另走本地 `.biodraw` 文件下载。
- **导出**：`useVideoExport`（WebCodecs，逐帧 `setCurrentTimeMs`+`flushSync`+`stage.draw` 抓帧）；序列帧导出在 canvas-panel。导出是不可逆/重资源操作，注意取消与资源释放。
- **认证**：`authStore` + Supabase；会话存 **sessionStorage**（关浏览器即登出）。改密/注销需重新登录校验。

---

## 8. 高风险区（改动需浏览器回归，见 AGENTS.md 的 Playwright/CDP 设置）

画布拖拽与多选、时间轴拖拽（片段重定位/边缘 resize）、播放状态机、序列帧/视频导出、自动保存与文件读写。这些区域**构建通过不代表正确**，要肉眼/截图验证。

---

## 9. 代码体量现状（约 19.6k 行）

纯逻辑层已分离干净、依赖无环、render 是唯一 Konva 接触点。**体量集中在 6 个大 UI/状态文件**（约占 70%）：`TimelinePanel.tsx`(~3900)、`InspectorPanel.tsx`(~3000)、`editorStore.ts`(~1800)、`ProjectsPage.tsx`(~1500)、`CanvasPanel.tsx`(~1500)、`SceneObjectRenderer.tsx`(~1400)。它们不是 bug，但若继续降复杂度，方向是按子职责拆成更小组件（属组件拆分，风险/性质不同于已完成的"纯逻辑分层"）。

---

## 10. 开发约定（详见 CLAUDE.md）

- 新功能实现顺序：**types → 纯逻辑 → state → render → feature UI → styles**。
- 外科手术式改动：只动任务所需，每行 diff 可追溯；提交信息用中文；提交前跑 `npm.cmd run check`。
- Windows/PowerShell 环境、中文编码、Git、浏览器验证的硬约束在 `AGENTS.md`，动手前必读。

---

## 11. 已知陷阱 / 死代码（省时间）

- **没有 localStorage 自动保存**：`documentSerializer.ts` 的 `STORAGE_KEY='biodraw_autosave'` 只在 `clearAutoSave` 被 `removeItem`、**从未写入**——别去找"本地自动恢复"逻辑。真实自动保存只有 `useCloudSave`（Supabase 防抖 5s）；本地保存只有 `Ctrl+S` 手动下载 `.biodraw`。（CLAUDE.md 里"localStorage autosave"的说法偏旧。）
- **`DocumentSnapshot` ≠ `SceneDocument`**：存盘走前者（扁平、不含 materials/paths），后者是未接入的领域类型（见 §3）。
- **`SceneObject.zIndex` 是冗余字段**：z-order 看 `objects` 数组顺序，不看它（见 §4-1）。
- **Konva 不止 render 用**：CanvasPanel/useVideoExport 也直接操作（见 §2 例外）。
- **Phase 4 几何未抽出**：`SceneObjectRenderer` 里的箭头/曲线/标签几何数学仍在组件内（A1 计划判定高风险、本轮未做）。
- **CLAUDE.md 个别描述偏理想化/偏旧**（如上述 localStorage、Konva 措辞）；冲突时以本文件与源码为准。

---

## 12. 测试（Vitest，纯逻辑层）

- 运行：`npm.cmd run test`（`vitest run`，node 环境，配置在 `vitest.config.ts`）；`npm.cmd run test:watch` 监听模式。
- 测试文件 `*.test.ts` 与源码同目录，**已排除出生产构建**（`tsconfig.app.json` 的 `exclude`），不影响 `npm run check`。
- **覆盖范围（只测纯逻辑，不碰 React/Konva/DOM）**：`animation/engine`（求值、出现窗口、缓动、**stateChange 全局时间序回归**）、`animation/easing`、`animation/clipFactory`、`animation/conflictDomain`、`infrastructure/documentSerializer`（序列化往返/校验，用 `FileReader` shim 绕过 node 无该 API）、`utils/clone`。
- **未覆盖**：组件、store 不变量（group/图层/undo）、画布/导出——属浏览器回归范畴，后续可单独建 store 单测与 Playwright 骨架。
- 这批测试反向锁住了第二大轮修复的多个行为（B5 状态序、A2 缓动、序列化往返等），改坏即红。
