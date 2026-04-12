import { useEffect, useRef, useState } from 'react';
import { Group, Circle, Arrow, Line, RegularPolygon, Text } from 'react-konva';
import { useEditorStore } from '../../state/editorStore';
import type Konva from 'konva';
import type { MoveClip, MoveAlongPathClip } from '../../types';

interface Props {
  stageScale: number;
}

// ── Move clip overlay ────────────────────────────────────────
function MoveOverlay({ clip, stageScale }: { clip: MoveClip; stageScale: number }) {
  const updateClip = useEditorStore((s) => s.updateAnimationClip);

  const { fromX, fromY, toX, toY } = clip.payload;
  const arrowRef = useRef<Konva.Arrow>(null);
  const r = 7 / stageScale;
  const fontSize = 11 / stageScale;
  const sw = 1.5 / stageScale;
  const pLen = 8 / stageScale;
  const pWid = 6 / stageScale;

  // Track live positions in refs so drag handlers always read current values
  const liveFrom = useRef({ x: fromX, y: fromY });
  const liveTo = useRef({ x: toX, y: toY });

  // Sync when clip payload changes (undo/redo/external update)
  useEffect(() => {
    liveFrom.current = { x: clip.payload.fromX, y: clip.payload.fromY };
    liveTo.current = { x: clip.payload.toX, y: clip.payload.toY };
  }, [clip.payload.fromX, clip.payload.fromY, clip.payload.toX, clip.payload.toY]);

  const refreshArrow = () => {
    arrowRef.current?.points([
      liveFrom.current.x, liveFrom.current.y,
      liveTo.current.x, liveTo.current.y,
    ]);
    arrowRef.current?.getLayer()?.batchDraw();
  };

  return (
    <Group>
      {/* Path arrow */}
      <Arrow
        ref={arrowRef}
        points={[fromX, fromY, toX, toY]}
        stroke="rgba(100,116,139,0.7)"
        strokeWidth={sw}
        dash={[6 / stageScale, 4 / stageScale]}
        fill="rgba(100,116,139,0.7)"
        pointerLength={pLen}
        pointerWidth={pWid}
        listening={false}
      />

      {/* Start handle (green) */}
      <Circle
        x={fromX} y={fromY} radius={r}
        fill="#10b981" stroke="#fff" strokeWidth={sw * 1.5}
        draggable
        onDragMove={(e: Konva.KonvaEventObject<DragEvent>) => {
          liveFrom.current = { x: e.target.x(), y: e.target.y() };
          refreshArrow();
        }}
        onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => {
          const nx = Math.round(e.target.x());
          const ny = Math.round(e.target.y());
          liveFrom.current = { x: nx, y: ny };
          updateClip(clip.id, {
            payload: { ...clip.payload, fromX: nx, fromY: ny },
          } as Partial<MoveClip>);
        }}
      />
      <Text
        text="起"
        x={fromX + r + 3 / stageScale}
        y={fromY - r}
        fontSize={fontSize}
        fill="#10b981"
        listening={false}
      />

      {/* End handle (blue) */}
      <Circle
        x={toX} y={toY} radius={r}
        fill="#3b82f6" stroke="#fff" strokeWidth={sw * 1.5}
        draggable
        onDragMove={(e: Konva.KonvaEventObject<DragEvent>) => {
          liveTo.current = { x: e.target.x(), y: e.target.y() };
          refreshArrow();
        }}
        onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => {
          const nx = Math.round(e.target.x());
          const ny = Math.round(e.target.y());
          liveTo.current = { x: nx, y: ny };
          updateClip(clip.id, {
            payload: { ...clip.payload, toX: nx, toY: ny },
          } as Partial<MoveClip>);
        }}
      />
      <Text
        text="终"
        x={toX + r + 3 / stageScale}
        y={toY - r}
        fontSize={fontSize}
        fill="#3b82f6"
        listening={false}
      />
    </Group>
  );
}

// ── MoveAlongPath clip overlay ───────────────────────────────
function MoveAlongPathOverlay({ clip, stageScale }: { clip: MoveAlongPathClip; stageScale: number }) {
  const updateClip = useEditorStore((s) => s.updateAnimationClip);

  const { fromX, fromY, controlX, controlY, toX, toY } = clip.payload;
  const curveRef = useRef<Konva.Line>(null);
  const arm1Ref = useRef<Konva.Line>(null);
  const arm2Ref = useRef<Konva.Line>(null);

  const r = 7 / stageScale;
  const fontSize = 11 / stageScale;
  const sw = 1.5 / stageScale;

  const liveFrom = useRef({ x: fromX, y: fromY });
  const liveControl = useRef({ x: controlX, y: controlY });
  const liveTo = useRef({ x: toX, y: toY });

  useEffect(() => {
    liveFrom.current = { x: clip.payload.fromX, y: clip.payload.fromY };
    liveControl.current = { x: clip.payload.controlX, y: clip.payload.controlY };
    liveTo.current = { x: clip.payload.toX, y: clip.payload.toY };
  }, [
    clip.payload.fromX, clip.payload.fromY,
    clip.payload.controlX, clip.payload.controlY,
    clip.payload.toX, clip.payload.toY,
  ]);

  // Convert quadratic bezier to cubic for Konva Line bezier=true
  const buildCubicPoints = (
    fx: number, fy: number,
    cx: number, cy: number,
    tx: number, ty: number,
  ) => {
    const c1x = fx + (2 / 3) * (cx - fx);
    const c1y = fy + (2 / 3) * (cy - fy);
    const c2x = tx + (2 / 3) * (cx - tx);
    const c2y = ty + (2 / 3) * (cy - ty);
    return [fx, fy, c1x, c1y, c2x, c2y, tx, ty];
  };

  const refreshShapes = () => {
    const { x: fx, y: fy } = liveFrom.current;
    const { x: cx, y: cy } = liveControl.current;
    const { x: tx, y: ty } = liveTo.current;
    curveRef.current?.points(buildCubicPoints(fx, fy, cx, cy, tx, ty));
    arm1Ref.current?.points([fx, fy, cx, cy]);
    arm2Ref.current?.points([cx, cy, tx, ty]);
    curveRef.current?.getLayer()?.batchDraw();
  };

  return (
    <Group>
      {/* Bezier curve preview */}
      <Line
        ref={curveRef}
        points={buildCubicPoints(fromX, fromY, controlX, controlY, toX, toY)}
        bezier
        stroke="rgba(100,116,139,0.7)"
        strokeWidth={sw}
        dash={[6 / stageScale, 4 / stageScale]}
        listening={false}
      />
      {/* Control arm 1: from → control */}
      <Line
        ref={arm1Ref}
        points={[fromX, fromY, controlX, controlY]}
        stroke="rgba(245,158,11,0.5)"
        strokeWidth={sw}
        dash={[4 / stageScale, 3 / stageScale]}
        listening={false}
      />
      {/* Control arm 2: control → to */}
      <Line
        ref={arm2Ref}
        points={[controlX, controlY, toX, toY]}
        stroke="rgba(245,158,11,0.5)"
        strokeWidth={sw}
        dash={[4 / stageScale, 3 / stageScale]}
        listening={false}
      />

      {/* Start handle (green circle) */}
      <Circle
        x={fromX} y={fromY} radius={r}
        fill="#10b981" stroke="#fff" strokeWidth={sw * 1.5}
        draggable
        onDragMove={(e: Konva.KonvaEventObject<DragEvent>) => {
          liveFrom.current = { x: e.target.x(), y: e.target.y() };
          refreshShapes();
        }}
        onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => {
          const nx = Math.round(e.target.x());
          const ny = Math.round(e.target.y());
          liveFrom.current = { x: nx, y: ny };
          updateClip(clip.id, {
            payload: { ...clip.payload, fromX: nx, fromY: ny },
          } as Partial<MoveAlongPathClip>);
        }}
      />
      <Text
        text="起"
        x={fromX + r + 3 / stageScale} y={fromY - r}
        fontSize={fontSize} fill="#10b981" listening={false}
      />

      {/* Control handle (orange diamond) */}
      <RegularPolygon
        x={controlX} y={controlY}
        sides={4} radius={r * 1.1}
        rotation={45}
        fill="#f59e0b" stroke="#fff" strokeWidth={sw * 1.5}
        draggable
        onDragMove={(e: Konva.KonvaEventObject<DragEvent>) => {
          liveControl.current = { x: e.target.x(), y: e.target.y() };
          refreshShapes();
        }}
        onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => {
          const nx = Math.round(e.target.x());
          const ny = Math.round(e.target.y());
          liveControl.current = { x: nx, y: ny };
          updateClip(clip.id, {
            payload: { ...clip.payload, controlX: nx, controlY: ny },
          } as Partial<MoveAlongPathClip>);
        }}
      />
      <Text
        text="控"
        x={controlX + r + 3 / stageScale} y={controlY - r}
        fontSize={fontSize} fill="#f59e0b" listening={false}
      />

      {/* End handle (blue circle) */}
      <Circle
        x={toX} y={toY} radius={r}
        fill="#3b82f6" stroke="#fff" strokeWidth={sw * 1.5}
        draggable
        onDragMove={(e: Konva.KonvaEventObject<DragEvent>) => {
          liveTo.current = { x: e.target.x(), y: e.target.y() };
          refreshShapes();
        }}
        onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => {
          const nx = Math.round(e.target.x());
          const ny = Math.round(e.target.y());
          liveTo.current = { x: nx, y: ny };
          updateClip(clip.id, {
            payload: { ...clip.payload, toX: nx, toY: ny },
          } as Partial<MoveAlongPathClip>);
        }}
      />
      <Text
        text="终"
        x={toX + r + 3 / stageScale} y={toY - r}
        fontSize={fontSize} fill="#3b82f6" listening={false}
      />
    </Group>
  );
}

// ── Main export ──────────────────────────────────────────────
export function AnimationPathOverlay({ stageScale }: Props) {
  const expandedClipId = useEditorStore((s) => s.expandedAnimationClipId);
  const animations = useEditorStore((s) => s.animations);

  if (!expandedClipId) return null;

  const clip = animations.find((a) => a.id === expandedClipId);
  if (!clip) return null;

  if (clip.type === 'move') {
    return <MoveOverlay clip={clip as MoveClip} stageScale={stageScale} />;
  }
  if (clip.type === 'moveAlongPath') {
    return <MoveAlongPathOverlay clip={clip as MoveAlongPathClip} stageScale={stageScale} />;
  }

  return null;
}
