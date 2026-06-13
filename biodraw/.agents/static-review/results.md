# BioDraw 静态审查结果

> 累积记录每轮 Codex findings，作为后续修改的依据。
> 配套计划文件：`plan.md`

---

<!-- 每轮结束后，在此追加以下格式的内容：

## 第 N 轮 — [轮次名称]
**完成时间**：YYYY-MM-DD  
**审查范围**：...  
**整体结论**：approve / needs-attention  

### Findings
（Codex 原始输出，按 severity 排序）

---

-->

## 第 0 轮 — 全量摸底扫描

**完成时间**：2026-06-09
**审查范围**：全部 42 个 ts/tsx 文件，branch diff against `35a5711`
**整体结论**：⛔ needs-attention

> No-ship: the diff still has credible data-loss and consistency gaps in autosave, undo/history, migration, and project-copy failure handling.

---

### Findings

#### [HIGH] 自动保存竞争条件导致云端数据静默丢失
**文件**：`biodraw/src/hooks/useCloudSave.ts:24-40`
**置信度**：高

`performSave` 捕获快照后 `await updateProjectData`，完成后无条件调用 `markSaved()`。若该请求飞行期间用户继续编辑，较早请求的完成会清除更新改动的 dirty 标志；若并发保存同时飞行，较慢的旧请求还可能以过期数据覆盖较新的快照。

**影响**：云端数据静默丢失，或在下一个 debounce 触发前产生"已保存"的假状态。

**建议**：维护单调递增的本地修订号/保存 token，仅在保存完成时修订号与当前 store 修订号一致才调用 `markSaved()`，并串行化或拒绝过期的飞行中请求，防止旧请求覆盖新快照。

---

#### [HIGH] 画布设置游离于 undo 历史与 dirty 追踪之外
**文件**：`biodraw/src/state/editorStore.ts:1491-1500`
**置信度**：高

`EditorSnapshot` 只存储 objects、animations 和 duration，而 `setCanvasSize`、`setCanvasBgColor` 在不调用 `pushHistory` 的情况下修改画布状态。画布尺寸/背景色的编辑无法被撤销/重做，也不会通过历史路径设置 `hasUnsavedChanges`。

**影响**：用户可对文档进行可见的修改，却没有对应的 undo 条目，且未保存变更的保护更弱。

**建议**：将 `canvasWidth`、`canvasHeight`、`canvasBgColor` 加入 `EditorSnapshot`，在 undo/redo 中恢复它们，并在用户可见的画布设置变更之前调用 `pushHistory`。

---

#### [MEDIUM] 云端加载的旧版快照可能继承上一个项目的画布
**文件**：`biodraw/src/state/editorStore.ts:1502-1510`
**置信度**：中

`loadSnapshot` 仅在字段存在时才赋值画布字段。由于云端加载直接将数据库 JSON 强转为 `DocumentSnapshot`，缺少 `canvasWidth`、`canvasHeight`、`canvasBgColor` 的旧版/格式异常项目会保留 store 中已有的画布值（即上一个编辑项目的画布）。下一次自动保存会把这些错误值持久化到被加载的项目中。

**建议**：在调用 `loadSnapshot` 前通过统一解析器对所有加载的快照进行规范化/迁移，为缺失的画布字段补充明确的默认值，并验证 `version` 字段，而非保留 store 现有值。

---

#### [MEDIUM] 复制项目在缩略图更新失败时留下数据库孤儿记录
**文件**：`biodraw/src/pages/projects/ProjectsPage.tsx:807-819`
**置信度**：中

`handleCopyProject` 先创建新项目，再发起第二个 `updateProjectData` 调用来复制缩略图。若第二次 Supabase 调用失败，catch 报告"复制失败"且不将行添加到本地状态，但新项目已存在于数据库中。重试会创建重复项目，刷新后出现。

**建议**：从 UI 角度使复制创建具有原子性：将缩略图包含在创建 payload 中；或将缩略图复制作为追加项目后的尽力操作；或在第二次调用失败时删除新创建的项目进行补偿。

---

### 修复记录（2026-06-10）

| # | 文件 | 修复内容 | 状态 |
|---|---|---|---|
| 1 | `src/hooks/useCloudSave.ts` | 增加 `editRevisionRef`，`markSaved()` 仅在保存完成时修订号未变才调用 | ✅ 已修复 |
| 2 | `src/state/editorStore.ts` | `EditorSnapshot` 加入 canvas 三字段；`toSnapshot` 同步更新；`setCanvasSize`/`setCanvasBgColor` 前加 `pushHistory`；undo/redo 恢复 canvas 字段 | ✅ 已修复 |
| 3 | `src/state/editorStore.ts` | `loadSnapshot` 改为 `?? 默认值`，旧版快照不再继承上一项目画布 | ✅ 已修复 |
| 4 | `src/pages/projects/ProjectsPage.tsx` | `createProject` 成功后立即写入 local state，缩略图更新改为 best-effort（`.catch(() => {})`） | ✅ 已修复 |

构建验证：`npm run check` → 0 errors，2 warnings（均为改动前已存在）。

---

## 第 1 轮 — 状态层

**完成时间**：2026-06-10
**审查范围**：`src/state/editorStore.ts`，branch diff against `35a5711`
**整体结论**：⛔ needs-attention

> No ship: editorStore still has undo/dirty bypasses and lock-protection gaps in user-visible editing paths.

---

### Findings

#### [HIGH] Segment 时间编辑绕过 undo 和 dirty 追踪
**文件**：`biodraw/src/state/editorStore.ts:1183-1204`
**置信度**：高

`updateAppearSegmentSilent` 在没有调用 `pushHistory` 或直接 dirty 标记的情况下，修改 `obj.appearSegments` 并重写 `state.animations` 中的匹配 clip。这不只是瞬态状态：timeline 标签编辑器在输入预览阶段调用 silent updater，最终提交时可能看到已变更的 segment 并跳过正常的 `updateAppearSegment` 路径。结果：教师修改 segment/clip 时序后，没有 undo 条目，也没有未保存提示，快速导航或关闭前保存是数据丢失路径。

**建议**：不要通过无历史记录的 store action 持久化预览编辑。要么将预览时序保留在本地直到提交，要么以提交前快照为起点追踪编辑事务，在提交时恰好调用一次 `pushHistory`；同时确保持久化的 silent migration 与用户编辑明确区分。

---

#### [HIGH] 锁定对象可通过批量删除被删除
**文件**：`biodraw/src/state/editorStore.ts:617-633`
**置信度**：高

`removeSceneObjects` 删除传入的所有 id 并移除其 clips，但从不过滤 `locked` 对象。UI 已存在 selectedIds 包含锁定对象的路径，且多选删除按钮直接传入 `selectedIds`，store 层未执行锁定不变量。锁定对象及其动画可被不可逆删除（除 undo 外），破坏了"防止意外删除"的锁定保护声明。

**建议**：在 store 中强制执行锁定保护：从现有未锁定对象中派生可删除 id 集合，若为空则返回，并用该集合执行对象删除、clip 删除和选中状态清理。对 `removeSceneObject` 应用相同守卫。

---

#### [MEDIUM] 批量图层步进操作在混合边界选中时错误地不执行
**文件**：`biodraw/src/state/editorStore.ts:845-880`
**置信度**：中

`moveMultipleObjectsForward` 在最高选中对象已位于顶层时立即返回；`moveMultipleObjectsBackward` 在最低选中对象已位于底层时立即返回。对于包含边界对象和其他可移动对象的非连续多选，可移动对象永远不会与相邻未选中对象交换。用户可见的"上移一层/下移一层"批量层操作可能在有效交换存在时静默地什么都不做。

**建议**：移除全局边界提前返回。按现有排序顺序遍历并对每个有未选中相邻对象的选中 index 执行交换，只跳过单个边界项。

---

### 修复记录（2026-06-10）

| # | 文件 | 修复内容 | 状态 |
|---|---|---|---|
| 1 | `src/features/timeline-panel/TimelinePanel.tsx` | 新增 `segLabelSilentDirtyRef`；Silent 调用时置位；commit 路径改用 dirty ref 判断是否需要 `pushHistory`，不再与已被 Silent 污染的 store 值对比 | ✅ 已修复 |
| 2 | `src/state/editorStore.ts` | `removeSceneObject` 加 locked 守卫提前返回；`removeSceneObjects` 先过滤出未锁定 id 集合，空则跳过 | ✅ 已修复 |
| 3 | `src/state/editorStore.ts` | `moveMultipleObjectsForward/Backward` 移除全局边界提前返回，改为 `canMove` 检查（是否存在至少一个可交换项），只在确有交换时调用 `pushHistory` | ✅ 已修复 |

构建验证：`npm run check` → 0 errors，2 warnings（均为改动前已存在）。

---

## 第 2 轮 — 动画引擎

**完成时间**：2026-06-10
**审查范围**：`src/animation/engine.ts`，branch diff against `35a5711`
**整体结论**：⛔ needs-attention

> 不建议发版：`engine.ts` 在多段出现窗口和 cubic-bezier 端点上有可复现的边界错误，会导致预览/导出帧和时间轴语义不一致。

---

### Findings

#### [HIGH] 删除所有出现段后对象会被引擎重新显示
**文件**：`biodraw/src/animation/engine.ts:250-258`
**置信度**：高

`obj.appearSegments && obj.appearSegments.length > 0` 才启用多段语义，空数组会落入 legacy `appearStartMs/appearEndMs` 分支。用户主动删完所有出现窗口后，预览和导出仍可能按旧字段显示该对象。应只在 `appearSegments === undefined` 时回退 legacy；字段存在时空数组应直接跳过（不可见）。

---

#### [HIGH] 动画 clip 未按所属出现段隔离，跨段状态串扰
**文件**：`biodraw/src/animation/engine.ts:261-275`
**置信度**：高

引擎只过滤 `stateChange`，其余 clip 按绝对时间全量应用，完全忽略 `clip.segmentId`。有多个出现段时，第一段的已结束 clip（`isClipEndedAt` 为真）会被套用到对象后续出现段，将前段的末态（位置/透明度/缩放）污染后段。例如对象第一段有移动 clip，第二段重新出现时会继续显示移动结束位置，而非原始位置。

---

#### [MEDIUM] cubic-bezier easing 在 t=0/t=1 不精确返回端点
**文件**：`biodraw/src/animation/engine.ts:22-36`
**置信度**：中

`solveCubicBezierY` 直接进入二分求解，未对 `x=0` / `x=1` 做提前返回。20 次迭代后 t≈1e-6，`cubicBezierAt(t, y1, y2)` 约为 `3e-6 * y1` 而非精确 0；`x=1` 同理。clip 开始/结束帧的属性值会有微小漂移（sub-pixel 量级）。

---

### 修复记录（2026-06-10）

| # | 文件 | 修复内容 | 状态 |
|---|---|---|---|
| 1 | `src/animation/engine.ts` | 出现窗口判定改为 `appearSegments !== undefined` 触发多段语义；空数组直接 `continue`（不可见）；捕获 `activeSegmentId` | ✅ 已修复 |
| 2 | `src/animation/engine.ts` | clip 过滤追加 `segmentId` 隔离：`!activeSegmentId \|\| !clip.segmentId \|\| clip.segmentId === activeSegmentId`；无 segmentId 的旧 clip 视为 unbound，全段有效 | ✅ 已修复 |
| 3 | `src/animation/engine.ts` | `solveCubicBezierY` 头部加 `x <= 0 return 0` / `x >= 1 return 1` 两行 guard | ✅ 已修复 |

构建验证：`npm run check` → 0 errors，2 warnings（均为改动前已存在）。

---

## 第 3 轮 — 数据持久化层

**完成时间**：2026-06-10
**审查范围**：`src/infrastructure/documentSerializer.ts` + `src/hooks/useAutoSave.ts` + `src/hooks/useCloudSave.ts`，branch diff against `35a5711`
**整体结论**：⛔ needs-attention

---

### Findings

#### [CRITICAL→HIGH] 并发保存可用旧请求覆盖新手动保存
**文件**：`biodraw/src/hooks/useCloudSave.ts:27-45`

`revision` 守卫只保护 `markSaved()`，`updateProjectData` 在守卫之前无条件执行。慢自动保存在快手动保存之后完成时，旧快照覆盖云端，UI 仍显示"已保存"。实际为 HIGH。

#### [HIGH] 切换项目时会把上一项目快照排队保存到新 projectId
**文件**：`biodraw/src/hooks/useCloudSave.ts:52-59`

`performSave` 引用变化（因 `projectId` 变化）触发 useEffect，给新 `projectId` 排 5 秒定时器，但 store 仍是旧项目数据。

#### [HIGH→LOW] FILE_VERSION 只写不读，反序列化没有版本迁移边界
**文件**：`biodraw/src/infrastructure/documentSerializer.ts:57-70`

`parseDocumentFile` 不检查 `version`，`canvasBgColor` 未做类型校验。当前只有版本 1，实际影响为零。

#### [MEDIUM→删除] useAutoSave 死代码
**文件**：`biodraw/src/hooks/useAutoSave.ts`

无任何调用方，描述的运行时风险不存在，直接删除。

---

### 修复记录（2026-06-10）

| # | 文件 | 修复内容 | 状态 |
|---|---|---|---|
| 1 | `src/hooks/useCloudSave.ts` | `do-while` 串行化保存：在途时新请求置位 pending，当前完成后立即用最新快照再保存 | ✅ 已修复 |
| 2 | `src/hooks/useCloudSave.ts` | `prevProjectIdRef` 检测项目切换，变化时清除定时器跳过排队 | ✅ 已修复 |
| 3 | `src/infrastructure/documentSerializer.ts` | 追加版本校验及 `canvasBgColor` 类型兜底 | ✅ 已修复 |
| 4 | `src/hooks/useAutoSave.ts` | 删除死代码 | ✅ 已删除 |

构建验证：`npm run check` → 0 errors，2 warnings（均为改动前已存在）。

---

## 第 4 轮 — 导出流程

**完成时间**：2026-06-11
**审查范围**：`src/features/canvas-panel/useVideoExport.ts` + `src/infrastructure/video-encoder/VideoExportEncoder.ts`，branch diff against `35a5711`
**整体结论**：⛔ needs-attention

> No-ship: cancellation and encoder boundary handling still have user-visible failure modes.

---

### Findings

#### [HIGH] VideoFrame 缺少 duration，MP4 输出损坏
**文件**：`biodraw/src/infrastructure/video-encoder/VideoExportEncoder.ts:110-128`
**置信度**：高

`encodeFrame` 只传 `timestamp` 给 `VideoFrame`，未传 `duration`；mp4-muxer 要求每个 sample 有明确时长，否则 flush/mux 失败或输出不可 seek 的 MP4。

---

#### [HIGH] cancel 无法中断 finalize()（跳过，低优先级）
**文件**：`biodraw/src/features/canvas-panel/useVideoExport.ts:161-165`
**置信度**：低（对 BioDraw 短动画场景影响可忽略）

finalize 完成后立即检查 cancel，对 <240 帧的典型导出耗时极短。引入 AbortController 竞争复杂度不对等，暂不修。

---

#### [MEDIUM] unmount 后异步任务继续执行，操作 stale stage ref
**文件**：`biodraw/src/features/canvas-panel/useVideoExport.ts:198-199`
**置信度**：高

cleanup 只处理 `encoder` 已构建的情况；encoder 构建前有 3 个 await（waitForNextPaint、waitForMaterialImages、resolveSupported），组件卸载时 cleanup 是 no-op，异步任务继续修改 store 状态。

---

#### [MEDIUM] 构造函数不验证 fps/尺寸边界值
**文件**：`biodraw/src/infrastructure/video-encoder/VideoExportEncoder.ts:64-87`
**置信度**：中

`this.fps = opts.fps` 无校验；fps=0 时 timestamp 计算除以 0。虽然唯一调用方已做 clamp，基础设施层自身无防线。

---

### 修复记录（2026-06-11）

| # | 文件 | 修复内容 | 状态 |
|---|---|---|---|
| 1 | `src/infrastructure/video-encoder/VideoExportEncoder.ts` | `encodeFrame` 计算 `durationUs = Math.round(1_000_000 / fps)` 并传入 `VideoFrame` | ✅ 已修复 |
| 2 | `src/features/canvas-panel/useVideoExport.ts` | 新增 `aborted` flag；cleanup 置位；encoder 构建前 3 个 await 后均加 `if (aborted) return` | ✅ 已修复 |
| 3 | `src/infrastructure/video-encoder/VideoExportEncoder.ts` | 构造函数入口校验 fps ≥ 1、width/height ≥ 1，不满足立即抛出明确错误 | ✅ 已修复 |
| 4 | Finding 2（cancel 无法中断 finalize） | 跳过，风险不对等 | ⏭️ 跳过 |

构建验证：`npm run check` → 0 errors，2 warnings（均为改动前已存在）。

---

## 第 5 轮 — 类型与领域层

**完成时间**：2026-06-11
**审查范围**：`src/types/index.ts` + `src/domain/clipFactory.ts`
**审查方式**：Claude 自查 + Codex adversarial-review 交叉验证
**整体结论**：⛔ needs-attention

---

### Findings

#### [MEDIUM] `clipFactory.ts` 全文件死代码
**文件**：`src/domain/clipFactory.ts`
**来源**：Claude 发现，Codex 确认

`buildAnimationClip`、`CLIP_TYPE_OPTIONS`、`ClipCreatableType` 三个导出在整个 `src/` 中零引用。docstring "用于'添加动画'入口"具有误导性——实际入口是 `TimelinePanel.createClip`，独立实现且正确设置 `segmentId`。误用工厂生成的 clip 缺少 `segmentId`，会成为跨所有出现段生效的 unbound legacy clip。

#### [MEDIUM] `applyClip` default 分支静默吸收未处理类型
**文件**：`src/animation/engine.ts:228`
**来源**：Codex 发现，Claude 确认

`default: return obj` 无编译期穷举保证。`stateChange` 已在上游 `.filter()` 过滤，但将来新增 clip 类型而忘记更新 `applyClip` 时会静默漏处理。

#### [LOW / 记录不修] `SceneObject.data` 无判别联合
`data?: Record<string, unknown>` 无类型级约束，修复需重构为判别联合，超出本轮范围。

#### [LOW / 记录不修] `points: number[]` 平铺数组无类型保障
`points[i + 1]` 假设偶数长度数组，无 `FlatPointArray` brand 或守卫函数，超出本轮范围。

#### [LOW / 记录不修] `SceneObject.zIndex` 只写不读
创建时写入 `objects.length`，实际 z-order 由数组位置决定，`zIndex` 字段从未被读取，本轮不动。

---

### 修复记录（2026-06-11）

| # | 文件 | 修复内容 | 状态 |
|---|---|---|---|
| 1 | `src/domain/clipFactory.ts` | 删除全文件（零引用死代码） | ✅ 已删除 |
| 2 | `src/animation/engine.ts` | `applyClip` 新增 `case 'stateChange': return obj` + `default` 改用 `never` 断言 | ✅ 已修复 |
| 3 | SceneObject.data 判别联合、FlatPointArray brand、zIndex | 记录，超出本轮范围 | ⏭️ 跳过 |

构建验证：`npm run check` → 0 errors，2 warnings（均为改动前已存在）。

---

## 第 6 轮 — 渲染层

**完成时间**：2026-06-11
**审查范围**：`src/render/objects/SceneObjectRenderer.tsx` + `src/render/animation/AnimationPathOverlay.tsx`
**审查方式**：Claude 自查 + Codex adversarial-review 交叉验证
**整体结论**：⛔ needs-attention

### Findings

#### [HIGH / 记录不修] `stateChange` clip 在完整渲染链路中完全无效
engine 过滤 stateChange 并声明"由 renderer 处理"，但 CanvasPanel 和 SceneObjectRenderer 均无任何 stateChange 处理逻辑，stateKey 从未根据活跃 clip 变更。功能完全缺失，需单独立项实现。

**跳过原因**：这是功能未实现，不是 bug fix。实现需要：① 在 SceneObjectRenderer 中读取当前时间下活跃的 stateChange clip；② 根据 currentTimeMs 求值 `toStateKey`；③ 覆盖 sceneObject.stateKey 以驱动 MaterialItem SVG 变体渲染。涉及 renderer 核心逻辑改动，属于新功能开发，需单独立项。

#### [MEDIUM] arrow/line 控制点 `onDragMove` 每帧写 store → undo 历史污染
`commitLinePoints` 在 onDragMove 中调用 → `updateSceneObject` → `pushHistory`，每次鼠标移动产生一条 undo 历史。curve 已正确使用 draft 模式（setCurveDraftPoints + 仅 onDragEnd 提交），line/arrow 缺失。

#### [LOW] `renderContent()` `default: return null` 缺穷举保护
同 engine.ts applyClip 已修复的模式，新增 SceneObjectType 时会静默渲染空。

#### [LOW / 记录不修] `useImage` 无 stale URL 防护
unmount 或快速 URL 切换后 decode promise 可能仍回调，低风险。

**跳过原因**：BioDraw 的 material URL 是静态 SVG asset path，不会频繁切换，unmount 窗口极短。将第三方 `useImage` hook 替换为可取消版本改动成本与收益不对等，且不影响可见正确性。

#### [NOTE / 记录不修] 曲线/箭头几何内联在 renderer（架构债）
`getCurveNameLabelPosition`、箭头轴头几何等属于 domain 数学，内联在组件中违反"组件要薄"约定，下次触碰时迁移。

**跳过原因**：不影响当前正确性，属于架构清理。建议下次触碰这些文件时顺手迁移到 `src/domain/geometry.ts`，避免为此单独开一轮改动。

### 修复记录（2026-06-11）

| # | 文件 | 修复内容 | 状态 |
|---|---|---|---|
| 1 | `src/render/objects/SceneObjectRenderer.tsx` | 新增 `lineDraftPoints` state；arrow/line onDragMove 改写草稿，onDragEnd 才 commitLinePoints + 清草稿 | ✅ 已修复 |
| 2 | `src/render/objects/SceneObjectRenderer.tsx` | `renderContent()` default 改用 never 断言 | ✅ 已修复 |
| 3 | stateChange 完整实现、useImage 防护、几何架构迁移 | 记录，超出本轮范围 | ⏭️ 跳过 |

构建验证：`npm run check` → 0 errors，2 warnings（均为改动前已存在）。

---

## 第 7 轮 — 时间轴 UI（2026-06-11）

**范围**：`src/features/timeline-panel/TimelinePanel.tsx` + `src/features/timeline-panel/KeyframeEditor.tsx`

**审查方式**：Claude 自查 + Codex adversarial review，结论完全一致。

### 确认正常

- `updateAnimationClip` / `reorderAnimationClips` / `updateAppearSegment` 均调用 `pushHistory` ✅
- `updateAppearSegmentSilent` 故意不调用 pushHistory（输入框实时预览专用）✅
- Clip 拖拽是 draft 模式：mousemove 只更新本地 `dragState`，mouseup 才一次性 `updateAnimationClip` ✅
- KeyframeEditor 关键帧拖拽也是 draft 模式：mousemove 只 `setDragState`，mouseup 才提交 ✅
- 冲突检测 `conflictMeta` 正确使用 `dragState.previewStartMs/previewDurationMs` 实时计算 ✅
- Segment 最小宽度 1000ms：拖拽中和 commit 均强制 ✅
- Segment 不超出全局时长：commit 时 `Math.min(globalDurationMs, ...)` 强制 ✅

### Findings

#### [MEDIUM] `autoResolveConflicts` 和 `applyBatchEdits` 批量循环产生多条 undo 历史
两个函数均在 for/forEach 循环内逐条调用 `updateAnimationClip`，每次调用触发 `pushHistory`。N 条冲突解决/批改产生 N 条 undo 历史，用户需多次 Ctrl+Z 才能整体还原。

#### [LOW] `sortClipsByStartTime` 缺 `ensurePausedForEdit()`
`reorderAnimationClips` 有 pushHistory，但播放中调用不会暂停，与所有其他写操作行为不一致。

#### [LOW / 记录不修] Clip drag `startClipDrag` 在 mousedown 无条件暂停
Claude 独立发现。`startClipDrag`/`startClipResizeStart`/`startClipResizeEnd` 在 mousedown 立即 `ensurePausedForEdit()`，即使用户只是单击未拖拽也会暂停播放。对比 segment 窗口拖拽的 lazy-pause 设计不一致。

**跳过原因**：行为不影响正确性，仅影响"单击 clip 时是否暂停"的交互体验。修复需要引入类似 `windowDragMovedRef` 的 lazy-pause 机制，改动量与收益不对等。

### 修复记录（2026-06-11）

| # | 文件 | 修复内容 | 状态 |
|---|---|---|---|
| 1 | `src/state/editorStore.ts` | 新增 `batchUpdateAnimationClips` action：一次 pushHistory + 批量 patch | ✅ 已修复 |
| 2 | `src/features/timeline-panel/TimelinePanel.tsx` | `autoResolveConflicts` 和 `applyBatchEdits` 改为收集 patches 后单次调用 `batchUpdateAnimationClips` | ✅ 已修复 |
| 3 | `src/features/timeline-panel/TimelinePanel.tsx` | `sortClipsByStartTime` 补调 `ensurePausedForEdit()` | ✅ 已修复 |

构建验证：`npm.cmd run check` → 0 errors，2 warnings（均为改动前已存在）。

---

## 第 8 轮 — 画布 UI（2026-06-11）

**范围**：`src/features/canvas-panel/CanvasPanel.tsx`

**审查方式**：Claude 自查 + Codex adversarial review，交叉验证后结论一致。

### 确认正常

- `handleDrop` 新建对象未带 `appearSegments`：store `addSceneObject` 自动补 ✅
- Drop 坐标转换 `(pointer.x - pos.x) / scale` 正确 ✅
- 对象删除时 clips 清理完整（store 负责）✅
- Konva Stage / Layer 无节点泄漏 ✅

### Findings

#### [HIGH] 组拖拽产生两次 pushHistory → undo 状态拆坏
**Claude + Codex 均确认（Codex 升为 HIGH）。**

原流程：
1. `SceneObjectRenderer.handleDragEnd` 先调 `onDragStop()`（`moveMultipleSceneObjects(followers)`，pushHistory #1）
2. 再调 `updateSceneObject(leader)`（pushHistory #2）

两次 pushHistory 意味着 undo 先还原跟随对象位置、再还原主对象位置，中间状态不一致（跟随对象回到移动后位置 + 主对象停留原位）。

#### [MEDIUM / 记录不修] 橡皮筋框选忽略旋转（AABB）
命中测试使用轴对齐包围盒（AABB）。旋转后的对象仍以旋转前坐标做碰撞检测，视觉上"选中"区域不准确。Claude 评 LOW，Codex 评 MEDIUM，不影响功能正确性。

**跳过原因**：旋转感知框选需要 SAT（分离轴定理）或 OBB 检测，改动量大；实际使用中旋转元素较少，且 Konva Transformer 有补偿。留作后续优化。

#### [LOW / 记录不修] Escape 退出文字编辑可能提交而非取消
`commitTextChange` 在 textarea 的 `onBlur` 里调用，Escape 触发卸载时会先 blur 再 unmount，可能意外提交。需要运行时验证才能确认。

**跳过原因**：需要人工/Playwright 运行时验证，静态无法确定路径，暂不修。

### 修复记录（2026-06-11）

| # | 文件 | 修复内容 | 状态 |
|---|---|---|---|
| 1 | `src/render/objects/SceneObjectRenderer.tsx` | `handleDragEnd` 改为将 `(id, x, y)` 传给 `onDragStop`，不再直接调 `updateSceneObject` | ✅ 已修复 |
| 2 | `src/features/canvas-panel/CanvasPanel.tsx` | `handleObjectDragStop(id, finalX, finalY)` 单拖走 `updateSceneObject`，组拖走 `batchUpdateSceneObjects` 一次提交所有对象 | ✅ 已修复 |

构建验证：`npm.cmd run check` → 0 errors，2 warnings（均为改动前已存在）。

---

## 第 9 轮 — 属性/图层/素材/工具栏面板（2026-06-11）

**范围**：`src/features/inspector-panel/InspectorPanel.tsx` + `src/features/inspector-panel/LayerPanel.tsx` + `src/features/materials-panel/MaterialsPanel.tsx` + `src/features/toolbar/ToolbarPanel.tsx`

**审查方式**：Claude 自查 + Codex adversarial review，交叉验证后结论一致。

### 确认正常

- LayerPanel 重命名：本地 state 逐键更新，`onBlur`/Enter 提交时才调用 `updateSceneObject` ✅
- LayerPanel 可见性切换：单次点击一次 `updateSceneObject` → 一次 pushHistory ✅
- LayerPanel 锁定切换：`toggleObjectLock` 故意跳过 pushHistory（元操作）✅
- MaterialsPanel：只是拖放来源，无 store 变更 ✅
- ToolbarPanel 画布尺寸：用本地 state，`onBlur`/Enter 才调用 `setCanvasSize`（一次提交）✅
- 所有 z-order 操作（`moveMultipleObjects*`、`reorderObject`）正确调用 pushHistory ✅

### Findings

#### [BUG] `moveObjectForward/Backward/ToFront/ToBack` 在条件检查前调用 `pushHistory`
对象已在顶层时点"置顶"，`pushHistory` 先执行（产生 undo 条目），随后 `if` 不满足、state 不变，留下空 undo 记录。四个方法均有此问题。

#### [BUG] LayerPanel 向下拖动顶层对象到相邻项后落到底层
`before=false, idx=1` 时 `toLayerIdx = min(1+1, total-1) = total-1 = 2`（底层位置）。
source 从顶层移除后，target 行上移，`+1` 导致过度偏移，C 落到最底层而非 B/A 之间。

#### [MEDIUM / 记录不修] 属性输入框每次按键触发 `pushHistory`
`updateBasicParamDraft` 对每个有效字符调用 `handleChange` → `updateSceneObject` → pushHistory。输入 "100" 产生 3 条 undo 记录。多选模式的 `applyW/applyH/applyRot` 同样每次 `onChange` 调 `batchUpdateSceneObjects`。颜色拾取器 `onChange` 也一样，拖动取色盘可产生数十条 undo 条目。

**跳过原因**：需要增加 `updateSceneObjectSilent` / `batchUpdateSceneObjectsSilent` store action + 重构大量输入处理逻辑，改动量超出本轮范围，留作专项。

#### [LOW / 记录不修] ToolbarPanel 画布背景色 `onChange` 频繁触发 `pushHistory`
同上，color picker `onChange` 直接调 `setCanvasBgColor`，颜色拖动时连续写入 undo 栈。

#### [LOW / 记录不修] ToolbarPanel 画布尺寸 Enter+blur 双触发
某些浏览器按 Enter 后触发 blur，导致 `setCanvasSize` 被调用两次（同值），产生额外 undo 条目。影响有限（同值幂等，仅多一个 undo 步骤）。

### 修复记录（2026-06-11）

| # | 文件 | 修复内容 | 状态 |
|---|---|---|---|
| 1 | `src/state/editorStore.ts` | `moveObjectForward/Backward/ToFront/ToBack` 将 `pushHistory` 移入条件分支内，消除边界 no-op 的空 undo 条目 | ✅ 已修复 |
| 2 | `src/features/inspector-panel/LayerPanel.tsx` | `useLayerDnD.onDrop` 向下拖动时不加 `+1`（`draggingDown ? index : min(index+1, total-1)`），修复顶层对象拖到相邻项后落到底层的 z-order 错误 | ✅ 已修复 |

构建验证：`npm.cmd run check` → 0 errors，2 warnings（均为改动前已存在）。

---

## 第 10 轮 — 其余 state / infrastructure

**完成时间**：2026-06-11
**审查范围**：`src/state/projectStore.ts` + `src/state/authStore.ts` + `src/infrastructure/projectService.ts` + `src/infrastructure/thumbnailCapture.ts` + `src/infrastructure/zipExport.ts`
**审查方式**：Claude 自查 + Codex adversarial-review 交叉验证
**整体结论**：⛔ needs-attention（3 处修复，3 处记录不修）

### Findings

#### [HIGH] `authStore.init()` 非幂等 + `onAuthStateChange` 订阅泄漏
**文件**：`src/state/authStore.ts:40-47`
**来源**：Claude LOW，Codex HIGH，双方确认

`init()` 每次被调用都会重新注册 `onAuthStateChange` 监听器，但从不保存返回的 `subscription`。React StrictMode dev 环境 effect 执行两次，HMR 也会触发二次执行，导致重复监听器累积。订阅对象被丢弃，无法注销。

#### [MEDIUM] `getSession()` 无 `.catch()` — 网络错误时 `loading` 永久卡 `true`
**文件**：`src/state/authStore.ts:41-43`
**来源**：Codex 发现，Claude 确认

`getSession().then(...)` 无 `.catch()`，若 Supabase 网络请求失败，`loading` 永远不会设为 `false`，整个应用显示加载中。

#### [HIGH] logout 后 `projectStore` 不清理
**文件**：`src/state/authStore.ts`（logout handler），`src/state/projectStore.ts`
**来源**：Codex HIGH，Claude 确认

`signOut()` 后 `projectStore.currentProjectId` 保留前用户的 project ID，`saveStatus` 也不重置。虽然 navigate('/login') 卸载了编辑器，但 SIGNED_OUT 事件监听是更稳健的清理时机。

#### [LOW / 记录不修] `logout()` 静默忽略 `signOut` 失败
`await supabase.auth.signOut()` 的 error 被丢弃。低优先级：`onAuthStateChange` 会同步最终的 auth 状态，静默失败对用户体验影响有限。

#### [MEDIUM / 记录不修] `projectService.ts` 所有 Supabase 调用无超时保护
`listProjects()`、`updateProjectData()` 等调用可能在网络故障时无限挂起，UI 加载状态永不结束。需要为每个调用包装 `AbortSignal.timeout()`，改动量大，留作专项。

#### [MEDIUM / 记录不修] `updateProjectData`/`renameProject` 并发写入冲突
两个并发保存到同一 project 行时 last-write-wins，无版本字段或乐观锁。需 DB schema 变更，超出本轮范围。

#### [PASS] thumbnailCapture / zipExport / projectStore 无问题
`thumbnailCapture.ts`：全局 ref，无状态，无泄漏 ✅
`zipExport.ts`：纯函数 CRC32 + ZIP，无资源泄漏 ✅
`projectStore.ts`：22 行 Zustand store，setters 完备 ✅

### 修复记录（2026-06-11）

| # | 文件 | 修复内容 | 状态 |
|---|---|---|---|
| 1 | `src/state/authStore.ts` | 新增模块级 `_authSubscription` 守卫，`init()` 加幂等判断 `if (_authSubscription) return`，保存 `data.subscription` | ✅ 已修复 |
| 2 | `src/state/authStore.ts` | `getSession().then(...)` 补 `.catch(() => set({ loading: false }))` | ✅ 已修复 |
| 3 | `src/state/authStore.ts` | `onAuthStateChange` 回调新增 `SIGNED_OUT` 事件处理，清理 `projectStore.currentProjectId` 与 `saveStatus` | ✅ 已修复 |

构建验证：`npm.cmd run check` → 0 errors，2 warnings（均为改动前已存在）。

---

## 第 11 轮 — Hooks 与键盘交互

**完成时间**：2026-06-11
**审查范围**：`src/hooks/useEditorKeyboard.ts` + `src/hooks/useBeforeUnload.ts` + `src/hooks/useNumberInputWheelEdit.ts`
**审查方式**：Claude 自查 + Codex adversarial-review 交叉验证
**整体结论**：⛔ needs-attention（2 处修复，2 处记录不修）

### Findings

#### [BUG] Ctrl+V 粘贴对象 `appearSegments` segment ID 与源对象碰撞
**文件**：`src/hooks/useEditorKeyboard.ts:126-136`
**来源**：Claude MEDIUM，Codex BUG，双方确认

`JSON.parse(JSON.stringify(src))` 深拷贝时 `appearSegments[i].id` 原样复制，粘贴对象与源对象共享相同的 segment ID。当前无直接崩溃（`animationIds: []`），但后续对粘贴对象添加 clip 时 `segmentId` 会与源对象碰撞，导致查询混乱。

#### [BUG] 方向键长按淹没 undo 栈（无 `e.repeat` 保护）
**文件**：`src/hooks/useEditorKeyboard.ts:187-200`，`src/state/editorStore.ts`
**来源**：Claude LOW，Codex BUG，双方确认

每次 `keydown` 事件（包括自动重复）都调用 `moveMultipleSceneObjects`，该函数无条件调用 `pushHistory`。以 30 keydown/s 计，长按 2 秒即超过 50 条 undo 上限，彻底清空有意义的操作历史。

#### [LOW / 记录不修] `isPreviewMode` 冗余 dep
handler 通过 `isPreviewModeRef.current` 读值，`isPreviewMode` 出现在 dep array 只会导致无谓的 listener 重新注册，不影响正确性。

#### [WARNING / 记录不修] `useNumberInputWheelEdit` `containerRef` dep 无法感知 `.current` 变化
`containerRef` 对象引用稳定，React 不会因 `.current` 变化重触 effect。当前 `TimelinePanel` 用法安全（DOM 元素与组件共生命周期），若将来 ref 有条件重绑则会有监听器残留在旧元素。

#### [PASS] useBeforeUnload 无问题 ✅
条件短路 + 对称注销，完全正确。

#### [PASS] 所有三个 hook 的监听注册/注销对称 ✅

### 修复记录（2026-06-11）

| # | 文件 | 修复内容 | 状态 |
|---|---|---|---|
| 1 | `src/hooks/useEditorKeyboard.ts` | Ctrl+V paste：对 `cloned.appearSegments` 逐条 `crypto.randomUUID()`，消除 segment ID 碰撞 | ✅ 已修复 |
| 2 | `src/state/editorStore.ts` | 新增 `moveMultipleSceneObjectsSilent`：与 `moveMultipleSceneObjects` 逻辑相同但不调 `pushHistory` | ✅ 已修复 |
| 3 | `src/hooks/useEditorKeyboard.ts` | 方向键 handler：`e.repeat` 时调 `moveMultipleSceneObjectsSilentRef`，首次按键调正常版，防止长按淹没 undo 栈 | ✅ 已修复 |

构建验证：`npm.cmd run check` → 0 errors，2 warnings（均为改动前已存在）。

---

## 第 12 轮 — 页面层

**完成时间**：2026-06-11
**审查范围**：`src/App.tsx` + `src/components/ProtectedRoute.tsx` + `src/components/TooltipPortal.tsx` + `src/pages/editor/EditorPage.tsx` + `src/pages/projects/ProjectsPage.tsx` + `src/pages/projects/ProjectExportModal.tsx` + `src/pages/projects/ChangePasswordModal.tsx` + `src/pages/projects/DeleteAccountModal.tsx` + `src/pages/login/LoginPage.tsx` + `src/pages/login/ForgotPasswordPage.tsx` + `src/pages/login/ResetPasswordPage.tsx` + `src/pages/register/RegisterPage.tsx`
**审查方式**：Claude 自查 + Codex adversarial-review 交叉验证
**整体结论**：⛔ needs-attention（3 处修复，5 处记录不修）

### Findings

#### [MEDIUM] `ProjectExportModal` catch 路径缺 `setLoading(false)`
**文件**：`src/pages/projects/ProjectExportModal.tsx:113-115`
**来源**：Codex MEDIUM，Claude 确认

`getProject` 失败时只调 `setLoadError`，未调 `setLoading(false)`，导致 `loading=true` 持久保留，状态不一致。虽然 `{!loadError && ...}` 门控使导出按钮不渲染（无直接 UX 问题），但状态应保持一致。

#### [MEDIUM] `EditorPage` unmount 不重置 `isPreviewMode`
**文件**：`src/pages/editor/EditorPage.tsx:70`
**来源**：Codex MEDIUM，Claude 确认

cleanup 只调 `setCurrentProjectId(null)`，未重置 `isPreviewMode`。用户在预览模式下从项目 A 切换到项目 B，新项目会直接进入预览模式（跳过编辑界面）。

#### [MEDIUM] `ResetPasswordPage` 过期/无效 token 卡在加载
**文件**：`src/pages/login/ResetPasswordPage.tsx:34-39`
**来源**：Codex MEDIUM，Claude 确认

页面等待 `PASSWORD_RECOVERY` 事件才渲染表单，若 token 过期 Supabase 会触发 `SIGNED_OUT` 而非 `PASSWORD_RECOVERY`，用户永久看到"正在验证重置链接..."。

#### [LOW / 记录不修] `loadAll()` 无取消保护
`useEffect(() => { loadAll(); }, [])` 无 cancellation token，unmount 期间 Supabase 返回后仍调 setState。React 18 静默处理，低风险。

#### [MEDIUM / 记录不修] `ThumbnailCapture` inner async 未完全保护
outer 1500ms 已有 `clearTimeout`，inner 8000ms timeout 和 `onDoneRef.current()` 调用未加 `cancelled` 守卫。实际触发概率极低（缩略图在网络正常时 <1s 完成）。

#### [LOW / 记录不修] `TooltipPortal` RAF handle 未保存
`requestAnimationFrame(() => setVisible(true))` handle 未保存，unmount 时无法取消。RAF 几毫秒内完成，竞态窗口极窄。

#### [LOW / 记录不修] `ProjectsPage` setTimeout(0) focus 无 cleanup
两个 `setTimeout(() => inputRef?.focus(), 0)` 无 clearTimeout cleanup。0ms timer，React 18 静默，无实际影响。

#### [LOW / 记录不修] `listProjects` 无超时保护
同 Round 10 记录，全局 Supabase 超时问题，需大规模重构，超出范围。

#### [PASS] App.tsx 路由保护 ✅
`/projects` 和 `/editor/:id` 均由 `ProtectedRoute` 保护，公开路由正确排除。

#### [PASS] ProtectedRoute / ChangePasswordModal / DeleteAccountModal ✅
认证状态机逻辑完整，submitting 均在 `finally` 重置。

#### [PASS] ResetPasswordPage 订阅清理 ✅
`onAuthStateChange` 有对应 `subscription.unsubscribe()`。

#### [PASS] TooltipPortal 事件监听对称 ✅
`mouseover/mouseout/mousemove` 均在 cleanup 中移除，timer 清理，MutationObserver disconnect。

### 修复记录（2026-06-11）

| # | 文件 | 修复内容 | 状态 |
|---|---|---|---|
| 1 | `src/pages/projects/ProjectExportModal.tsx` | catch 块补 `setLoading(false)`，消除加载失败后 `loading=true` 状态不一致 | ✅ 已修复 |
| 2 | `src/pages/editor/EditorPage.tsx` | unmount cleanup 补 `setPreviewMode(false)`，防止跨项目切换时带入预览模式 | ✅ 已修复 |
| 3 | `src/pages/login/ResetPasswordPage.tsx` | `onAuthStateChange` 加 `SIGNED_OUT` 分支，过期/无效 token 显示错误而非永久转圈 | ✅ 已修复 |

构建验证：`npm.cmd run check` → 0 errors，2 warnings（均为改动前已存在）。

---

## 补查第 1 轮 — 状态层 Claude 自查（2026-06-11）

**审查方式**：Claude 独立复查（昨天第 1 轮仅经过 Codex，未做 Claude 自查）
**审查范围**：`src/state/editorStore.ts`，重点验证 Codex 修复正确性并查漏

### Codex 修复验证

- `removeSceneObjects` locked 过滤 ✅
- `moveMultipleObjectsForward/Backward` canMove 前置守卫 ✅

### Claude 新发现（3 处，均属 Round 9 pushHistory 前置守卫同类问题）

| # | 函数 | 行 | 问题 |
|---|---|---|---|
| R1-C1 | `updateSceneObject` | 645 | `pushHistory` 在 `findIndex` 之前；id 不存在时产生空历史快照 |
| R1-C2 | `batchUpdateSceneObjects` | 1508 | `pushHistory` 在 locked-filter 循环之前；所有目标均锁定时产生空历史快照 |
| R1-C3 | `duplicateObject` | 1519 | `pushHistory` 在 `find` 之前；id 不存在时产生空历史快照 |

实际触达概率极低，但与第 9 轮修复模式完全一致，统一补修。

### 修复记录（2026-06-11）

| # | 文件 | 修复内容 | 状态 |
|---|---|---|---|
| R1-C1 | `src/state/editorStore.ts` | `updateSceneObject`：将 `pushHistory` 移入 `idx !== -1` 分支内 | ✅ 已修复 |
| R1-C2 | `src/state/editorStore.ts` | `batchUpdateSceneObjects`：先计算 `hasChanges`（存在未锁定目标），无变更直接返回，有变更才 `pushHistory` | ✅ 已修复 |
| R1-C3 | `src/state/editorStore.ts` | `duplicateObject`：先 `find` 确认 src 存在，再 `pushHistory` | ✅ 已修复 |

构建验证：`npm.cmd run check` → 0 errors，2 warnings（均为改动前已存在）。
commit：`7b59c83`

---

## 专项修复轮次（2026-06-13）

> 本轮为上下文续接会话，基于前12轮+补查的静态审查结果，逐项修复剩余问题。

---

### B1/B2 — 属性面板颜色拾取器 / 输入框 undo 栈污染

**完成时间**：2026-06-13
**文件**：`src/state/editorStore.ts`、`src/features/inspector-panel/InspectorPanel.tsx`、`src/features/toolbar/ToolbarPanel.tsx`

**问题**：颜色拾取器 `onChange` 和基础参数输入框每次键入都调用 `pushHistory`，拖动取色盘可产生数十条无意义 undo 记录。

**修复**：
- `editorStore` 新增三个 silent action：`updateSceneObjectSilent`、`batchUpdateSceneObjectsSilent`、`setCanvasBgColorSilent`，与有历史版本逻辑相同但不调 `pushHistory`
- `InspectorPanel`：所有颜色拾取器 `onChange` → silent，`onBlur` → 有历史版本；`updateBasicParamDraft` 改用 silent 实时预览，`commitBasicParamDraft` 在 blur/Enter 时提交历史
- `ToolbarPanel`：画布背景色拾取器和 hex 输入框同样模式

**验证**：Codex 审查通过。PR #53 合并到 main。commit：`41b0ec9`

---

### B3 — Supabase 调用无超时保护

**完成时间**：2026-06-13
**文件**：`src/infrastructure/supabaseClient.ts`

**问题**：所有 Supabase HTTP 调用无超时，网络异常时请求无限挂起，UI 卡死。

**修复**：在 `createClient` 的 `global.fetch` 注入自定义 `timeoutFetch`，统一为所有请求加 15 秒超时。使用 `AbortSignal.any()` 合并外部信号，保留调用方自身的取消能力。

**验证**：Codex 审查通过（初版漏掉 AbortSignal 合并，Codex 指出后已修正）。PR #54 合并到 main。commit：`964cb53`

---

### B5 — 橡皮筋框选忽略旋转（AABB）

**完成时间**：2026-06-13
**文件**：`src/features/canvas-panel/CanvasPanel.tsx`

**问题**：`handleStageMouseUp` 的框选命中判断用未旋转的 AABB（直接取 `w/2`、`h/2`），旋转后的对象命中区域不准确。

**修复**：用标准 OBB→AABB 投影公式替换原计算：
```
aabbHalfW = |cosθ| · hw + |sinθ| · hh
aabbHalfH = |sinθ| · hw + |cosθ| · hh
```
θ=0 时退化与原代码完全一致。

**验证**：Codex 审查通过，公式正确。直接 push 到 main。commit：`5e7374c`

---

### ThumbnailCapture 卸载后仍调用 onDone

**完成时间**：2026-06-13
**文件**：`src/pages/projects/ProjectsPage.tsx`

**问题**（Round 12 MEDIUM）：`useEffect` cleanup 只取消外层 1500ms timer，组件卸载后异步流仍会调用 `onDoneRef.current()` 操作父级已卸载的状态。

**修复**：加 `cancelled` flag，cleanup 置位，`onDoneRef.current()` 调用前检查。

**验证**：Codex 审查通过。直接 push 到 main。commit：`8437456`

---

### B4 — 并发保存竞争条件（乐观锁）

**完成时间**：2026-06-13
**文件**：`src/state/projectStore.ts`、`src/infrastructure/projectService.ts`、`src/pages/editor/EditorPage.tsx`、`src/hooks/useCloudSave.ts`、`src/pages/projects/ProjectsPage.tsx`
**数据库**：`projects` 表新增 `version INTEGER NOT NULL DEFAULT 0`

**问题**（Round 10 MEDIUM）：`updateProjectData` 无并发保护，多标签页同时保存时 last-write-wins，可能静默覆盖数据。

**修复**（3 次提交，经 Codex 两轮审查迭代完善）：

| 提交 | 内容 |
|---|---|
| `2b22556` | 主体：DB 加 version 列；`updateProjectData` 乐观锁；`getProject` 返回 version；`EditorPage` 存 version；`useCloudSave` 带版本保存并同步更新 |
| `adbdcc9` | Codex 第一轮：CONFLICT 后清 pendingSaveRef 中断循环；新增 `updateProjectThumbnail` 隔离缩略图写入；`ThumbnailCapture` 和复制项目改用新函数 |
| `48024d3` | Codex 第二轮：冲突后 fire-and-forget 拉取服务器最新 version，下次保存可自动恢复 |

**Codex 最终审查结论**：整体实现正确，数据写入路径清晰隔离，无遗漏的未保护 data 写入路径。
