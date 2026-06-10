# BioDraw 静态审查计划

> 动态维护文件。每轮开始前：确认上轮已完成 → 填写本轮计划 → 再开工。
> 配套结果文件：`results.md`

---

## 审查策略

**两阶段**：

1. **第 0 轮（全量摸底）**：用 `--scope branch --base 35a5711` 把整个代码库作为一次 diff 提交给 Codex，全面扫描，定位问题集中区域。
2. **第 1–12 轮（定向深挖）**：对高风险模块逐一使用 `adversarial-review`，附带项目特有约束作为 focus 文字。

工具：`/codex:adversarial-review`（质疑设计决策）优先于 `/codex:review`（报告现有问题）。

---

## 项目特有约束（全局）

所有轮次 focus 文字的基础约束，来源于 `CLAUDE.md`：

### 架构层依赖规则
- `domain` 层（`src/types/`, `src/domain/`）**绝对不得** import React、Konva 或任何 DOM API
- `render` 层是唯一知道 Konva 节点的地方
- 业务规则属于 `domain` 或纯函数，不得内嵌在 React 组件中

### 状态层不变量
- **每个可 undo 的操作**，修改 state 前必须先调用 `pushHistory(state)`
- `toggleObjectLock` 故意跳过 `pushHistory`（锁定是元操作，这是正确的）
- **`SceneObject.animationIds`** 是 clip ID 的反规范化索引，clips 增删时必须同步更新
- `objects` 数组顺序 = z-order（最后一个 = 最前层），层操作通过交换数组位置实现

### 动画数据不变量
- `AnimationClip.segmentId` 将 clip 绑定到 `AppearSegment.id`；无 segmentId 的旧 clip 视为 unbound
- clip 冲突检测按 domain 分组：`move/moveAlongPath/polylineMove/shake` → `position`；`fade` → `opacity`；`scale` → `scale`；`rotate` → `rotation`；`stateChange` → `state`
- `stateChange` clips 故意排除在 `buildAnimatedPreviewObjects` 之外，由 renderer 单独处理
- 新增对象始终获得一个覆盖 `[0, globalDurationMs]` 的初始 `appearSegments` 条目
- `t=0` 时引擎返回原始对象（编辑模式默认），除非传入 `evaluateAtZero: true`

### 编码规范
- 变量名反映领域含义：`selectedObjectIds`、`currentTimeMs`、`materialCatalog`，而非 `data`、`item`、`temp`
- 默认不写注释；只在 WHY 非显而易见时写一行
- 组件保持精简，不在组件内嵌入路径算法或动画数学

---

## 轮次计划

### 第 0 轮 — 全量摸底扫描
- **状态**：✅ 已完成（结果见 results.md）
- **审查文件**（全部 42 个 ts/tsx 文件）：
  ```
  src/main.tsx
  src/App.tsx
  src/types/index.ts
  src/domain/clipFactory.ts
  src/animation/engine.ts
  src/state/editorStore.ts
  src/state/projectStore.ts
  src/state/authStore.ts
  src/infrastructure/documentSerializer.ts
  src/infrastructure/projectService.ts
  src/infrastructure/supabaseClient.ts
  src/infrastructure/thumbnailCapture.ts
  src/infrastructure/zipExport.ts
  src/infrastructure/video-encoder/VideoExportEncoder.ts
  src/infrastructure/video-encoder/encoderConfig.ts
  src/infrastructure/video-encoder/index.ts
  src/render/objects/SceneObjectRenderer.tsx
  src/render/animation/AnimationPathOverlay.tsx
  src/hooks/useAutoSave.ts
  src/hooks/useCloudSave.ts
  src/hooks/useBeforeUnload.ts
  src/hooks/useEditorKeyboard.ts
  src/hooks/useNumberInputWheelEdit.ts
  src/features/canvas-panel/CanvasPanel.tsx
  src/features/canvas-panel/useVideoExport.ts
  src/features/inspector-panel/InspectorPanel.tsx
  src/features/inspector-panel/LayerPanel.tsx
  src/features/materials-panel/MaterialsPanel.tsx
  src/features/timeline-panel/TimelinePanel.tsx
  src/features/timeline-panel/KeyframeEditor.tsx
  src/features/toolbar/ToolbarPanel.tsx
  src/pages/editor/EditorPage.tsx
  src/pages/projects/ProjectsPage.tsx
  src/pages/projects/ProjectExportModal.tsx
  src/pages/projects/ChangePasswordModal.tsx
  src/pages/projects/DeleteAccountModal.tsx
  src/pages/login/LoginPage.tsx
  src/pages/login/ForgotPasswordPage.tsx
  src/pages/login/ResetPasswordPage.tsx
  src/pages/register/RegisterPage.tsx
  src/components/ProtectedRoute.tsx
  src/components/TooltipPortal.tsx
  ```
- **base commit**：`35a5711`（feat(base): BioDraw phase 2 and 3 core features and UI layout）
- **命令**：
  ```
  /codex:adversarial-review --background --base 35a5711 --scope branch
  ```
- **目标**：了解问题分布，为后续轮次调整优先级
- **完成标准**：Codex 返回结构化 findings，记录到 results.md

---

### 第 1 轮 — 状态层（最高优先级）
- **状态**：✅ 已完成（结果见 results.md）
- **范围**：`src/state/editorStore.ts`
- **focus 约束**：
  - 每个可 undo 操作是否在修改 state 前调用 `pushHistory`
  - clips 增删时 `animationIds` 是否同步更新
  - z-order 层操作是否通过正确交换 `objects` 数组位置实现
  - `toggleObjectLock` 跳过 pushHistory 是否有其他操作也不当地跳过了
  - play/pause/stop/advancePlayback 状态机的状态转换是否完整无遗漏
- **命令**：
  ```
  /codex:adversarial-review --background src/state/editorStore.ts
  重点检查：1)每个可undo操作修改state前是否调用pushHistory；2)clips增删时animationIds是否同步；3)z-order层操作是否正确交换objects数组位置；4)playback状态机状态转换完整性
  ```

---

### 第 2 轮 — 动画引擎
- **状态**：✅ 已完成（结果见 results.md）
- **范围**：`src/animation/engine.ts`
- **focus 约束**：
  - 时间轴边界计算（clipStartMs + durationMs 的越界处理）
  - 插值精度（easing 函数在 t=0 和 t=1 的边界值是否精确）
  - `evaluateAtZero: true` 分支是否覆盖所有 clip 类型
  - `stateChange` 故意排除在外，是否有其他 clip 类型也被错误排除
  - `appearSegments` 多段时间窗口与 legacy `appearStartMs/appearEndMs` 的优先级逻辑
- **命令**：
  ```
  /codex:adversarial-review --background src/animation/engine.ts
  重点检查：1)时间轴边界计算越界处理；2)easing插值在t=0和t=1的边界精度；3)appearSegments与legacy字段的优先级逻辑；4)evaluateAtZero分支覆盖完整性
  ```

---

### 第 3 轮 — 数据持久化层
- **状态**：✅ 已完成（结果见 results.md）
- **范围**：`src/infrastructure/documentSerializer.ts` + `src/hooks/useAutoSave.ts` + `src/hooks/useCloudSave.ts`
- **focus 约束**：
  - 序列化/反序列化的往返一致性（serialize → deserialize 是否幂等）
  - 文件版本号 `FILE_VERSION = 1` 的版本迁移逻辑（缺失字段的默认值处理）
  - autosave 与手动保存的竞争条件
  - localStorage 与云端的同步冲突处理
  - 大文件或异常数据导致的静默失败
- **命令**：
  ```
  /codex:adversarial-review --background src/infrastructure/documentSerializer.ts src/hooks/useAutoSave.ts src/hooks/useCloudSave.ts
  重点检查：1)序列化往返一致性；2)版本迁移缺失字段默认值；3)autosave与手动保存竞争条件；4)localStorage与云端同步冲突
  ```

---

### 第 4 轮 — 导出流程
- **状态**：✅ 已完成（结果见 results.md）
- **范围**：`src/features/canvas-panel/useVideoExport.ts` + `src/infrastructure/video-encoder/`
- **focus 约束**：
  - 导出是不可逆操作，部分失败时的状态回滚
  - 帧序列导出与视频编码的资源泄漏（canvas、worker、blob URL）
  - 导出过程中用户中断的处理
  - 编码器配置参数的边界值（分辨率、FPS、时长为 0 的情况）
- **命令**：
  ```
  /codex:adversarial-review --background src/features/canvas-panel/useVideoExport.ts src/infrastructure/video-encoder/
  重点检查：1)部分失败时状态回滚；2)canvas/worker/blob资源泄漏；3)用户中断处理；4)编码器边界值（0帧、0时长）
  ```

---

### 第 5 轮 — 类型与领域层
- **状态**：⬜ 待执行（第 4 轮完成后）
- **范围**：`src/types/index.ts` + `src/domain/clipFactory.ts`
- **focus 约束**：
  - `SceneObject.data: Record<string, unknown>` 的类型安全风险
  - `AnimationClip` 判别联合类型的完整性（8 个子类型是否都有对应处理）
  - `clipFactory` 创建的默认值是否满足所有不变量（segmentId、时间范围等）
  - `points: number[]` 平铺数组的约定是否在类型层面有保障

---

### 第 6 轮 — 渲染层
- **状态**：⬜ 待执行（第 5 轮完成后）
- **范围**：`src/render/objects/SceneObjectRenderer.tsx` + `src/render/animation/AnimationPathOverlay.tsx`
- **focus 约束**：
  - `stateChange` clip 在 renderer 中的单独处理逻辑是否覆盖所有状态
  - Konva 节点的引用管理（是否存在节点未被销毁的泄漏）
  - domain 层与 Konva 的隔离（renderer 是否意外引入了业务逻辑）

---

### 第 7 轮 — 时间轴 UI
- **状态**：⬜ 待执行（第 6 轮完成后）
- **范围**：`src/features/timeline-panel/TimelinePanel.tsx` + `src/features/timeline-panel/KeyframeEditor.tsx`
- **focus 约束**：
  - clip 拖拽重定位时是否正确触发 pushHistory
  - segment 边缘 resize 的边界约束（最小宽度、不超出全局时长）
  - clip 冲突检测在拖拽过程中是否实时有效

---

### 第 8 轮 — 画布 UI
- **状态**：⬜ 待执行（第 7 轮完成后）
- **范围**：`src/features/canvas-panel/CanvasPanel.tsx`
- **focus 约束**：
  - Konva Stage 的多选与拖拽事件处理
  - 画布坐标系与屏幕坐标系的转换精度
  - 拖拽到画布的材质对象初始状态是否满足不变量

---

### 第 9 轮 — 属性/材质/工具栏面板
- **状态**：⬜ 待执行（第 8 轮完成后）
- **范围**：`src/features/inspector-panel/InspectorPanel.tsx` + `src/features/inspector-panel/LayerPanel.tsx` + `src/features/materials-panel/MaterialsPanel.tsx` + `src/features/toolbar/ToolbarPanel.tsx`
- **focus 约束**：
  - 属性修改是否都经过 pushHistory
  - 图层操作（z-order 调整）是否正确维护 objects 数组顺序

---

### 第 10 轮 — 其余 state / infrastructure
- **状态**：⬜ 待执行（第 9 轮完成后）
- **范围**：`src/state/projectStore.ts` + `src/state/authStore.ts` + `src/infrastructure/projectService.ts` + `src/infrastructure/thumbnailCapture.ts` + `src/infrastructure/zipExport.ts`
- **focus 约束**：
  - Supabase 调用的错误处理是否完整（网络失败、权限不足）
  - 认证状态变更时的 store 清理是否完整

---

### 第 11 轮 — Hooks 与键盘交互
- **状态**：⬜ 待执行（第 10 轮完成后）
- **范围**：`src/hooks/useEditorKeyboard.ts` + `src/hooks/useBeforeUnload.ts` + `src/hooks/useNumberInputWheelEdit.ts`
- **focus 约束**：
  - 键盘事件监听的注册/注销是否对称（防止泄漏）
  - 快捷键与 undo/redo 的交互是否正确触发 pushHistory

---

### 第 12 轮 — 页面层（低风险扫描）
- **状态**：⬜ 待执行（第 11 轮完成后）
- **范围**：`src/pages/editor/EditorPage.tsx` + `src/pages/projects/ProjectsPage.tsx` + 各 Modal + 登录/注册页 + `src/App.tsx`
- **focus 约束**：
  - 路由权限保护（ProtectedRoute）的覆盖完整性
  - 页面卸载时的资源清理

---

## 状态说明

| 符号 | 含义 |
|---|---|
| ⬜ | 待执行 |
| 🔄 | 进行中 |
| ✅ | 已完成，结果已记录到 results.md |
| ⏭️ | 已跳过（注明原因） |
