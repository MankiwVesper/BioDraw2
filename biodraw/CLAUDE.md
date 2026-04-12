# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start dev server (Vite HMR)
npm run build     # Type-check + production build (tsc -b && vite build)
npm run lint      # Run ESLint
npm run preview   # Preview production build
```

There is no test runner configured in this project.

## Project Overview

**BioDraw** is a biology diagram animation editor built with React + TypeScript + Vite. The main product flow is:

**素材（Materials）→ 画布（Canvas）→ 动画（Animation）→ 预览（Preview）→ 导出（Export）**

The editor renders using **Konva / react-konva** on a single-page layout with five panels.

## Architecture Layers

The codebase is structured into five conceptual layers with strict dependency rules:

```
app / pages / features
        ↓
      state
        ↓
     domain (types + pure logic)
        ↓
 infrastructure

render depends on both domain and state
```

**Critical constraint:** `domain` must not import React, Konva, or DOM. `render` bridges domain data to Konva nodes.

### Key Directories

- **`src/types/index.ts`** — All core domain types in one file: `SceneObject`, `AnimationClip` (and subtypes), `MotionPath`, `MaterialItem`, `SceneDocument`, `ProjectDocument`
- **`src/state/editorStore.ts`** — Single Zustand+Immer store. Holds all objects, animations, playback state, export state, undo/redo history (max 50 snapshots). Every mutation that should be undoable calls `pushHistory()` first.
- **`src/animation/engine.ts`** — Pure animation engine. `buildAnimatedPreviewObjects()` takes objects + clips + currentTimeMs and returns computed object states. No React/Konva dependencies.
- **`src/render/objects/SceneObjectRenderer.tsx`** — Maps `SceneObject` to Konva nodes. Handles all object types: `material`, `rect`, `circle`, `line`, `arrow`, `text`, `triangle`, `trapezoid`, `curve`.
- **`src/pages/editor/EditorPage.tsx`** — Top-level layout assembling all five panels.

### Panel Structure (`src/features/`)

| Panel | Role |
|---|---|
| `toolbar/` | Top bar: save, export, playback controls |
| `materials-panel/` | Left: SVG material library, drag-to-canvas |
| `canvas-panel/` | Center: Konva Stage, animation export logic |
| `inspector-panel/` | Right: position/size/rotation/style properties |
| `timeline-panel/` | Bottom: animation clips, easing editor, keyframes |

## Data Model Key Points

- **`SceneObject.data`** is an open `Record<string, unknown>` used for type-specific data (e.g., `url` for materials, `points` for curves, label offset positions).
- **`SceneObject.animationIds`** keeps a denormalized list of clip IDs on each object — always sync this when adding/removing clips.
- Animation clips use `startTimeMs` + `durationMs` and carry a typed `payload`. Clip types: `move`, `moveAlongPath`, `shake`, `fade`, `scale`, `rotate`, `stateChange`.
- The store's `objects` array order determines z-order (last = front). Layer operations swap array positions.

## Coding Conventions

- New feature implementation order: **types → domain pure logic → state → render → feature UI → styles**
- React components stay thin — business rules belong in `domain` or pure functions, not inside components.
- Avoid embedding pathData algorithms or animation math directly in React components.
- Variable names should reflect domain meaning: `selectedObjectIds`, `currentTimeMs`, `materialCatalog` — not generic names like `data`, `item`, `temp`.
- The `.agents/skills/` directory contains detailed design documents (architecture, data model, animation engine, export design, coding constraints). Consult them when implementing major features.
