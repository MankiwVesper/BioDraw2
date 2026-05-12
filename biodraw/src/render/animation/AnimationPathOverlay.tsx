import { useEffect, useRef } from 'react';
import { Group, Circle, Arrow, Line, RegularPolygon, Text, Rect } from 'react-konva';
import { useEditorStore } from '../../state/editorStore';
import type Konva from 'konva';
import type { MoveClip, MoveAlongPathClip, PolylineMoveClip } from '../../types';

interface Props {
  stageScale: number;
}

// ── Move clip overlay ────────────────────────────────────────
function MoveOverlay({ clip, stageScale }: { clip: MoveClip; stageScale: number }) {
  const updateClip = useEditorStore((s) => s.updateAnimationClip);

  const { fromX, fromY, toX, toY } = clip.payload;
  const arrowRef = useRef<Konva.Arrow>(null);
  const fromTextRef = useRef<Konva.Text>(null);
  const toTextRef = useRef<Konva.Text>(null);
  const r = 7 / stageScale;
  const fontSize = 11 / stageScale;
  const sw = 1.5 / stageScale;
  const pLen = 8 / stageScale;
  const pWid = 6 / stageScale;

  const liveFrom = useRef({ x: fromX, y: fromY });
  const liveTo = useRef({ x: toX, y: toY });

  useEffect(() => {
    liveFrom.current = { x: clip.payload.fromX, y: clip.payload.fromY };
    liveTo.current = { x: clip.payload.toX, y: clip.payload.toY };
  }, [clip.payload.fromX, clip.payload.fromY, clip.payload.toX, clip.payload.toY]);

  const refreshArrow = () => {
    const { x: fx, y: fy } = liveFrom.current;
    const { x: tx, y: ty } = liveTo.current;
    const offset = r + 3 / stageScale;
    arrowRef.current?.points([fx, fy, tx, ty]);
    fromTextRef.current?.x(fx + offset);
    fromTextRef.current?.y(fy - r);
    toTextRef.current?.x(tx + offset);
    toTextRef.current?.y(ty - r);
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
        ref={fromTextRef}
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
        ref={toTextRef}
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
  const fromTextRef = useRef<Konva.Text>(null);
  const ctrl1TextRef = useRef<Konva.Text>(null);
  const ctrl2TextRef = useRef<Konva.Text>(null);
  const toTextRef = useRef<Konva.Text>(null);

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
    const offset = r + 3 / stageScale;
    curveRef.current?.points([fx, fy, c1x, c1y, c2x, c2y, tx, ty]);
    arm1Ref.current?.points([fx, fy, c1x, c1y]);
    arm2Ref.current?.points([c1x, c1y, c2x, c2y]);
    arm3Ref.current?.points([c2x, c2y, tx, ty]);
    fromTextRef.current?.x(fx + offset); fromTextRef.current?.y(fy - r);
    ctrl1TextRef.current?.x(c1x + offset); ctrl1TextRef.current?.y(c1y - r);
    ctrl2TextRef.current?.x(c2x + offset); ctrl2TextRef.current?.y(c2y - r);
    toTextRef.current?.x(tx + offset); toTextRef.current?.y(ty - r);
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
        ref={fromTextRef}
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
        ref={ctrl1TextRef}
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
        ref={ctrl2TextRef}
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
        ref={toTextRef}
        text="终"
        x={toX + r + 3 / stageScale} y={toY - r}
        fontSize={fontSize} fill="#3b82f6" listening={false}
      />
    </Group>
  );
}

// ── PolylineMove clip overlay ────────────────────────────────
function PolylineMoveOverlay({ clip, stageScale }: { clip: PolylineMoveClip; stageScale: number }) {
  const updateClip = useEditorStore((s) => s.updateAnimationClip);

  const { fromX, fromY, midX, midY, toX, toY } = clip.payload;
  const seg1Ref = useRef<Konva.Arrow>(null);
  const seg2Ref = useRef<Konva.Arrow>(null);
  const fromTextRef = useRef<Konva.Text>(null);
  const midTextRef = useRef<Konva.Text>(null);
  const toTextRef = useRef<Konva.Text>(null);

  const r = 7 / stageScale;
  const fontSize = 11 / stageScale;
  const sw = 1.5 / stageScale;
  const pLen = 8 / stageScale;
  const pWid = 6 / stageScale;

  const liveFrom = useRef({ x: fromX, y: fromY });
  const liveMid = useRef({ x: midX, y: midY });
  const liveTo = useRef({ x: toX, y: toY });

  useEffect(() => {
    liveFrom.current = { x: clip.payload.fromX, y: clip.payload.fromY };
    liveMid.current = { x: clip.payload.midX, y: clip.payload.midY };
    liveTo.current = { x: clip.payload.toX, y: clip.payload.toY };
  }, [clip.payload.fromX, clip.payload.fromY, clip.payload.midX, clip.payload.midY, clip.payload.toX, clip.payload.toY]);

  const refreshShapes = () => {
    const { x: fx, y: fy } = liveFrom.current;
    const { x: mx, y: my } = liveMid.current;
    const { x: tx, y: ty } = liveTo.current;
    const offset = r + 3 / stageScale;
    seg1Ref.current?.points([fx, fy, mx, my]);
    seg2Ref.current?.points([mx, my, tx, ty]);
    fromTextRef.current?.x(fx + offset); fromTextRef.current?.y(fy - r);
    midTextRef.current?.x(mx + offset); midTextRef.current?.y(my - r);
    toTextRef.current?.x(tx + offset); toTextRef.current?.y(ty - r);
    seg1Ref.current?.getLayer()?.batchDraw();
  };

  return (
    <Group>
      {/* Segment 1: from → mid */}
      <Arrow
        ref={seg1Ref}
        points={[fromX, fromY, midX, midY]}
        stroke="rgba(100,116,139,0.7)"
        strokeWidth={sw}
        dash={[6 / stageScale, 4 / stageScale]}
        fill="rgba(100,116,139,0.7)"
        pointerLength={pLen}
        pointerWidth={pWid}
        listening={false}
      />
      {/* Segment 2: mid → to */}
      <Arrow
        ref={seg2Ref}
        points={[midX, midY, toX, toY]}
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
          refreshShapes();
        }}
        onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => {
          const nx = Math.round(e.target.x());
          const ny = Math.round(e.target.y());
          liveFrom.current = { x: nx, y: ny };
          updateClip(clip.id, { payload: { ...clip.payload, fromX: nx, fromY: ny } } as Partial<PolylineMoveClip>);
        }}
      />
      <Text ref={fromTextRef} text="起" x={fromX + r + 3 / stageScale} y={fromY - r} fontSize={fontSize} fill="#10b981" listening={false} />

      {/* Mid handle (indigo diamond) */}
      <RegularPolygon
        x={midX} y={midY}
        sides={4} radius={r * 1.1} rotation={45}
        fill="#6366f1" stroke="#fff" strokeWidth={sw * 1.5}
        draggable
        onDragMove={(e: Konva.KonvaEventObject<DragEvent>) => {
          liveMid.current = { x: e.target.x(), y: e.target.y() };
          refreshShapes();
        }}
        onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => {
          const nx = Math.round(e.target.x());
          const ny = Math.round(e.target.y());
          liveMid.current = { x: nx, y: ny };
          updateClip(clip.id, { payload: { ...clip.payload, midX: nx, midY: ny } } as Partial<PolylineMoveClip>);
        }}
      />
      <Text ref={midTextRef} text="中" x={midX + r + 3 / stageScale} y={midY - r} fontSize={fontSize} fill="#6366f1" listening={false} />

      {/* End handle (blue) */}
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
          updateClip(clip.id, { payload: { ...clip.payload, toX: nx, toY: ny } } as Partial<PolylineMoveClip>);
        }}
      />
      <Text ref={toTextRef} text="终" x={toX + r + 3 / stageScale} y={toY - r} fontSize={fontSize} fill="#3b82f6" listening={false} />
    </Group>
  );
}

// ── Canvas path drawing overlay ──────────────────────────────
function DrawingOverlay({ stageScale }: { stageScale: number }) {
  const mode = useEditorStore((s) => s.canvasDrawingMode);
  const setMode = useEditorStore((s) => s.setCanvasDrawingMode);
  const updateClip = useEditorStore((s) => s.updateAnimationClip);
  const animations = useEditorStore((s) => s.animations);
  const expandedClipIds = useEditorStore((s) => s.expandedAnimationClipIds);
  const canvasWidth = useEditorStore((s) => s.canvasWidth);
  const canvasHeight = useEditorStore((s) => s.canvasHeight);

  const previewArrowRef = useRef<Konva.Arrow>(null);
  const previewCurveRef = useRef<Konva.Line>(null);

  const modeRef = useRef(mode);
  const animationsRef = useRef(animations);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { animationsRef.current = animations; }, [animations]);

  // Cancel when the drawing clip's card is collapsed
  useEffect(() => {
    const m = modeRef.current;
    if (!m) return;
    if (!expandedClipIds.includes(m.clipId)) {
      setMode(null);
    }
  }, [expandedClipIds, setMode]);

  // Record baseline animation count when mode first activates
  const prevAnimLenRef = useRef(animations.length);
  useEffect(() => {
    if (mode) {
      prevAnimLenRef.current = animationsRef.current.length;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!mode]);

  // Cancel when a new animation clip is added while drawing
  useEffect(() => {
    const m = modeRef.current;
    if (!m) return;
    if (animations.length > prevAnimLenRef.current) {
      setMode(null);
    }
  }, [animations.length, setMode]);

  if (!mode) return null;
  const clip = animations.find((a) => a.id === mode.clipId);
  if (!clip) return null;
  if (mode.type === 'move-path' && clip.type !== 'move') return null;
  if (mode.type === 'polyline-path' && clip.type !== 'polylineMove') return null;
  if (mode.type === 'curve-path' && clip.type !== 'moveAlongPath') return null;

  const r = 7 / stageScale;
  const sw = 1.5 / stageScale;
  const fontSize = 11 / stageScale;
  const pLen = 8 / stageScale;
  const pWid = 6 / stageScale;

  const handleClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    if (!stage) return;
    const pos = stage.getRelativePointerPosition();
    if (!pos) return;
    const x = Math.round(pos.x);
    const y = Math.round(pos.y);

    if (mode.type === 'move-path') {
      if (mode.step === 'start') {
        setMode({ type: 'move-path', clipId: mode.clipId, step: 'end', startX: x, startY: y });
      } else if (mode.step === 'end' && mode.startX !== undefined) {
        updateClip(clip.id, {
          payload: { ...clip.payload, fromX: mode.startX, fromY: mode.startY!, toX: x, toY: y },
        } as Partial<MoveClip>);
        setMode({ type: 'move-path', clipId: mode.clipId, step: 'start' });
      }
    } else if (mode.type === 'polyline-path') {
      if (mode.step === 'start') {
        setMode({ type: 'polyline-path', clipId: mode.clipId, step: 'mid', startX: x, startY: y });
      } else if (mode.step === 'mid') {
        setMode({ type: 'polyline-path', clipId: mode.clipId, step: 'end', startX: mode.startX, startY: mode.startY, midX: x, midY: y });
      } else if (mode.step === 'end' && mode.midX !== undefined) {
        updateClip(clip.id, {
          payload: { ...(clip as PolylineMoveClip).payload, fromX: mode.startX!, fromY: mode.startY!, midX: mode.midX, midY: mode.midY!, toX: x, toY: y },
        } as Partial<PolylineMoveClip>);
        setMode({ type: 'polyline-path', clipId: mode.clipId, step: 'start' });
      }
    } else if (mode.type === 'curve-path') {
      if (mode.step === 'from') {
        setMode({ type: 'curve-path', clipId: mode.clipId, step: 'ctrl1', fromX: x, fromY: y });
      } else if (mode.step === 'ctrl1') {
        setMode({ type: 'curve-path', clipId: mode.clipId, step: 'ctrl2', fromX: mode.fromX, fromY: mode.fromY, ctrl1X: x, ctrl1Y: y });
      } else if (mode.step === 'ctrl2') {
        setMode({ type: 'curve-path', clipId: mode.clipId, step: 'to', fromX: mode.fromX, fromY: mode.fromY, ctrl1X: mode.ctrl1X, ctrl1Y: mode.ctrl1Y, ctrl2X: x, ctrl2Y: y });
      } else if (mode.step === 'to' && mode.ctrl2X !== undefined) {
        updateClip(clip.id, {
          payload: { ...(clip as MoveAlongPathClip).payload, fromX: mode.fromX!, fromY: mode.fromY!, control1X: mode.ctrl1X!, control1Y: mode.ctrl1Y!, control2X: mode.ctrl2X, control2Y: mode.ctrl2Y!, toX: x, toY: y },
        } as Partial<MoveAlongPathClip>);
        setMode({ type: 'curve-path', clipId: mode.clipId, step: 'from' });
      }
    }
  };

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    if (!stage) return;
    const pos = stage.getRelativePointerPosition();
    if (!pos) return;
    const m = modeRef.current;
    if (!m) return;

    if (m.type === 'move-path' && m.step === 'end' && m.startX !== undefined) {
      previewArrowRef.current?.points([m.startX, m.startY!, pos.x, pos.y]);
      previewArrowRef.current?.getLayer()?.batchDraw();
    } else if (m.type === 'polyline-path') {
      if (m.step === 'mid' && m.startX !== undefined) {
        previewArrowRef.current?.points([m.startX, m.startY!, pos.x, pos.y]);
        previewArrowRef.current?.getLayer()?.batchDraw();
      } else if (m.step === 'end' && m.midX !== undefined) {
        previewArrowRef.current?.points([m.midX, m.midY!, pos.x, pos.y]);
        previewArrowRef.current?.getLayer()?.batchDraw();
      }
    } else if (m.type === 'curve-path') {
      if (m.step === 'ctrl1' && m.fromX !== undefined) {
        previewArrowRef.current?.points([m.fromX, m.fromY!, pos.x, pos.y]);
        previewArrowRef.current?.getLayer()?.batchDraw();
      } else if (m.step === 'ctrl2' && m.ctrl1X !== undefined) {
        previewArrowRef.current?.points([m.ctrl1X, m.ctrl1Y!, pos.x, pos.y]);
        previewArrowRef.current?.getLayer()?.batchDraw();
      } else if (m.step === 'to' && m.ctrl2X !== undefined) {
        previewCurveRef.current?.points([m.fromX!, m.fromY!, m.ctrl1X!, m.ctrl1Y!, m.ctrl2X, m.ctrl2Y!, pos.x, pos.y]);
        previewCurveRef.current?.getLayer()?.batchDraw();
      }
    }
  };

  // Compute preview arrow origin (last placed point → cursor)
  let arrowFrom: [number, number] | null = null;
  if (mode.type === 'move-path' && mode.step === 'end' && mode.startX !== undefined)
    arrowFrom = [mode.startX, mode.startY!];
  if (mode.type === 'polyline-path' && mode.step === 'mid' && mode.startX !== undefined)
    arrowFrom = [mode.startX, mode.startY!];
  if (mode.type === 'polyline-path' && mode.step === 'end' && mode.midX !== undefined)
    arrowFrom = [mode.midX, mode.midY!];
  if (mode.type === 'curve-path' && mode.step === 'ctrl1' && mode.fromX !== undefined)
    arrowFrom = [mode.fromX, mode.fromY!];
  if (mode.type === 'curve-path' && mode.step === 'ctrl2' && mode.ctrl1X !== undefined)
    arrowFrom = [mode.ctrl1X, mode.ctrl1Y!];

  const showCurvePreview = mode.type === 'curve-path' && mode.step === 'to' && mode.ctrl2X !== undefined;

  return (
    <Group>
      <Rect
        x={0} y={0}
        width={canvasWidth} height={canvasHeight}
        fill="rgba(0,0,0,0)"
        onMouseDown={(e) => { e.cancelBubble = true; }}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
      />

      {/* move-path: placed start point */}
      {mode.type === 'move-path' && mode.step === 'end' && mode.startX !== undefined && (
        <>
          <Circle x={mode.startX} y={mode.startY!} radius={r} fill="#10b981" stroke="#fff" strokeWidth={sw * 1.5} listening={false} />
          <Text text="起" x={mode.startX + r + 3 / stageScale} y={mode.startY! - r} fontSize={fontSize} fill="#10b981" listening={false} />
        </>
      )}

      {/* polyline-path: placed start point */}
      {mode.type === 'polyline-path' && mode.startX !== undefined && (
        <>
          <Circle x={mode.startX} y={mode.startY!} radius={r} fill="#10b981" stroke="#fff" strokeWidth={sw * 1.5} listening={false} />
          <Text text="起" x={mode.startX + r + 3 / stageScale} y={mode.startY! - r} fontSize={fontSize} fill="#10b981" listening={false} />
        </>
      )}
      {/* polyline-path: placed mid point + start→mid segment */}
      {mode.type === 'polyline-path' && mode.step === 'end' && mode.midX !== undefined && (
        <>
          <Arrow points={[mode.startX!, mode.startY!, mode.midX, mode.midY!]} stroke="rgba(100,116,139,0.7)" strokeWidth={sw} dash={[6 / stageScale, 4 / stageScale]} fill="rgba(100,116,139,0.7)" pointerLength={pLen} pointerWidth={pWid} listening={false} />
          <RegularPolygon x={mode.midX} y={mode.midY!} sides={4} radius={r * 1.1} rotation={45} fill="#6366f1" stroke="#fff" strokeWidth={sw * 1.5} listening={false} />
          <Text text="中" x={mode.midX + r + 3 / stageScale} y={mode.midY! - r} fontSize={fontSize} fill="#6366f1" listening={false} />
        </>
      )}

      {/* curve-path: placed from point */}
      {mode.type === 'curve-path' && mode.fromX !== undefined && (
        <>
          <Circle x={mode.fromX} y={mode.fromY!} radius={r} fill="#10b981" stroke="#fff" strokeWidth={sw * 1.5} listening={false} />
          <Text text="起" x={mode.fromX + r + 3 / stageScale} y={mode.fromY! - r} fontSize={fontSize} fill="#10b981" listening={false} />
        </>
      )}
      {/* curve-path: placed ctrl1 + arm from→ctrl1 */}
      {mode.type === 'curve-path' && mode.ctrl1X !== undefined && (
        <>
          <Line points={[mode.fromX!, mode.fromY!, mode.ctrl1X, mode.ctrl1Y!]} stroke="rgba(245,158,11,0.5)" strokeWidth={sw} dash={[4 / stageScale, 3 / stageScale]} listening={false} />
          <RegularPolygon x={mode.ctrl1X} y={mode.ctrl1Y!} sides={4} radius={r * 1.1} rotation={45} fill="#f59e0b" stroke="#fff" strokeWidth={sw * 1.5} listening={false} />
          <Text text="控1" x={mode.ctrl1X + r + 3 / stageScale} y={mode.ctrl1Y! - r} fontSize={fontSize} fill="#f59e0b" listening={false} />
        </>
      )}
      {/* curve-path: placed ctrl2 + arm ctrl1→ctrl2 */}
      {mode.type === 'curve-path' && mode.ctrl2X !== undefined && (
        <>
          <Line points={[mode.ctrl1X!, mode.ctrl1Y!, mode.ctrl2X, mode.ctrl2Y!]} stroke="rgba(245,158,11,0.3)" strokeWidth={sw} dash={[4 / stageScale, 3 / stageScale]} listening={false} />
          <RegularPolygon x={mode.ctrl2X} y={mode.ctrl2Y!} sides={4} radius={r * 1.1} rotation={45} fill="#fb923c" stroke="#fff" strokeWidth={sw * 1.5} listening={false} />
          <Text text="控2" x={mode.ctrl2X + r + 3 / stageScale} y={mode.ctrl2Y! - r} fontSize={fontSize} fill="#fb923c" listening={false} />
        </>
      )}

      {/* Dashed preview arrow: last placed point → cursor (all modes except curve 'to') */}
      {arrowFrom && (
        <Arrow
          ref={previewArrowRef}
          points={[...arrowFrom, ...arrowFrom]}
          stroke="rgba(59,130,246,0.7)"
          strokeWidth={sw}
          dash={[6 / stageScale, 4 / stageScale]}
          fill="rgba(59,130,246,0.7)"
          pointerLength={pLen}
          pointerWidth={pWid}
          listening={false}
        />
      )}

      {/* Bezier preview for curve-path 'to' step */}
      {showCurvePreview && (
        <Line
          ref={previewCurveRef}
          bezier
          points={[mode.fromX!, mode.fromY!, mode.ctrl1X!, mode.ctrl1Y!, mode.ctrl2X!, mode.ctrl2Y!, mode.ctrl2X!, mode.ctrl2Y!]}
          stroke="rgba(59,130,246,0.7)"
          strokeWidth={sw}
          dash={[6 / stageScale, 4 / stageScale]}
          listening={false}
        />
      )}
    </Group>
  );
}

// ── Main export ──────────────────────────────────────────────
export function AnimationPathOverlay({ stageScale }: Props) {
  const expandedClipIds = useEditorStore((s) => s.expandedAnimationClipIds);
  const animations = useEditorStore((s) => s.animations);

  return (
    <Group>
      {expandedClipIds.map((id) => {
        const clip = animations.find((a) => a.id === id);
        if (!clip) return null;
        if (clip.type === 'move') return <MoveOverlay key={id} clip={clip as MoveClip} stageScale={stageScale} />;
        if (clip.type === 'moveAlongPath') return <MoveAlongPathOverlay key={id} clip={clip as MoveAlongPathClip} stageScale={stageScale} />;
        if (clip.type === 'polylineMove') return <PolylineMoveOverlay key={id} clip={clip as PolylineMoveClip} stageScale={stageScale} />;
        return null;
      })}
      <DrawingOverlay stageScale={stageScale} />
    </Group>
  );
}
