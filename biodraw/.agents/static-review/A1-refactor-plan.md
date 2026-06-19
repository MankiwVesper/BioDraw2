# A1 重构方案 — 抽取纯逻辑出 UI/Store（第二大轮静态审查）

> 状态：**Phase 1-3 已全部执行完成**（每阶段独立提交、过 npm run check、Codex 复核 PASS）。Phase 4 几何按计划本轮未做。
> 核验闭环：① Codex 初审（6 点修正已采纳）→ ② Opus 4.8 二次逐行核对（4 条精度点已并入）→ ③ Codex 终审【可开工】。
> 归属：第二大轮静态审查的 A1 项。配套：同目录 `plan.md` / `results.md`（第一大轮）。

---

## 目的

CLAUDE.md 规定纯业务逻辑不应依赖 React/Konva/DOM，"不要把动画数学/pathData 算法直接嵌进 React 组件"。现状违反点：

- 动画片段构造逻辑写在 UI 组件 `TimelinePanel.tsx`（`createClip` + 预设模板 `createPresetTemplate`）。
- 冲突域映射在 store 与 UI 各写一份（`editorStore.getApplyConflictDomain` 与 `TimelinePanel.getConflictDomain` 语义等价）。
- 缓动/贝塞尔纯数学散在 `TimelinePanel` 顶部。

**A1 的目的**：把这些纯逻辑从组件/store 抽到独立纯模块，让代码符合既定架构。

### 历史背景
曾存在 `src/domain/clipFactory.ts`，因未被接入成死代码，在第一大轮"静态审查第5轮"（commit `deba6e1`）被删除，空目录残留、CLAUDE.md 描述脱节（已在第二大轮 C1 `db73cd6` 修正文档并删空目录）。

---

## 已拍板的决定

1. **范围**：只做 **Phase 1-3**（不做 Phase 4 几何——见末尾）。
2. **模块位置**：纯模块统一放 **`src/animation/`**（与既有 `engine.ts`、`easing.ts` 同层），**不重建 `src/domain/`**，避免两个纯逻辑落点。
3. **核心原则**：只搬**纯函数**（输入→输出，不碰 React/Konva/DOM/store）；组件保留编排逻辑，改为调用纯函数。
4. **执行纪律**：三阶段**各自独立分支 → `npm run check` → Codex 复核 → ff-merge 到 main**，互不耦合，任一阶段可单独停下；每行 diff 可追溯。
5. **顺序**：P1 → P2 → P3（三者无相互依赖，先做价值最高的工厂）。

---

## Codex 评审结论与采纳的修正

总评：**方向正确，但 Phase 1 的"纯函数"定义需收紧**。已采纳 6 点：

1. `buildClip` **不得内部调用 `crypto.randomUUID()`**——id 由入参注入，否则不算纯函数。
2. stateChange 分支**不得读闭包 `selectedObject.stateVariants`**——改为传入 `stateKeys: string[]`。
3. 拆分边界更正：构造区是 `base`(约 1312-1317) + **完整 switch**(约 1319-1346)；原"1324-1351"会漏掉 move 分支又误含副作用行(1347-1350)。
4. `getConflictDomain` 与 store 版是**语义等价**（非逐字，格式不同），可安全合并。
5. easing 隐藏依赖：`parseEasingControlPoints` 还用 `findPresetByValue` + `EASING_PRESET_OPTIONS`，迁移时要**把纯的预设点位常量与 UI label 拆开**，`easing.ts` 不承担 UI 文案。
6. 确认放 `src/animation/` 无循环依赖（工厂/冲突域只 import `../types` 和 `./easing`，store+UI 单向 import 无环）；同意 Phase 4 本轮不做。

---

## 二次审核（Opus 4.8，逐行核对真实代码）

**总评：方案成立、可执行，无阻断性问题。** 精度补强已并入各阶段（见 P1 的"必守精度点"）。

已验证的隔离假设：
- Phase 2 待迁的 easing UI 辅助函数（`parseEasingControlPoints`/`getEasingPreviewPath`/`buildBezierEasingValue`/`evalBezierPoint`/`findCurveT`/`getBezierSvgYBounds` 等）**无 TimelinePanel 以外的引用**，模块内私有，可安全搬。
- Phase 3 `getApplyConflictDomain` 仅 `editorStore.ts:345` 一处定义、`386`/`391` 两处调用；与 UI 版 `getConflictDomain`（TimelinePanel 内 5 处调用）**语义一致**，可安全合并为一份。`sortConflictDomains`/`CONFLICT_DOMAIN_ORDER` 仅 UI 用，`getConflictDomainLabel`（中文文案）留 UI。

**ROI 提醒（诚实评估）**：项目**无测试框架**（CLAUDE.md），"纯函数好测试"收益当前无法兑现；A1 的真实收益只剩架构合规 + 一处真去重（P3 conflictDomain）+ 组件变薄。A1 是第二大轮里**唯一不修复任何 bug** 的项，纯整洁度。做它合理（看重架构一致性）；到 C1 为止打住也站得住（文档已不再误导）。信息密度：P3 > P1 > P2。

---

## Phase 1 — 动画片段工厂

**新建 `src/animation/clipFactory.ts`**，导出两个纯函数：

- `buildClip({ type, src, objectId, segmentId, timing, createId, stateKeys? }) → AnimationClip`
  - 搬 `TimelinePanel.tsx` `createClip`（约 1305-1351）里的 `base` + switch 构造（约 1312-1346）。
  - id（调一次 `createId()`）、stateKeys、objectId、segmentId 全部由入参注入（不读组件闭包、不调 randomUUID）。
- `buildPresetClips({ template, src, startTimeMs, createId }) → AnimationClip[]`
  - 搬 `createPresetTemplate`（约 1354 起）里的模板 clip 数组（约 1361-1397）。
  - id 由 `createId: () => string` 工厂注入；用 `src.id`/`startTimeMs` 替代闭包 `selectedObject.id`/`currentTimeMs`。

**P1 必守的精度点（二次审核逐行核对，易漏）**：
1. **stateChange 强制 `durationMs: 1`**（真实代码 1341-1344）：不用 `timing.durationMs`，覆盖为 1，且 `steps[0].atMs = timing.startTimeMs`。工厂 stateChange 分支必须复刻此覆盖。
2. **预设片段"先裸构造、后夹取/赋段"结构不能动**：`buildPresetClips` 输出**未夹取、无 segmentId**的片段（`startTimeMs = startTimeMs` 入参）；clamp + segmentId 留在组件（现 1400-1403）。不要把 clamp 搬进工厂。
3. **判别联合每个分支保留 `type` 字面量重设**（`{ ...base, type: 'move', payload }`）——靠它让 TS 收窄到联合成员，漏掉会类型不过。
4. **id 注入契约统一为 `createId`**（buildClip 与 buildPresetClips 一致）。`clamp01` 已在 `easing.ts`，`clipFactory → easing`（easing 无 import）不成环。

**组件（TimelinePanel）保留的编排**：`ensurePausedForEdit`、`resolveSegmentForNewClip`(1281)、`clampClipTimingToSegment`(1293)、`addAnimationClip`、`syncDurationIfNeeded`、flash/expand；在调用工厂前生成 id 与 stateKeys 并传入。

**验证**：build 通过 + Codex 比对各类型默认 payload/easing/duration 与改前逐字一致。
**风险**：中低（必须保留所有分支与默认值；注意 `src` 用于 payload 几何、`objectId` 用于绑定，二者 id 实际相同但显式传 `objectId` 更稳）。

---

## Phase 2 — 缓动/贝塞尔数学并入 `src/animation/easing.ts`

**搬入**（均为纯数学/字符串处理）：`parseEasingControlPoints`(79)、`formatBezierValue`(90)、`buildBezierEasingValue`(95)、`getEasingPreviewPath`(102)、`clampBezierY`(18)、`getBezierSvgYBounds`(111)、`evalBezierPoint`(134)、`findCurveT`(145)。

**拆分处理**：`EASING_PRESET_OPTIONS`(23) 含 `{value, label, points}`——把纯的"预设点位常量"进 `easing.ts`，"UI label 下拉选项"留 `TimelinePanel`；`parseEasingControlPoints` 依赖的 `findPresetByValue` 改用纯点位常量。

**留在组件**：`clientToSvgPoint`(126)（碰 SVG DOM）。

**验证**：build + 缓动曲线编辑器交互正常。
**风险**：低（机械搬移）。

---

## Phase 3 — 冲突域去重

**新建 `src/animation/conflictDomain.ts`**，搬纯逻辑：`getConflictDomain`(243)、`CONFLICT_DOMAIN_ORDER`(21)、`sortConflictDomains`(265)。`editorStore.ts` 的 `getApplyConflictDomain`(约 345) 改为指向同一份。

**留在组件**：`getConflictDomainLabel`(254)（返回中文 UI 文案，store 不需要，不污染纯模块）。

**验证**：build + 套用动画的冲突判定行为不变。
**风险**：低。

---

## Phase 4 — 几何数学（本轮不做）

`editorStore` 的 `getElementBounds`/`getLineLocalCenter` 与 `SceneObjectRenderer` 的 `getPointsBounds`/`getCurveNameLabelPosition`/箭头头部几何/`clampNamePosition`。与 React/Konva 深度交织（曲线草稿状态、控制点拖拽、端点拖拽与 store 更新紧耦合），属 CLAUDE.md 高风险清单，**必须 Playwright 视觉/交互回归**。Codex 与我一致判断：风险显著高于 P1-3，本轮暂缓。

---

## 状态跟踪

| 阶段 | 状态 | 提交 |
|---|---|---|
| P1 片段工厂 | ✅ 已完成（Codex 复核 PASS） | 见本提交 |
| P2 缓动数学 | ✅ 已完成（Codex 复核 PASS） | 见本提交 |
| P3 冲突域去重 | ✅ 已完成（Codex 复核 PASS） | 见本提交 |
| P4 几何（可选） | ⏭️ 本轮不做 | — |
