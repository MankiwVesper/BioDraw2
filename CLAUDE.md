# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Layout

The actual application source lives in the `biodraw/` subdirectory. All development work happens there; this root directory is the git workspace. Key root-level items:

- `biodraw/` — React/TypeScript/Vite application (all `npm` commands run here)
- `AGENTS.md` — authoritative Windows/PowerShell, Chinese encoding, Git, and browser verification constraints — read before doing anything
- `.codex/` — Playwright verification scripts, Chrome profiles, npm cache; not committed

## Commands

Run from `D:\Project\BioDraw2\biodraw\`:

```powershell
npm.cmd run dev      # Vite dev server with HMR → http://localhost:5173/
npm.cmd run build    # tsc -b && vite build
npm.cmd run lint     # ESLint
npm.cmd run check    # lint + build (run before every commit)
npm.cmd run preview  # Serve production build locally
```

No test framework is configured. `npm.cmd run check` is the pre-commit gate.

If PowerShell execution policy blocks `npm`, use `npm.cmd` explicitly.

## Architecture

**BioDraw** is a browser-based biology diagram/animation editor (面向高中生物老师的动画示意图编辑器).

User flow: **Materials → Canvas → Animation → Preview → Export**

### Layer dependency rules

```
pages / features
      ↓
    state          (src/state/editorStore.ts)
      ↓
   domain          (src/types, src/domain — pure, no React/Konva/DOM)
      ↓
infrastructure     (src/infrastructure — serializer, video encoder)

render             (src/render — bridges domain↔Konva; depends on both domain and state)
```

`domain` must never import React, Konva, or anything DOM. `render` is the only place that knows about Konva nodes.

### Key files that require multi-file understanding

**`src/types/index.ts`** — All domain types in one file. Key types:
- `SceneObject` — canvas element; `data: Record<string, unknown>` holds type-specific fields (`points: number[]` flat array for line/arrow/curve, `url` for material)
- `AppearSegment` — time window during which an object is visible; `SceneObject.appearSegments[]` (multi-segment) takes priority over legacy `appearStartMs/appearEndMs`
- `AnimationClip` — discriminated union of 8 subtypes: `move`, `moveAlongPath`, `polylineMove`, `shake`, `fade`, `scale`, `rotate`, `stateChange`; each carries `startTimeMs`, `durationMs`, and a typed `payload`
- `MotionPath` — bezier/polyline path used by `moveAlongPath` clips
- `MaterialItem` — SVG material library entry with style/animation capabilities
- `SceneDocument` / `ProjectDocument` — serialized file format (top-level saved structure)

**`src/state/editorStore.ts`** — Single Zustand+Immer store for the entire editor. Rules:
- Every mutation that should be undoable calls `pushHistory(state)` first (max 50 snapshots)
- `toggleObjectLock` intentionally skips `pushHistory` — lock/unlock is a meta-operation
- `SceneObject.animationIds` is a denormalized index of clip IDs; always keep it in sync when clips are added/removed
- `objects` array order = z-order (last = frontmost); layer operations swap array positions
- In dev, `window.__store` exposes the store for debugging

**`src/animation/engine.ts`** — Pure animation engine; no React/Konva. `buildAnimatedPreviewObjects(objects, animations, currentTimeMs)` returns computed object states for the given timestamp. At `t=0` it returns objects unchanged (edit-mode default) unless `evaluateAtZero: true` is passed.

**`src/pages/editor/EditorPage.tsx`** — Top-level layout that assembles all five panels.

**`src/render/objects/SceneObjectRenderer.tsx`** — The only component that maps `SceneObject` types to Konva nodes.

**`src/infrastructure/documentSerializer.ts`** — Save/load `.biodraw` files (JSON), localStorage autosave. File format version is `FILE_VERSION = 1`.

**`src/domain/clipFactory.ts`** — Pure factory for creating default `AnimationClip` instances per type.

### Panel structure (`src/features/`)

| Panel | Files |
|---|---|
| Toolbar | `toolbar/ToolbarPanel.tsx` — save, export, playback controls |
| Materials | `materials-panel/MaterialsPanel.tsx` — SVG library, drag-to-canvas |
| Canvas | `canvas-panel/CanvasPanel.tsx` + `useVideoExport.ts` — Konva Stage, export orchestration |
| Inspector | `inspector-panel/InspectorPanel.tsx` + `LayerPanel.tsx` — properties, z-order |
| Timeline | `timeline-panel/TimelinePanel.tsx` + `KeyframeEditor.tsx` — clip tracks, easing |

### Non-obvious data invariants

- `AnimationClip.segmentId` links a clip to its `AppearSegment.id`. Legacy clips without `segmentId` are treated as unbound.
- When `applyAnimationClipsToObjects` checks for conflicts, it groups clip types into *domains*: `move/moveAlongPath/polylineMove/shake` → `position`; `fade` → `opacity`; `scale` → `scale`; `rotate` → `rotation`; `stateChange` → `state`. Two clips conflict if they share a domain within the same segment.
- `stateChange` clips are intentionally excluded from `buildAnimatedPreviewObjects` and handled separately by the renderer.
- New objects added to the store always get an initial `appearSegments` entry covering `[0, globalDurationMs]`.

## High-risk areas

Changes to these require browser regression testing (see `AGENTS.md` for Playwright/CDP setup):

- Canvas drag and multi-select (Konva Stage event handling)
- Timeline drag (clip repositioning, segment edge resize)
- Playback state machine (`play/pause/stop/advancePlayback` in the store)
- Sequence frame export and video export (in `canvas-panel/`)
- Autosave / file open / save (`useAutoSave.ts`, `documentSerializer.ts`)

## Coding conventions

- Implementation order for new features: **types → domain pure logic → state → render → feature UI → styles**
- React components stay thin — business rules belong in `domain` or pure functions, not inside components
- Do not embed pathData algorithms or animation math directly in React components
- Variable names reflect domain meaning: `selectedObjectIds`, `currentTimeMs`, `materialCatalog` — not generic names like `data`, `item`, `temp`
- Commit messages in Chinese
- Design documents in `biodraw/.agents/skills/` — consult for major feature work

---

## Working guidelines

These apply to every task regardless of scope.

### 1. Think before coding

Before implementing: state assumptions explicitly, surface conflicting interpretations instead of picking silently, push back if a simpler approach exists, stop and ask if something is genuinely unclear.

### 2. Simplicity first

Minimum code that solves the problem. No speculative features, no abstractions for single-use code, no "flexibility" that wasn't asked for, no error handling for impossible scenarios. If 200 lines could be 50, rewrite it.

### 3. Surgical changes

Touch only what the task requires. Don't improve adjacent code, comments, or formatting. Don't refactor things that aren't broken. Match existing style. If unrelated dead code is noticed, mention it — don't delete it. Remove only imports/variables/functions that *your* changes made unused. Every changed line should trace directly to the user's request.

### 4. Goal-driven execution

Transform tasks into verifiable goals before starting. For multi-step tasks, state a brief plan with a verify step for each:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
```

Clarifying questions come before implementation, not after mistakes.

### 5. Visual / layout bug protocol

**Before touching code:** Read every affected file. State the root cause in one sentence. If you cannot state it clearly, keep reading — do not guess.

**One change per round:** Make exactly one change that targets the root cause. Do not touch anything else.

**Self-verify with Playwright:** After every visual/layout edit, start the dev server if not running, use Playwright to take a screenshot, and inspect the result yourself. Only report to the user after you have confirmed the change looks correct. Never ask the user to take a screenshot for something you can verify yourself.

**Do not add anything beyond what was asked:** If the user says "just do X", do only X. No extra removals, additions, or restructuring beyond the explicit request.

### 6. Clarify before acting on ambiguous visual instructions

Visual and layout terms ("对齐", "居中", "一样宽", "对齐到某行") can mean different things. Before writing any code, ask one focused question to confirm the exact intended behavior. Example: "你说的对齐是指按钮行的左右边界与上面三行的整体边界一致，还是只与控件列对齐？" One question is enough — do not over-ask.

This rule applies whenever the instruction involves spatial layout, alignment, sizing, or visual positioning, and there are two or more plausible interpretations. When helpful, draw a concise ASCII sketch to confirm the intended layout before writing any code. Example:

```
[ 分辨率  ] [ 1280 ] [ 720 ] [ 🔒 ]
[ FPS/格式 ] [ 24▾  ] [ MP4▾] [ ↺  ]
[ 导出范围 ] [ 0.00 ] [ 8.00] [ ↺  ]
            [ 导出序列帧  ] [ 导出视频 ]
```

### 7. When user gives explicit instructions

If the user says "only change X" or "just do Y", treat every word as a hard constraint. Do not modify Z because it seemed related or because it "should be consistent". Scope creep during a fix is a bug, not a feature.
