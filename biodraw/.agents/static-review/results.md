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
