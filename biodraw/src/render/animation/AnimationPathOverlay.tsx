import { useEffect, useRef } from 'react';
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

  const { fromX, fromY, control1X, control1Y, control2X, control2Y, toX, toY } = clip.payload;
  const curveRef = useRef<Konva.Line>(null);
  const arm1Ref = useRef<Konva.Line>(null);
  const arm2Ref = useRef<Konva.Line>(null);
  const arm3Ref = useRef<Konva.Line>(null);

  const r = 7 / stageScale;
  const fontSize = 11 / stageScale;
  const sw = 1.5 / stageScale;

  const liveFrom = useRef({ x: fromX, y: fromY });
  const liveControl1 = useRef({ x: control1X, y: control1Y });
  const liveControl2 = useRef({ x: control2X, y: control2Y });
  const liveTo = useRef({ x: toX, y: toY });

  useEffect(() => {
    liveFrom.current = { x: clip.payload.fromX, y: clip.payload.fromY };
    liveControl1.current = { x: clip.payload.control1X, y: clip.payload.control1Y };
    liveControl2.current = { x: clip.payload.control2X, y: clip.payload.control2Y };
    liveTo.current = { x: clip.payload.toX, y: clip.payload.toY };
  }, [
    clip.payload.fromX, clip.payload.fromY,
    clip.payload.control1X, clip.payload.control1Y,
    clip.payload.control2X, clip.payload.control2Y,
    clip.payload.toX, clip.payload.toY,
  ]);

  const refreshShapes = () => {
    const { x: fx, y: fy } = liveFrom.current;
    const { x: c1x, y: c1y } = liveControl1.current;
    const { x: c2x, y: c2y } = liveControl2.current;
    const { x: tx, y: ty } = liveTo.current;
    curveRef.current?.points([fx, fy, c1x, c1y, c2x, c2y, tx, ty]);
    arm1Ref.current?.points([fx, fy, c1x, c1y]);
    arm2Ref.current?.points([c1x, c1y, c2x, c2y]);
    arm3Ref.current?.points([c2x, c2y, tx, ty]);
    curveRef.current?.getLayer()?.batchDraw();
  };

  return (
    <Group>
      {/* Cubic bezier curve preview */}
      <Line
        ref={curveRef}
        points={[fromX, fromY, control1X, control1Y, control2X, control2Y, toX, toY]}
        bezier
        stroke="rgba(100,116,139,0.7)"
        strokeWidth={sw}
        dash={[6 / stageScale, 4 / stageScale]}
        listening={false}
      />
      {/* Control arm 1: from → control1 */}
      <Line
        ref={arm1Ref}
        points={[fromX, fromY, control1X, control1Y]}
        stroke="rgba(245,158,11,0.5)"
        strokeWidth={sw}
        dash={[4 / stageScale, 3 / stageScale]}
        listening={false}
      />
      {/* Control arm 2: control1 → control2 */}
      <Line
        ref={arm2Ref}
        points={[control1X, control1Y, control2X, control2Y]}
        stroke="rgba(245,158,11,0.3)"
        strokeWidth={sw}
        dash={[4 / stageScale, 3 / stageScale]}
        listening={false}
      />
      {/* Control arm 3: control2 → to */}
      <Line
        ref={arm3Ref}
        points={[control2X, control2Y, toX, toY]}
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

      {/* Control1 handle (orange diamond) */}
      <RegularPolygon
        x={control1X} y={control1Y}
        sides={4} radius={r * 1.1}
        rotation={45}
        fill="#f59e0b" stroke="#fff" strokeWidth={sw * 1.5}
        draggable
        onDragMove={(e: Konva.KonvaEventObject<DragEvent>) => {
          liveControl1.current = { x: e.target.x(), y: e.target.y() };
          refreshShapes();
        }}
        onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => {
          const nx = Math.round(e.target.x());
          const ny = Math.round(e.target.y());
          liveControl1.current = { x: nx, y: ny };
          updateClip(clip.id, {
            payload: { ...clip.payload, control1X: nx, control1Y: ny },
          } as Partial<MoveAlongPathClip>);
        }}
      />
      <Text
        text="控1"
        x={control1X + r + 3 / stageScale} y={control1Y - r}
        fontSize={fontSize} fill="#f59e0b" listening={false}
      />

      {/* Control2 handle (amber diamond) */}
      <RegularPolygon
        x={control2X} y={control2Y}
        sides={4} radius={r * 1.1}
        rotation={45}
        fill="#fb923c" stroke="#fff" strokeWidth={sw * 1.5}
        draggable
        onDragMove={(e: Konva.KonvaEventObject<DragEvent>) => {
          liveControl2.current = { x: e.target.x(), y: e.target.y() };
          refreshShapes();
        }}
        onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => {
          const nx = Math.round(e.target.x());
          const ny = Math.round(e.target.y());
          liveControl2.current = { x: nx, y: ny };
          updateClip(clip.id, {
            payload: { ...clip.payload, control2X: nx, control2Y: ny },
          } as Partial<MoveAlongPathClip>);
        }}
      />
      <Text
        text="控2"
        x={control2X + r + 3 / stageScale} y={control2Y - r}
        fontSize={fontSize} fill="#fb923c" listening={false}
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
