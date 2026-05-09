import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEditorStore } from '../../state/editorStore';
import { buildAnimatedPreviewObjects } from '../../animation/engine';
import { useNumberInputWheelEdit } from '../../hooks/useNumberInputWheelEdit';
import type { AnimationClip, AppearSegment } from '../../types';
import { KeyframeEditor } from './KeyframeEditor';
import './TimelinePanel.css';

// ── 辅助常量 ────────────────────────────────────────────────

const clampPositive = (value: number, fallback: number) => {
  if (Number.isNaN(value)) return fallback;
  return Math.max(1, value);
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const clampBezierY = (value: number) => Math.max(-2, Math.min(2, value));
const SNAP_DISTANCE_PX = 8;
const CONFLICT_DOMAIN_ORDER = ['position', 'opacity', 'scale', 'rotation', 'state'];

const EASING_PRESET_OPTIONS = [
  { value: 'linear', label: '线性', points: [0, 0, 1, 1] as const },
  { value: 'ease-in', label: '缓入', points: [0.42, 0, 1, 1] as const },
  { value: 'ease-out', label: '缓出', points: [0, 0, 0.58, 1] as const },
  { value: 'ease-in-out', label: '缓入缓出', points: [0.42, 0, 0.58, 1] as const },
] as const;
type EasingPresetValue = (typeof EASING_PRESET_OPTIONS)[number]['value'];

// 动画类型中文名
const CLIP_TYPE_LABELS: Record<string, string> = {
  move: '移动',
  moveAlongPath: '曲线移动',
  fade: '淡入淡出',
  scale: '缩放',
  rotate: '旋转',
  shake: '抖动',
  stateChange: '状态切换',
};

const getClipTypeLabel = (type: string) => CLIP_TYPE_LABELS[type] ?? type;

// 元素分布轴标记颜色（20 种亮丽色轮流取用）
const DIST_COLORS = [
  '#FF6B6B', '#FF9F43', '#FECA57', '#48DBFB', '#1DD1A1',
  '#FF6B81', '#F8B739', '#3DC1D3', '#7BED9F', '#70A1FF',
  '#FF4757', '#2ED573', '#1E90FF', '#FF6348', '#A29BFE',
  '#FD79A8', '#00CEC9', '#FF9FF3', '#54A0FF', '#FFDD59',
];

// 元素时间段颜色（与分布轴同一调色板，按段索引取用）
const SEGMENT_COLORS = DIST_COLORS;

// 在 hex 颜色后追加 alpha 字节（0~1）
const hexAlpha = (hex: string, alpha: number) => {
  const a = Math.max(0, Math.min(1, alpha));
  const byte = Math.round(a * 255).toString(16).padStart(2, '0');
  return hex + byte;
};

const BATCH_EASING_OPTS: Array<{ value: AnimationClip['easing'] | ''; label: string }> = [
  { value: '', label: '不修改' },
  { value: 'linear', label: '线性' },
  { value: 'ease-in', label: '缓入' },
  { value: 'ease-out', label: '缓出' },
  { value: 'ease-in-out', label: '缓入缓出' },
];

const BATCH_STATE_OPTS: Array<{ value: '' | 'enabled' | 'disabled'; label: string }> = [
  { value: '', label: '不修改' },
  { value: 'enabled', label: '启用' },
  { value: 'disabled', label: '禁用' },
];

// ── 纯函数工具 ───────────────────────────────────────────────

const findPresetByValue = (value: string) =>
  EASING_PRESET_OPTIONS.find((item) => item.value === value);

const parseEasingControlPoints = (easing?: AnimationClip['easing']) => {
  const raw = easing || 'linear';
  const preset = findPresetByValue(raw);
  if (preset) return { points: [...preset.points] as [number, number, number, number] };
  const matched = /^cubic-bezier\(\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*\)$/i.exec(raw);
  if (matched) {
    const x1 = clamp01(parseFloat(matched[1]));
    const y1 = parseFloat(matched[2]);
    const x2 = clamp01(parseFloat(matched[3]));
    const y2 = parseFloat(matched[4]);
    if (![x1, y1, x2, y2].some((v) => Number.isNaN(v))) {
      return { points: [x1, y1, x2, y2] as [number, number, number, number] };
    }
  }
  return { points: [0, 0, 1, 1] as [number, number, number, number] };
};

const formatBezierValue = (value: number) => {
  const rounded = Math.round(value * 1000) / 1000;
  return Number(rounded.toFixed(3));
};

const buildBezierEasingValue = (x1: number, y1: number, x2: number, y2: number) =>
  `cubic-bezier(${formatBezierValue(x1)},${formatBezierValue(y1)},${formatBezierValue(x2)},${formatBezierValue(y2)})` as AnimationClip['easing'];

const getEasingPreviewPath = (x1: number, y1: number, x2: number, y2: number) => {
  const w = 88, h = 52, sx = 4, sy = h - 4, ex = w - 4, ey = 4;
  const c1x = sx + (ex - sx) * x1, c1y = sy - (sy - ey) * y1;
  const c2x = sx + (ex - sx) * x2, c2y = sy - (sy - ey) * y2;
  return `M ${sx} ${sy} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${ex} ${ey}`;
};

const CURVE_VB = { sx: 4, sy: 48, ex: 84, ey: 4, w: 80, h: 44 } as const;

function clientToSvgPoint(e: MouseEvent, svg: SVGSVGElement) {
  const pt = svg.createSVGPoint();
  pt.x = e.clientX; pt.y = e.clientY;
  return pt.matrixTransform(svg.getScreenCTM()!.inverse());
}

function evalBezierPoint(t: number, ex1: number, ey1: number, ex2: number, ey2: number) {
  const { sx, sy, ex, ey, w, h } = CURVE_VB;
  const c1x = sx + w * ex1, c1y = sy - h * ey1;
  const c2x = sx + w * ex2, c2y = sy - h * ey2;
  const mt = 1 - t;
  return {
    x: mt*mt*mt*sx + 3*mt*mt*t*c1x + 3*mt*t*t*c2x + t*t*t*ex,
    y: mt*mt*mt*sy + 3*mt*mt*t*c1y + 3*mt*t*t*c2y + t*t*t*ey,
  };
}

function findCurveT(mx: number, my: number, ex1: number, ey1: number, ex2: number, ey2: number) {
  let best = 0.5, bestD = Infinity;
  for (let i = 1; i < 100; i++) {
    const t = i / 100;
    const p = evalBezierPoint(t, ex1, ey1, ex2, ey2);
    const d = (p.x - mx) ** 2 + (p.y - my) ** 2;
    if (d < bestD) { best = t; bestD = d; }
  }
  return best;
}

interface EasingCurveProps {
  ex1: number; ey1: number; ex2: number; ey2: number;
  onDrag: (ex1: number, ey1: number, ex2: number, ey2: number) => void;
}

function EasingCurve({ ex1, ey1, ex2, ey2, onDrag }: EasingCurveProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const onDragRef = useRef(onDrag);
  onDragRef.current = onDrag;

  const dragState = useRef<{
    t: number; sx0: number; sy0: number;
    ox1: number; oy1: number; ox2: number; oy2: number;
  } | null>(null);

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const pt = clientToSvgPoint(e.nativeEvent, svgRef.current);
    const t = findCurveT(pt.x, pt.y, ex1, ey1, ex2, ey2);
    if (t < 0.05 || t > 0.95 || Math.abs(t - 0.5) < 0.04) return;
    e.preventDefault();
    dragState.current = { t, sx0: pt.x, sy0: pt.y, ox1: ex1, oy1: ey1, ox2: ex2, oy2: ey2 };
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragState.current || !svgRef.current) return;
      const { t, sx0, sy0, ox1, oy1, ox2, oy2 } = dragState.current;
      const pt = clientToSvgPoint(e, svgRef.current);
      const dx = pt.x - sx0, dy = pt.y - sy0;
      const factor = Math.min(1 / (3 * t * (1 - t)), 10);
      const dex = (dx / CURVE_VB.w) * factor;
      const dey = (-dy / CURVE_VB.h) * factor;
      onDragRef.current(
        clamp01(ox1 + dex),
        clampBezierY(oy1 + dey),
        clamp01(ox2 + dex),
        clampBezierY(oy2 + dey),
      );
    };
    const onUp = () => { dragState.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  return (
    <svg ref={svgRef} viewBox="0 0 88 52" preserveAspectRatio="none" className="tl-easing-svg"
      onMouseDown={handleMouseDown} aria-hidden="true">
      <path d="M 4 48 L 84 4" className="tl-easing-base" />
      <path d={getEasingPreviewPath(ex1, ey1, ex2, ey2)} className="tl-easing-curve" />
    </svg>
  );
}

const getConflictDomain = (clipType: AnimationClip['type']) => {
  switch (clipType) {
    case 'move': case 'moveAlongPath': case 'shake': return 'position';
    case 'fade': return 'opacity';
    case 'scale': return 'scale';
    case 'rotate': return 'rotation';
    case 'stateChange': return 'state';
    default: return clipType;
  }
};

const getConflictDomainLabel = (domain: string) => {
  switch (domain) {
    case 'position': return '位置';
    case 'opacity': return '透明度';
    case 'scale': return '缩放';
    case 'rotation': return '旋转';
    case 'state': return '状态';
    default: return domain;
  }
};

const sortConflictDomains = (domains: string[]) =>
  [...domains].sort((a, b) => {
    const ai = CONFLICT_DOMAIN_ORDER.indexOf(a), bi = CONFLICT_DOMAIN_ORDER.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

// ── 主组件 ───────────────────────────────────────────────────

export function TimelinePanel() {
  // ── 原有状态（保持不变）
  const [flashClipId, setFlashClipId] = useState<string | null>(null);
  const [cursorSnapGuideMs, setCursorSnapGuideMs] = useState<number | null>(null);
  const [isCursorDragging, setIsCursorDragging] = useState(false);
  const [timelineZoom, setTimelineZoom] = useState(100);
  const [batchSelectedClipIds, setBatchSelectedClipIds] = useState<string[]>([]);
  const [batchStartInput, setBatchStartInput] = useState('');
  const [batchDurationInput, setBatchDurationInput] = useState('');
  const [batchEasingInput, setBatchEasingInput] = useState<AnimationClip['easing'] | ''>('');
  const [batchEnabledInput, setBatchEnabledInput] = useState<'' | 'enabled' | 'disabled'>('');
  const [batchEasingDropOpen, setBatchEasingDropOpen] = useState(false);
  const [batchStateDropOpen, setBatchStateDropOpen] = useState(false);
  const clipCardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const clipTrackRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const overallTrackRef = useRef<HTMLDivElement>(null);
  const elementTrackRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const zoomCleanupRef = useRef<(() => void) | null>(null);
  const zoomCtrlRef = useCallback((el: HTMLDivElement | null) => {
    zoomCleanupRef.current?.();
    zoomCleanupRef.current = null;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      setTimelineZoom(prev => Math.max(50, Math.min(300, prev + (e.deltaY < 0 ? 10 : -10))));
    };
    el.addEventListener('wheel', handler, { passive: false });
    zoomCleanupRef.current = () => el.removeEventListener('wheel', handler);
  }, []);
  useNumberInputWheelEdit(panelRef);

  // 元素出现段拖拽态（move/resize 共用一个段；同时保存相邻段边界用于硬阻挡）
  const [windowDragState, setWindowDragState] = useState<{
    mode: 'move' | 'resize-start' | 'resize-end';
    objectId: string;
    segmentId: string;
    offsetMs: number;
    fixedStartMs: number;
    fixedEndMs: number;
    previewStartMs: number;
    previewEndMs: number;
    // 相邻段：拖拽不可越过的左右边界
    boundLeftMs: number;
    boundRightMs: number;
  } | null>(null);
  const [dragState, setDragState] = useState<{
    clipId: string;
    mode: 'move' | 'resize-start' | 'resize-end';
    offsetMs: number;
    fixedEndMs: number;
    previewStartMs: number;
    previewDurationMs: number;
    snapGuideMs: number | null;
  } | null>(null);

  // ── 新增 UI 状态
  const [expandedClipId, setExpandedClipId] = useState<string | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [addMenuTab, setAddMenuTab] = useState<'basic' | 'template'>('basic');
  const [showBatchPanel, setShowBatchPanel] = useState(false);
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [copyTargetIds, setCopyTargetIds] = useState<string[]>([]);
  const [selectedSegmentIds, setSelectedSegmentIds] = useState<string[]>([]);
  const [showAddSegmentDialog, setShowAddSegmentDialog] = useState(false);
  const [addSegStartInput, setAddSegStartInput] = useState('');
  const [addSegEndInput, setAddSegEndInput] = useState('');
  const [showDeleteSegmentConfirm, setShowDeleteSegmentConfirm] = useState(false);
  const addSegmentDialogRef = useRef<HTMLDivElement>(null);
  const deleteSegmentConfirmRef = useRef<HTMLDivElement>(null);
  const [clipDurationWarnId, setClipDurationWarnId] = useState<string | null>(null);
  const [clipListDrag, setClipListDrag] = useState<{ clipId: string; fromIndex: number; toIndex: number } | null>(null);
  const [isTimeEditing, setIsTimeEditing] = useState(false);
  const [timeEditValue, setTimeEditValue] = useState('');
  const timeEditCancelledRef = useRef(false);
  const [clipLabelEditId, setClipLabelEditId] = useState<string | null>(null);
  const [clipLabelStart, setClipLabelStart] = useState('');
  const [clipLabelEnd, setClipLabelEnd] = useState('');
  const clipLabelCancelledRef = useRef(false);
  const [segLabelEditId, setSegLabelEditId] = useState<string | null>(null);
  const [segLabelStart, setSegLabelStart] = useState('');
  const [segLabelEnd, setSegLabelEnd] = useState('');
  const segLabelCancelledRef = useRef(false);
  const clipLabelEditingRef = useRef(false);
  const clipLabelStartRef = useRef('');
  const clipLabelEndRef = useRef('');
  const clipLabelSpanRef = useRef<HTMLSpanElement>(null);
  const clipLabelCommitRef = useRef<(s: string, e: string) => void>(() => {});
  const clipLabelWidthRef = useRef<number | null>(null);
  const segLabelEditingRef = useRef(false);
  const segLabelStartRef = useRef('');
  const segLabelEndRef = useRef('');
  const segLabelSpanRef = useRef<HTMLSpanElement>(null);
  const segLabelCommitRef = useRef<(s: string, e: string) => void>(() => {});
  const segLabelWidthRef = useRef<number | null>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const copyDialogRef = useRef<HTMLDivElement>(null);
  const batchPanelRef = useRef<HTMLDivElement>(null);
  const batchEasingDropRef = useRef<HTMLDivElement>(null);
  const batchStateDropRef = useRef<HTMLDivElement>(null);
  const clipDragHappenedRef = useRef(false);
  const windowDragMovedRef = useRef(false);

  // ── Store 订阅
  const objects = useEditorStore((s) => s.objects);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const animations = useEditorStore((s) => s.animations);
  const playbackStatus = useEditorStore((s) => s.playbackStatus);
  const globalDurationMs = useEditorStore((s) => s.globalDurationMs);
  const currentTimeMs = useEditorStore((s) => s.currentTimeMs);
  const setGlobalDurationMs = useEditorStore((s) => s.setGlobalDurationMs);
  const setCurrentTimeMs = useEditorStore((s) => s.setCurrentTimeMs);
  const pause = useEditorStore((s) => s.pause);
  const addAnimationClip = useEditorStore((s) => s.addAnimationClip);
  const updateAnimationClip = useEditorStore((s) => s.updateAnimationClip);
  const removeAnimationClip = useEditorStore((s) => s.removeAnimationClip);
  const setExpandedAnimationClipId = useEditorStore((s) => s.setExpandedAnimationClipId);
  const copyAnimationClipsToObjects = useEditorStore((s) => s.copyAnimationClipsToObjects);
  const startClipPreview = useEditorStore((s) => s.startClipPreview);
  const selectObject = useEditorStore((s) => s.selectObject);
  const addAppearSegment = useEditorStore((s) => s.addAppearSegment);
  const removeAppearSegments = useEditorStore((s) => s.removeAppearSegments);
  const updateAppearSegment = useEditorStore((s) => s.updateAppearSegment);
  const materializeAppearSegmentsSilent = useEditorStore((s) => s.materializeAppearSegmentsSilent);
  const patchAnimationClipSilent = useEditorStore((s) => s.patchAnimationClipSilent);
  const reorderAnimationClips = useEditorStore((s) => s.reorderAnimationClips);

  // ── 派生状态
  const selectedObject = useMemo(
    () => objects.find((o) => o.id === selectedIds[0]) ?? null,
    [objects, selectedIds],
  );

  const previewObjectsAtCurrentTime = useMemo(() => {
    if (currentTimeMs <= 0 || animations.length === 0) return objects;
    return buildAnimatedPreviewObjects(objects, animations, currentTimeMs);
  }, [objects, animations, currentTimeMs]);

  const selectedObjectAtCurrentTime = useMemo(
    () => previewObjectsAtCurrentTime.find((o) => o.id === selectedIds[0]) ?? null,
    [previewObjectsAtCurrentTime, selectedIds],
  );

  const selectedObjectClips = useMemo(
    () =>
      selectedObject
        ? animations.filter((c) => c.objectId === selectedObject.id)
        : [],
    [animations, selectedObject],
  );

  // 选中对象的有效段集合。
  // appearSegments === undefined → 旧数据，衍生虚拟段兼容；
  // appearSegments === []       → 用户主动删完，返回空数组，不再自动补段；
  // appearSegments.length > 0  → 正常情况，按序返回。
  const effectiveSegments = useMemo<AppearSegment[]>(() => {
    if (!selectedObject) return [];
    if (selectedObject.appearSegments) {
      return [...selectedObject.appearSegments].sort((a, b) => a.startMs - b.startMs);
    }
    return [{
      id: '__virtual__',
      startMs: selectedObject.appearStartMs ?? 0,
      endMs: selectedObject.appearEndMs ?? globalDurationMs,
    }];
  }, [selectedObject, globalDurationMs]);

  // 兼容旧数据：对象从未初始化过段（字段为 undefined）时才落地；
  // 用户主动删完后 appearSegments === []，不应重新创建。
  useEffect(() => {
    if (!selectedObject) return;
    if (!selectedObject.appearSegments) {
      materializeAppearSegmentsSilent(selectedObject.id, globalDurationMs);
    }
  }, [selectedObject, globalDurationMs, materializeAppearSegmentsSilent]);

  // 切换选中元素时清空段选中态；移除已不存在的段 id
  useEffect(() => {
    setSelectedSegmentIds([]);
  }, [selectedObject?.id]);

  // 静默绑定无 segmentId 的孤儿 clip：以其 startTimeMs 落入哪个段为准，否则归到第一段。
  useEffect(() => {
    if (!selectedObject) return;
    const segs = selectedObject.appearSegments;
    if (!segs || segs.length === 0) return;
    const validIds = new Set(segs.map((s) => s.id));
    for (const clip of animations) {
      if (clip.objectId !== selectedObject.id) continue;
      if (clip.segmentId && validIds.has(clip.segmentId)) continue;
      const matched = segs.find((s) => clip.startTimeMs >= s.startMs && clip.startTimeMs <= s.endMs) ?? segs[0];
      patchAnimationClipSilent(clip.id, { segmentId: matched.id });
    }
  }, [selectedObject, animations, patchAnimationClipSilent]);

  useEffect(() => {
    setSelectedSegmentIds((prev) => {
      if (prev.length === 0) return prev;
      const valid = new Set(effectiveSegments.map((s) => s.id));
      const filtered = prev.filter((id) => valid.has(id));
      return filtered.length === prev.length ? prev : filtered;
    });
  }, [effectiveSegments]);

  useEffect(() => {
    if (selectedSegmentIds.length !== 1) setShowBatchPanel(false);
  }, [selectedSegmentIds.length]);

  // 段选中变化时关闭删除确认弹窗，防止切换片段时旧的确认状态残留
  useEffect(() => {
    setShowDeleteSegmentConfirm(false);
  }, [selectedSegmentIds]);

  const toggleSegmentSelection = (segId: string, additive: boolean) => {
    setSelectedSegmentIds((prev) => {
      if (additive) {
        return prev.includes(segId) ? prev.filter((id) => id !== segId) : [...prev, segId];
      }
      if (prev.length === 1 && prev[0] === segId) return [];
      return [segId];
    });
  };

  // 计算"增加片段"的默认值：取最早空闲区间，长度 ≥ T/10 则用 T/10，否则用整段空闲。
  const defaultNewSegmentRange = useMemo(() => {
    if (!selectedObject) return null;
    const desiredLen = 2000;
    const sorted = [...effectiveSegments]
      .filter((s) => s.id !== '__virtual__')
      .sort((a, b) => a.startMs - b.startMs);
    const free: Array<{ start: number; end: number }> = [];
    let cursor = 0;
    for (const s of sorted) {
      if (s.startMs > cursor) free.push({ start: cursor, end: s.startMs });
      cursor = Math.max(cursor, s.endMs);
    }
    if (cursor < globalDurationMs) free.push({ start: cursor, end: globalDurationMs });
    if (free.length === 0) return null;
    const f = free[0];
    if (f.end - f.start >= desiredLen) return { startMs: f.start, endMs: f.start + desiredLen };
    return { startMs: f.start, endMs: f.end };
  }, [effectiveSegments, globalDurationMs, selectedObject]);

  const openAddSegmentDialog = () => {
    if (!defaultNewSegmentRange) return;
    setAddSegStartInput(String(defaultNewSegmentRange.startMs));
    setAddSegEndInput(String(defaultNewSegmentRange.endMs));
    setShowAddSegmentDialog(true);
  };

  const submitAddSegment = () => {
    if (!selectedObject) return;
    const startMs = parseInt(addSegStartInput, 10);
    const endMs = parseInt(addSegEndInput, 10);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return;
    if (startMs < 0 || endMs > globalDurationMs || startMs >= endMs || endMs - startMs < 1000) return;
    const overlap = effectiveSegments.some(
      (s) => s.id !== '__virtual__' && Math.max(s.startMs, startMs) < Math.min(s.endMs, endMs),
    );
    if (overlap) return;
    const id = crypto.randomUUID();
    ensurePausedForEdit();
    addAppearSegment(selectedObject.id, { id, startMs, endMs });
    setSelectedSegmentIds([id]);
    setShowAddSegmentDialog(false);
  };

  const submitDeleteSegments = () => {
    if (!selectedObject || selectedSegmentIds.length === 0) return;
    ensurePausedForEdit();
    removeAppearSegments(selectedObject.id, selectedSegmentIds);
    setSelectedSegmentIds([]);
    setShowDeleteSegmentConfirm(false);
  };

  // 校验当前输入是否为合法的新段范围（用于禁用确认按钮）
  const addSegmentInputError = useMemo<string | null>(() => {
    const startMs = parseInt(addSegStartInput, 10);
    const endMs = parseInt(addSegEndInput, 10);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return '起止时间需为数字';
    if (startMs < 0) return '起始时间不能为负';
    if (endMs > globalDurationMs) return `结束时间不能超过 ${globalDurationMs}ms`;
    if (startMs >= endMs) return '结束时间必须大于起始时间';
    if (endMs - startMs < 1000) return '片段时长不能小于 1000ms';
    const overlap = effectiveSegments.some(
      (s) => s.id !== '__virtual__' && Math.max(s.startMs, startMs) < Math.min(s.endMs, endMs),
    );
    if (overlap) return '与已有段重叠';
    return null;
  }, [addSegStartInput, addSegEndInput, effectiveSegments, globalDurationMs]);

  const batchSelectedClipIdSet = useMemo(() => new Set(batchSelectedClipIds), [batchSelectedClipIds]);

  // ── 元素分布轴状态
  const [distPopup, setDistPopup] = useState<{ timeMs: number; x: number; y: number } | null>(null);
  const distHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleHideDistPopup = useCallback(() => {
    if (distHideTimer.current) clearTimeout(distHideTimer.current);
    distHideTimer.current = setTimeout(() => setDistPopup(null), 300);
  }, []);

  const cancelHideDistPopup = useCallback(() => {
    if (distHideTimer.current) { clearTimeout(distHideTimer.current); distHideTimer.current = null; }
  }, []);

  const openDistPopup = useCallback((timeMs: number, el: HTMLElement) => {
    cancelHideDistPopup();
    const rect = el.getBoundingClientRect();
    setDistPopup({ timeMs, x: rect.left + rect.width / 2, y: rect.top });
  }, [cancelHideDistPopup]);

  const distMarkers = useMemo(() => {
    const safeT = Math.max(1, globalDurationMs);
    const groups = new Map<number, Map<string, { name: string; clipCount: number }>>();
    animations.forEach((clip) => {
      const obj = objects.find((o) => o.id === clip.objectId);
      if (!obj) return;
      const t = clip.startTimeMs;
      if (!groups.has(t)) groups.set(t, new Map());
      const objMap = groups.get(t)!;
      if (!objMap.has(obj.id)) objMap.set(obj.id, { name: obj.name, clipCount: 0 });
      objMap.get(obj.id)!.clipCount += 1;
    });
    return Array.from(groups.entries())
      .sort(([a], [b]) => a - b)
      .map(([timeMs, objMap], idx) => {
        const elements = Array.from(objMap.entries()).map(([id, { name, clipCount }]) => ({ id, name, clipCount }));
        const clipCount = elements.reduce((sum, e) => sum + e.clipCount, 0);
        return {
          timeMs,
          elements,
          clipCount,
          leftPct: Math.min(100, (timeMs / safeT) * 100),
          color: DIST_COLORS[idx % DIST_COLORS.length],
        };
      });
  }, [animations, objects, globalDurationMs]);

  const selectedBatchClips = useMemo(
    () => selectedObjectClips.filter((c) => batchSelectedClipIdSet.has(c.id)),
    [selectedObjectClips, batchSelectedClipIdSet],
  );

  // 选中的批量 clip 中有不属于当前选中段的动画时，禁止统一设置开始时刻
  const batchStartDisabled = useMemo(() => {
    if (selectedSegmentIds.length !== 1) return true;
    const activeSegId = selectedSegmentIds[0];
    return selectedBatchClips.some((c) => c.segmentId !== activeSegId);
  }, [selectedBatchClips, selectedSegmentIds]);

  const conflictMeta = useMemo(() => {
    const conflictIds = new Set<string>();
    const rawDomainsByClipId = new Map<string, Set<string>>();
    const globalConflictDomains = new Set<string>();
    const markConflict = (clipId: string, domain: string) => {
      conflictIds.add(clipId);
      const cur = rawDomainsByClipId.get(clipId) || new Set<string>();
      cur.add(domain);
      rawDomainsByClipId.set(clipId, cur);
      globalConflictDomains.add(domain);
    };
    for (let i = 0; i < selectedObjectClips.length; i++) {
      const a = selectedObjectClips[i];
      if (a.enabled === false) continue;
      const as_ = dragState?.clipId === a.id ? dragState.previewStartMs : a.startTimeMs;
      const ad = dragState?.clipId === a.id ? dragState.previewDurationMs : a.durationMs;
      const ae = as_ + Math.max(1, ad);
      for (let j = i + 1; j < selectedObjectClips.length; j++) {
        const b = selectedObjectClips[j];
        if (b.enabled === false) continue;
        const domain = getConflictDomain(a.type);
        if (domain !== getConflictDomain(b.type)) continue;
        const bs = dragState?.clipId === b.id ? dragState.previewStartMs : b.startTimeMs;
        const bd = dragState?.clipId === b.id ? dragState.previewDurationMs : b.durationMs;
        const be = bs + Math.max(1, bd);
        if (as_ < be && bs < ae) { markConflict(a.id, domain); markConflict(b.id, domain); }
      }
    }
    const domainsByClipId = new Map<string, string[]>();
    rawDomainsByClipId.forEach((domains, id) => domainsByClipId.set(id, sortConflictDomains([...domains])));
    return {
      ids: conflictIds,
      domainsByClipId,
      domainLabels: sortConflictDomains([...globalConflictDomains]).map(getConflictDomainLabel),
    };
  }, [selectedObjectClips, dragState]);

  const displayObjectClips = selectedObjectClips;

  // 选中段范围内的 clips（动画设计区只显示这些）
  const segmentScopedClips = useMemo(() => {
    if (selectedSegmentIds.length !== 1) return [];
    const segId = selectedSegmentIds[0];
    return displayObjectClips.filter((c) => c.segmentId === segId);
  }, [displayObjectClips, selectedSegmentIds]);

  // 单选段（用于子组件计算段坐标系）
  const activeSegment = useMemo<AppearSegment | null>(() => {
    if (selectedSegmentIds.length !== 1) return null;
    return effectiveSegments.find((s) => s.id === selectedSegmentIds[0]) ?? null;
  }, [effectiveSegments, selectedSegmentIds]);

  // ── 吸附辅助
  const getSnapCandidates = (activeClipId: string) => {
    const dragged = animations.find((c) => c.id === activeClipId);
    const seg = dragged ? effectiveSegments.find((s) => s.id === dragged.segmentId) : undefined;
    const cands: number[] = seg ? [seg.startMs, seg.endMs] : [0, globalDurationMs];
    for (const c of selectedObjectClips) {
      if (c.id === activeClipId) continue;
      if (seg && c.segmentId !== seg.id) continue;
      cands.push(c.startTimeMs, c.startTimeMs + c.durationMs);
    }
    return cands;
  };

  const snapWithMeta = (valueMs: number, candidates: number[], thresholdMs: number) => {
    let best = valueMs, bestDelta = thresholdMs + 1;
    for (const c of candidates) {
      const d = Math.abs(c - valueMs);
      if (d <= thresholdMs && d < bestDelta) { best = c; bestDelta = d; }
    }
    return { value: best, snapped: bestDelta <= thresholdMs };
  };

  const getCursorSnapCandidates = () => {
    const cands: number[] = activeSegment
      ? [activeSegment.startMs, activeSegment.endMs]
      : [0, globalDurationMs];
    for (const c of selectedObjectClips) cands.push(c.startTimeMs, c.startTimeMs + c.durationMs);
    return cands;
  };

  const getCursorSnapResult = (timeMs: number) => {
    const clamped = Math.max(0, Math.min(globalDurationMs, timeMs));
    const thresholdMs = Math.max(20, Math.round(globalDurationMs * 0.003));
    return snapWithMeta(clamped, getCursorSnapCandidates(), thresholdMs);
  };

  const syncDurationIfNeeded = (clip: AnimationClip) => {
    if (clip.startTimeMs + clip.durationMs > globalDurationMs) {
      setGlobalDurationMs(clip.startTimeMs + clip.durationMs + 1000);
    }
  };

  const ensurePausedForEdit = () => { if (playbackStatus === 'playing') pause(); };

  const startTimeEdit = () => {
    timeEditCancelledRef.current = false;
    setTimeEditValue((currentTimeMs / 1000).toFixed(3));
    setIsTimeEditing(true);
  };
  const commitTimeEdit = (raw: string) => {
    if (!timeEditCancelledRef.current) {
      const parsed = parseFloat(raw);
      if (!isNaN(parsed)) {
        ensurePausedForEdit();
        setCurrentTimeMs(Math.round(Math.max(0, Math.min(globalDurationMs, parsed * 1000))));
      }
    }
    setIsTimeEditing(false);
  };

  const startClipLabelEdit = (clipId: string, effStart: number, effDuration: number, displayWidth: number) => {
    clipLabelCancelledRef.current = false;
    clipLabelEditingRef.current = true;
    clipLabelWidthRef.current = displayWidth;
    clipLabelStartRef.current = (effStart / 1000).toFixed(3);
    clipLabelEndRef.current = ((effStart + effDuration) / 1000).toFixed(3);
    setClipLabelStart(clipLabelStartRef.current);
    setClipLabelEnd(clipLabelEndRef.current);
    setClipLabelEditId(clipId);
  };
  const commitClipLabelEdit = (startVal: string, endVal: string) => {
    if (!clipLabelEditingRef.current) return;
    clipLabelEditingRef.current = false;
    if (!clipLabelCancelledRef.current) {
      const clip = animations.find((c) => c.id === clipLabelEditId);
      if (clip) {
        const rawStartMs = Math.round(parseFloat(startVal) * 1000);
        const rawEndMs = Math.round(parseFloat(endVal) * 1000);
        if (!isNaN(rawStartMs) && !isNaN(rawEndMs) && rawEndMs > rawStartMs) {
          ensurePausedForEdit();
          const seg = effectiveSegments.find((s) => s.id === clip.segmentId);
          let startMs = Math.max(0, rawStartMs);
          let endMs = rawEndMs;
          if (seg) {
            startMs = Math.max(seg.startMs, Math.min(seg.endMs - 1000, startMs));
            endMs = Math.min(seg.endMs, Math.max(startMs + 1000, endMs));
          }
          updateAnimationClip(clip.id, { startTimeMs: startMs, durationMs: Math.max(1000, endMs - startMs) });
        }
      }
    }
    setClipLabelEditId(null);
  };

  const startSegLabelEdit = (segId: string, segStart: number, segEnd: number, displayWidth: number) => {
    segLabelCancelledRef.current = false;
    segLabelEditingRef.current = true;
    segLabelWidthRef.current = displayWidth;
    segLabelStartRef.current = (segStart / 1000).toFixed(3);
    segLabelEndRef.current = (segEnd / 1000).toFixed(3);
    setSegLabelStart(segLabelStartRef.current);
    setSegLabelEnd(segLabelEndRef.current);
    setSegLabelEditId(segId);
  };
  const commitSegLabelEdit = (startVal: string, endVal: string) => {
    if (!segLabelEditingRef.current) return;
    segLabelEditingRef.current = false;
    if (!segLabelCancelledRef.current && selectedObject) {
      const seg = effectiveSegments.find((s) => s.id === segLabelEditId);
      if (seg) {
        const rawStartMs = Math.round(parseFloat(startVal) * 1000);
        const rawEndMs = Math.round(parseFloat(endVal) * 1000);
        if (!isNaN(rawStartMs) && !isNaN(rawEndMs) && rawEndMs > rawStartMs) {
          ensurePausedForEdit();
          const startMs = Math.max(0, Math.min(globalDurationMs - 1000, rawStartMs));
          const endMs = Math.max(startMs + 1000, Math.min(globalDurationMs, rawEndMs));
          updateAppearSegment(selectedObject.id, seg.id, { startMs, endMs });
        }
      }
    }
    setSegLabelEditId(null);
  };

  // 解析"添加动画"应归属的段：优先用单选段；否则取第一段并将其设为选中。
  const resolveSegmentForNewClip = (): AppearSegment | null => {
    if (effectiveSegments.length === 0) return null;
    if (selectedSegmentIds.length === 1) {
      const seg = effectiveSegments.find((s) => s.id === selectedSegmentIds[0]);
      if (seg) return seg;
    }
    const first = effectiveSegments[0];
    if (selectedSegmentIds[0] !== first.id) setSelectedSegmentIds([first.id]);
    return first;
  };

  // 把期望的 start/duration 夹到段范围内
  const clampClipTimingToSegment = (
    seg: AppearSegment,
    desiredStartMs: number,
    desiredDurationMs: number,
  ) => {
    const start = Math.max(seg.startMs, Math.min(seg.endMs - 1, desiredStartMs));
    const maxDur = Math.max(1, seg.endMs - start);
    const dur = Math.max(1, Math.min(desiredDurationMs, maxDur));
    return { startTimeMs: start, durationMs: dur };
  };

  // ── 创建动画片段
  const createClip = (type: 'move' | 'moveAlongPath' | 'shake' | 'fade' | 'scale' | 'rotate') => {
    if (!selectedObject) return;
    ensurePausedForEdit();
    const seg = resolveSegmentForNewClip();
    if (!seg) return;
    const src = selectedObjectAtCurrentTime || selectedObject;
    const timing = clampClipTimingToSegment(seg, currentTimeMs, 1000);
    const base = {
      id: crypto.randomUUID(), objectId: selectedObject.id, type,
      startTimeMs: timing.startTimeMs, durationMs: timing.durationMs,
      easing: 'linear' as const, enabled: true,
      segmentId: seg.id,
    };
    let clip: AnimationClip;
    switch (type) {
      case 'move':
        clip = { ...base, type: 'move', payload: { fromX: src.x, fromY: src.y, toX: src.x + 120, toY: src.y + 80 } };
        break;
      case 'moveAlongPath':
        clip = { ...base, type: 'moveAlongPath', payload: { fromX: src.x, fromY: src.y, control1X: src.x + 40, control1Y: src.y - 120, control2X: src.x + 120, control2Y: src.y - 80, toX: src.x + 160, toY: src.y } };
        break;
      case 'shake':
        clip = { ...base, type: 'shake', payload: { baseX: src.x, baseY: src.y, amplitudeX: 16, amplitudeY: 8, frequency: 6, decay: 1 } };
        break;
      case 'fade':
        clip = { ...base, type: 'fade', payload: { fromOpacity: src.opacity, toOpacity: Math.max(0.1, src.opacity * 0.4) } };
        break;
      case 'scale':
        clip = { ...base, type: 'scale', payload: { fromScaleX: src.scaleX, fromScaleY: src.scaleY, toScaleX: src.scaleX * 1.2, toScaleY: src.scaleY * 1.2 } };
        break;
      case 'rotate':
      default:
        clip = { ...base, type: 'rotate', payload: { fromRotation: src.rotation, toRotation: src.rotation + 90 } };
        break;
    }
    addAnimationClip(clip);
    syncDurationIfNeeded(clip);
    setFlashClipId(clip.id);
    setExpandedClipId(clip.id);
  };

  // ── 预设模板
  const createPresetTemplate = (template: 'fadeIn' | 'bounceIn' | 'moveFadeIn' | 'fadeOut' | 'crossMembrane' | 'endocytosis' | 'moveFadeOut') => {
    if (!selectedObject) return;
    ensurePausedForEdit();
    const seg = resolveSegmentForNewClip();
    if (!seg) return;
    const src = selectedObjectAtCurrentTime || selectedObject;
    const created: AnimationClip[] = [];
    if (template === 'fadeIn') {
      created.push({ id: crypto.randomUUID(), objectId: selectedObject.id, type: 'fade', startTimeMs: currentTimeMs, durationMs: 700, easing: 'ease-out', enabled: true, payload: { fromOpacity: 0, toOpacity: clamp01(src.opacity) } });
    }
    if (template === 'bounceIn') {
      created.push(
        { id: crypto.randomUUID(), objectId: selectedObject.id, type: 'scale', startTimeMs: currentTimeMs, durationMs: 900, easing: 'cubic-bezier(0.2,0.9,0.2,1)', enabled: true, payload: { fromScaleX: src.scaleX * 0.45, fromScaleY: src.scaleY * 0.45, toScaleX: src.scaleX, toScaleY: src.scaleY, keyframes: [{ at: 0.55, scaleX: src.scaleX * 1.12, scaleY: src.scaleY * 1.12 }, { at: 0.78, scaleX: src.scaleX * 0.96, scaleY: src.scaleY * 0.96 }] } },
        { id: crypto.randomUUID(), objectId: selectedObject.id, type: 'fade', startTimeMs: currentTimeMs, durationMs: 500, easing: 'ease-out', enabled: true, payload: { fromOpacity: 0, toOpacity: clamp01(src.opacity) } },
      );
    }
    if (template === 'moveFadeIn') {
      created.push(
        { id: crypto.randomUUID(), objectId: selectedObject.id, type: 'move', startTimeMs: currentTimeMs, durationMs: 800, easing: 'ease-out', enabled: true, payload: { fromX: src.x - 120, fromY: src.y, toX: src.x, toY: src.y } },
        { id: crypto.randomUUID(), objectId: selectedObject.id, type: 'fade', startTimeMs: currentTimeMs, durationMs: 800, easing: 'ease-out', enabled: true, payload: { fromOpacity: 0, toOpacity: clamp01(src.opacity) } },
      );
    }
    // ── 生物学场景模板 ──
    if (template === 'fadeOut') {
      created.push({ id: crypto.randomUUID(), objectId: selectedObject.id, type: 'fade', startTimeMs: currentTimeMs, durationMs: 800, easing: 'ease-in', enabled: true, payload: { fromOpacity: clamp01(src.opacity), toOpacity: 0 } });
    }
    if (template === 'crossMembrane') {
      // 分子穿越膜结构：水平方向短弧穿越（控制点向上拱起）
      created.push({ id: crypto.randomUUID(), objectId: selectedObject.id, type: 'moveAlongPath', startTimeMs: currentTimeMs, durationMs: 1200, easing: 'ease-in-out', enabled: true, payload: { fromX: src.x - 80, fromY: src.y, control1X: src.x - 27, control1Y: src.y - 40, control2X: src.x + 27, control2Y: src.y - 40, toX: src.x + 80, toY: src.y } });
    }
    if (template === 'endocytosis') {
      // 胞吞入胞：物质从细胞外弧形进入细胞内（大弧 + 淡入）
      created.push(
        { id: crypto.randomUUID(), objectId: selectedObject.id, type: 'moveAlongPath', startTimeMs: currentTimeMs, durationMs: 1500, easing: 'ease-in-out', enabled: true, payload: { fromX: src.x, fromY: src.y - 120, control1X: src.x + 87, control1Y: src.y, control2X: src.x + 87, control2Y: src.y + 67, toX: src.x, toY: src.y + 80 } },
        { id: crypto.randomUUID(), objectId: selectedObject.id, type: 'fade', startTimeMs: currentTimeMs, durationMs: 400, easing: 'ease-out', enabled: true, payload: { fromOpacity: 0, toOpacity: clamp01(src.opacity) } },
      );
    }
    if (template === 'moveFadeOut') {
      // 移动消失：向右平移同时淡出
      created.push(
        { id: crypto.randomUUID(), objectId: selectedObject.id, type: 'move', startTimeMs: currentTimeMs, durationMs: 800, easing: 'ease-in', enabled: true, payload: { fromX: src.x, fromY: src.y, toX: src.x + 150, toY: src.y } },
        { id: crypto.randomUUID(), objectId: selectedObject.id, type: 'fade', startTimeMs: currentTimeMs, durationMs: 800, easing: 'ease-in', enabled: true, payload: { fromOpacity: clamp01(src.opacity), toOpacity: 0 } },
      );
    }
    if (created.length === 0) return;
    // 全部 clip 一并夹到段范围内 + 设置 segmentId
    const adjusted = created.map((c) => {
      const t = clampClipTimingToSegment(seg, c.startTimeMs, c.durationMs);
      return { ...c, startTimeMs: t.startTimeMs, durationMs: t.durationMs, segmentId: seg.id };
    });
    for (const c of adjusted) { addAnimationClip(c); syncDurationIfNeeded(c); }
    setFlashClipId(adjusted[adjusted.length - 1].id);
    setExpandedClipId(adjusted[adjusted.length - 1].id);
  };

  const duplicateClip = (clip: AnimationClip) => {
    ensurePausedForEdit();
    const dup = JSON.parse(JSON.stringify(clip)) as AnimationClip;
    dup.id = crypto.randomUUID();
    dup.startTimeMs = clip.startTimeMs + clip.durationMs;
    // 复制需仍归属同一段，并把时间夹到段范围内
    const seg = effectiveSegments.find((s) => s.id === clip.segmentId);
    if (seg) {
      const t = clampClipTimingToSegment(seg, dup.startTimeMs, dup.durationMs);
      dup.startTimeMs = t.startTimeMs;
      dup.durationMs = t.durationMs;
      dup.segmentId = seg.id;
    }
    addAnimationClip(dup);
    syncDurationIfNeeded(dup);
    setFlashClipId(dup.id);
    setExpandedClipId(dup.id);
  };

  // ── 批量操作
  const toggleBatchClipSelection = (clipId: string, checked: boolean) => {
    setBatchSelectedClipIds((prev) =>
      checked ? (prev.includes(clipId) ? prev : [...prev, clipId]) : prev.filter((id) => id !== clipId),
    );
  };

  const applyBatchEdits = () => {
    if (selectedBatchClips.length === 0) return;
    // 开始时刻：跨段选中时忽略
    const rawStart = batchStartInput.trim();
    const hasStart = rawStart.length > 0 && !batchStartDisabled;
    const parsedStart = hasStart ? parseInt(rawStart, 10) : NaN;
    if (hasStart && Number.isNaN(parsedStart)) return;
    const rawDuration = batchDurationInput.trim();
    const hasDuration = rawDuration.length > 0;
    const parsedDuration = hasDuration ? parseInt(rawDuration, 10) : NaN;
    if (hasDuration && Number.isNaN(parsedDuration)) return;
    const hasEasing = batchEasingInput !== '';
    const hasEnabled = batchEnabledInput !== '';
    if (!hasStart && !hasDuration && !hasEasing && !hasEnabled) return;
    const nextStart = hasStart ? Math.max(0, parsedStart) : null;
    const desiredDuration = hasDuration ? clampPositive(parsedDuration, 1000) : null;
    const nextEnabled = hasEnabled ? batchEnabledInput === 'enabled' : null;
    const nextEasing = hasEasing ? batchEasingInput : null;
    ensurePausedForEdit();
    let maxEnd = globalDurationMs, lastId: string | null = null;
    for (const clip of selectedBatchClips) {
      const upd: Partial<AnimationClip> = {};
      const effectiveStart = nextStart !== null ? nextStart : clip.startTimeMs;
      // 时长：若超出所属段范围则铺满该段（从该动画开始时刻到段末尾）
      let effectiveDuration = clip.durationMs;
      if (desiredDuration !== null) {
        const seg = effectiveSegments.find((s) => s.id === clip.segmentId);
        if (seg) {
          const maxDur = Math.max(1, seg.endMs - effectiveStart);
          effectiveDuration = Math.min(desiredDuration, maxDur);
        } else {
          effectiveDuration = desiredDuration;
        }
      }
      if (nextStart !== null && clip.startTimeMs !== nextStart) upd.startTimeMs = nextStart;
      if (effectiveDuration !== clip.durationMs) upd.durationMs = effectiveDuration;
      if (nextEasing && (clip.easing || 'linear') !== nextEasing) upd.easing = nextEasing;
      const clipEnabled = clip.enabled !== false;
      if (nextEnabled !== null && clipEnabled !== nextEnabled) upd.enabled = nextEnabled;
      if (Object.keys(upd).length === 0) continue;
      maxEnd = Math.max(maxEnd, effectiveStart + effectiveDuration);
      updateAnimationClip(clip.id, upd);
      lastId = clip.id;
    }
    if (maxEnd > globalDurationMs) setGlobalDurationMs(maxEnd + 1000);
    if (lastId) setFlashClipId(lastId);
  };

  const autoResolveConflicts = () => {
    if (!selectedObject || conflictMeta.ids.size === 0) return;
    if (dragState) setDragState(null);
    ensurePausedForEdit();
    const enabled = selectedObjectClips.filter((c) => c.enabled !== false);
    if (enabled.length < 2) return;
    const buckets = new Map<string, AnimationClip[]>();
    for (const c of enabled) {
      const d = getConflictDomain(c.type);
      buckets.set(d, [...(buckets.get(d) || []), c]);
    }
    const order = [...CONFLICT_DOMAIN_ORDER, ...[...buckets.keys()].filter((d) => !CONFLICT_DOMAIN_ORDER.includes(d))];
    const nextStartById = new Map<string, number>();
    for (const domain of order) {
      const clips = (buckets.get(domain) || []).sort((a, b) => (a.startTimeMs - b.startTimeMs) || a.id.localeCompare(b.id));
      let end = -Infinity;
      for (const c of clips) {
        const cur = nextStartById.get(c.id) ?? c.startTimeMs;
        const dur = Math.max(1, c.durationMs);
        if (cur < end) { const s = Math.ceil(end); nextStartById.set(c.id, s); end = s + dur; }
        else end = cur + dur;
      }
    }
    if (nextStartById.size === 0) return;
    let maxEnd = globalDurationMs, lastMoved: string | null = null;
    const byId = new Map(selectedObjectClips.map((c) => [c.id, c]));
    nextStartById.forEach((next, id) => {
      const orig = byId.get(id);
      if (!orig || next === orig.startTimeMs) return;
      updateAnimationClip(id, { startTimeMs: next });
      lastMoved = id;
      maxEnd = Math.max(maxEnd, next + Math.max(1, orig.durationMs));
    });
    if (maxEnd > globalDurationMs) setGlobalDurationMs(maxEnd + 1000);
    if (lastMoved) setFlashClipId(lastMoved);
  };

  const sortClipsByStartTime = () => {
    if (segmentScopedClips.length < 2) return;
    const sorted = [...segmentScopedClips].sort((a, b) => a.startTimeMs - b.startTimeMs);
    reorderAnimationClips(sorted.map((c) => c.id));
  };

  // ── 字段更新（按所属段范围 clamp，超出时设置警告）
  const updateClipNumberField = (clip: AnimationClip, field: 'startTimeMs' | 'durationMs', rawValue: string) => {
    ensurePausedForEdit();
    const parsed = parseInt(rawValue, 10);
    if (Number.isNaN(parsed)) return;
    const seg = effectiveSegments.find((s) => s.id === clip.segmentId);
    if (!seg) {
      // 兜底（孤儿 clip 还没绑定段）：保留旧行为
      const next = field === 'durationMs' ? clampPositive(parsed, 1000) : Math.max(0, parsed);
      updateAnimationClip(clip.id, { [field]: next } as Partial<AnimationClip>);
      const end = (field === 'startTimeMs' ? next : clip.startTimeMs) + (field === 'durationMs' ? next : clip.durationMs);
      if (end > globalDurationMs) setGlobalDurationMs(end + 1000);
      return;
    }
    if (field === 'startTimeMs') {
      const desired = Math.max(0, parsed);
      const clampedStart = Math.max(seg.startMs, Math.min(seg.endMs - 1, desired));
      const maxDur = seg.endMs - clampedStart;
      const clampedDur = Math.max(1, Math.min(clip.durationMs, maxDur));
      if (clampedStart !== desired || clampedDur !== clip.durationMs) {
      }
      const updates: Partial<AnimationClip> = { startTimeMs: clampedStart };
      if (clampedDur !== clip.durationMs) updates.durationMs = clampedDur;
      updateAnimationClip(clip.id, updates);
    } else {
      const desired = Math.max(1, parsed);
      const maxDur = Math.max(1, seg.endMs - clip.startTimeMs);
      const clampedDur = Math.max(1000, Math.min(desired, maxDur));
      if (desired < 1000) setClipDurationWarnId(clip.id); else setClipDurationWarnId(null);
      updateAnimationClip(clip.id, { durationMs: clampedDur });
    }
  };

  const coordFields = new Set(['fromX', 'fromY', 'toX', 'toY', 'controlX', 'controlY', 'baseX', 'baseY']);

  const updatePayloadNumberField = (clip: AnimationClip, field: string, rawValue: string) => {
    ensurePausedForEdit();
    const parsed = parseFloat(rawValue);
    if (Number.isNaN(parsed)) return;
    const shouldClampNonNeg = clip.type === 'shake' && ['amplitudeX', 'amplitudeY', 'frequency', 'decay'].includes(field);
    const next =
      clip.type === 'fade' && ['fromOpacity', 'toOpacity'].includes(field) ? clamp01(parsed)
      : shouldClampNonNeg ? Math.max(0, parsed)
      : coordFields.has(field) ? Math.round(parsed)
      : parsed;
    updateAnimationClip(clip.id, { payload: { ...(clip.payload as Record<string, number>), [field]: next } } as Partial<AnimationClip>);
  };

  const updateClipPayload = (clip: AnimationClip, payloadUpdates: Record<string, unknown>) => {
    ensurePausedForEdit();
    updateAnimationClip(clip.id, { payload: { ...(clip.payload as Record<string, unknown>), ...payloadUpdates } } as Partial<AnimationClip>);
  };

  const setClipEasingPreset = (clip: AnimationClip, preset: EasingPresetValue) => {
    ensurePausedForEdit();
    updateAnimationClip(clip.id, { easing: preset });
  };

  const updateClipBezierControlPoint = (clip: AnimationClip, idx: 0 | 1 | 2 | 3, rawValue: string) => {
    const parsed = parseFloat(rawValue);
    if (Number.isNaN(parsed)) return;
    const pts = [...parseEasingControlPoints(clip.easing).points] as [number, number, number, number];
    pts[idx] = idx === 0 || idx === 2 ? clamp01(parsed) : clampBezierY(parsed);
    ensurePausedForEdit();
    updateAnimationClip(clip.id, { easing: buildBezierEasingValue(pts[0], pts[1], pts[2], pts[3]) });
  };

  // ── 时间轴标尺刻度计算 ───────────────────────────────────────
  const rulerIntervalMs = useMemo(() => {
    const trackWidthPx = 600 * (timelineZoom / 100);
    const msPerPx = globalDurationMs / Math.max(1, trackWidthPx);
    const rawIntervalMs = msPerPx * 80;
    const niceIntervals = [100, 200, 250, 500, 1000, 2000, 5000, 10000, 30000];
    return niceIntervals.find((v) => v >= rawIntervalMs) ?? 30000;
  }, [globalDurationMs, timelineZoom]);

  const rulerTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let ms = 0; ms <= globalDurationMs; ms += rulerIntervalMs) {
      ticks.push(ms);
    }
    return ticks;
  }, [globalDurationMs, rulerIntervalMs]);

  const elementRulerTicks = useMemo(() => {
    const half = rulerIntervalMs / 2;
    const ticks: number[] = [];
    for (let ms = half; ms < globalDurationMs; ms += rulerIntervalMs) {
      ticks.push(Math.round(ms));
    }
    return ticks;
  }, [globalDurationMs, rulerIntervalMs]);

  // 动画时间轴小刻度（1/5 间距，跳过动画大刻度位置即 rulerIntervalMs 整数倍）
  const minorRulerTicks = useMemo(() => {
    const step = Math.round(rulerIntervalMs / 5);
    const ticks: number[] = [];
    for (let ms = step; ms < globalDurationMs; ms += step) {
      if (ms % rulerIntervalMs !== 0) ticks.push(ms);
    }
    return ticks;
  }, [globalDurationMs, rulerIntervalMs]);

  // 元素时间轴小刻度（1/5 间距，跳过元素大刻度位置即半间距倍数）
  const elementMinorRulerTicks = useMemo(() => {
    const half = rulerIntervalMs / 2;
    const step = Math.round(rulerIntervalMs / 5);
    const elementMajorSet = new Set<number>();
    for (let ms = half; ms < globalDurationMs; ms += rulerIntervalMs) {
      elementMajorSet.add(Math.round(ms));
    }
    const ticks: number[] = [];
    for (let ms = step; ms < globalDurationMs; ms += step) {
      if (!elementMajorSet.has(Math.round(ms))) ticks.push(Math.round(ms));
    }
    return ticks;
  }, [globalDurationMs, rulerIntervalMs]);

  const seekByTrackClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (clipDragHappenedRef.current) { clipDragHappenedRef.current = false; return; }
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    ensurePausedForEdit();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    // 段坐标系：track 0~100% 映射到段范围；无单选段时退回全局
    const segLo = activeSegment?.startMs ?? 0;
    const segHi = activeSegment?.endMs ?? globalDurationMs;
    const targetMs = Math.round(segLo + ratio * Math.max(1, segHi - segLo));
    const snap = getCursorSnapResult(targetMs);
    setCurrentTimeMs(snap.value);
    setCursorSnapGuideMs(snap.snapped ? snap.value : null);
  };

  // 总时间轴 scrub：mousedown 起点定位 + 拖拽持续更新
  const startOverallScrub = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const trackEl = overallTrackRef.current;
    if (!trackEl) return;
    ensurePausedForEdit();
    setIsCursorDragging(true);
    const apply = (clientX: number) => {
      const rect = trackEl.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const snap = getCursorSnapResult(Math.round(ratio * globalDurationMs));
      setCurrentTimeMs(snap.value);
      setCursorSnapGuideMs(snap.snapped ? snap.value : null);
    };
    apply(event.clientX);
    const onMove = (e: MouseEvent) => apply(e.clientX);
    const onUp = () => {
      setIsCursorDragging(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    event.preventDefault();
  };

  // 元素出现段拖拽：以 segment 为单位
  const startWindowDrag = (
    mode: 'move' | 'resize-start' | 'resize-end',
    segment: AppearSegment,
    event: React.MouseEvent<HTMLDivElement>,
  ) => {
    if (event.button !== 0) return;
    if (!selectedObject) return;
    const trackEl = elementTrackRef.current;
    if (!trackEl) return;
    const rect = trackEl.getBoundingClientRect();
    if (rect.width <= 0) return;
    const startMs = segment.startMs;
    const endMs = segment.endMs;
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const pointerMs = ratio * globalDurationMs;
    const offsetMs = mode === 'resize-end' ? pointerMs - endMs : pointerMs - startMs;
    // 计算相邻段边界（不含正在拖拽的段自身）
    const others = effectiveSegments.filter((s) => s.id !== segment.id);
    let boundLeftMs = 0;
    let boundRightMs = globalDurationMs;
    for (const o of others) {
      if (o.endMs <= startMs && o.endMs > boundLeftMs) boundLeftMs = o.endMs;
      if (o.startMs >= endMs && o.startMs < boundRightMs) boundRightMs = o.startMs;
    }
    ensurePausedForEdit();
    setWindowDragState({
      mode,
      objectId: selectedObject.id,
      segmentId: segment.id,
      offsetMs,
      fixedStartMs: startMs,
      fixedEndMs: endMs,
      previewStartMs: startMs,
      previewEndMs: endMs,
      boundLeftMs,
      boundRightMs,
    });
    event.preventDefault();
    event.stopPropagation();
  };

  // ── 拖拽逻辑
  const startClipDrag = (clip: AnimationClip, event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const trackEl = clipTrackRefs.current.get(clip.id);
    if (!trackEl) return;
    const rect = trackEl.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    // 轨道 0~100% 映射到段范围，offset 必须在段坐标系下计算
    const seg = effectiveSegments.find((s) => s.id === clip.segmentId);
    const segLo = seg?.startMs ?? 0;
    const segHi = seg?.endMs ?? globalDurationMs;
    const pointerMs = segLo + ratio * Math.max(1, segHi - segLo);
    ensurePausedForEdit();
    setDragState({ clipId: clip.id, mode: 'move', offsetMs: pointerMs - clip.startTimeMs, fixedEndMs: clip.startTimeMs + clip.durationMs, previewStartMs: clip.startTimeMs, previewDurationMs: clip.durationMs, snapGuideMs: null });
    event.preventDefault(); event.stopPropagation();
  };
  const startClipResizeStart = (clip: AnimationClip, event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.stopPropagation(); // 阻止冒泡到父级 tl-track-fill 触发 startClipDrag
    const trackEl = clipTrackRefs.current.get(clip.id);
    if (!trackEl) return;
    const rect = trackEl.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const seg = effectiveSegments.find((s) => s.id === clip.segmentId);
    const segLo = seg?.startMs ?? 0;
    const segHi = seg?.endMs ?? globalDurationMs;
    const pointerMs = segLo + ratio * Math.max(1, segHi - segLo);
    ensurePausedForEdit();
    setDragState({ clipId: clip.id, mode: 'resize-start', offsetMs: pointerMs - clip.startTimeMs, fixedEndMs: clip.startTimeMs + clip.durationMs, previewStartMs: clip.startTimeMs, previewDurationMs: clip.durationMs, snapGuideMs: null });
    event.preventDefault();
  };
  const startClipResizeEnd = (clip: AnimationClip, event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.stopPropagation(); // 阻止冒泡到父级 tl-track-fill 触发 startClipDrag
    const trackEl = clipTrackRefs.current.get(clip.id);
    if (!trackEl) return;
    const rect = trackEl.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const seg = effectiveSegments.find((s) => s.id === clip.segmentId);
    const segLo = seg?.startMs ?? 0;
    const segHi = seg?.endMs ?? globalDurationMs;
    const pointerMs = segLo + ratio * Math.max(1, segHi - segLo);
    ensurePausedForEdit();
    setDragState({ clipId: clip.id, mode: 'resize-end', offsetMs: pointerMs - (clip.startTimeMs + clip.durationMs), fixedEndMs: clip.startTimeMs + clip.durationMs, previewStartMs: clip.startTimeMs, previewDurationMs: clip.durationMs, snapGuideMs: null });
    event.preventDefault();
  };

  // ── 副作用
  useEffect(() => {
    if (!flashClipId) return;
    const el = clipCardRefs.current.get(flashClipId);
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const t = window.setTimeout(() => setFlashClipId(null), 1200);
    return () => window.clearTimeout(t);
  }, [flashClipId]);

  useEffect(() => {
    setBatchSelectedClipIds((prev) => {
      if (prev.length === 0) return prev;
      const valid = new Set(selectedObjectClips.map((c) => c.id));
      const filtered = prev.filter((id) => valid.has(id));
      return filtered.length === prev.length ? prev : filtered;
    });
  }, [selectedObjectClips]);

  useEffect(() => {
    if (!cursorSnapGuideMs) return;
    const t = window.setTimeout(() => setCursorSnapGuideMs(null), 350);
    return () => window.clearTimeout(t);
  }, [cursorSnapGuideMs]);

  useEffect(() => {
    if (!isCursorDragging) return;
    const stop = () => setIsCursorDragging(false);
    window.addEventListener('mouseup', stop);
    window.addEventListener('touchend', stop);
    return () => { window.removeEventListener('mouseup', stop); window.removeEventListener('touchend', stop); };
  }, [isCursorDragging]);

  useEffect(() => {
    if (!dragState) return;
    const handleMove = (e: MouseEvent) => {
      clipDragHappenedRef.current = true;
      const trackEl = clipTrackRefs.current.get(dragState.clipId);
      if (!trackEl) return;
      const rect = trackEl.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      // 段坐标系：track 0~100% 映射到段范围（拖拽 + 硬阻挡）
      const draggingClip = animations.find((c) => c.id === dragState.clipId);
      const seg = draggingClip ? effectiveSegments.find((s) => s.id === draggingClip.segmentId) : undefined;
      const segLo = seg?.startMs ?? 0;
      const segHi = seg?.endMs ?? globalDurationMs;
      const segRange = Math.max(1, segHi - segLo);
      const pointerMs = segLo + ratio * segRange;
      const snapThMs = Math.max(1, (segRange * SNAP_DISTANCE_PX) / rect.width);
      const cands = getSnapCandidates(dragState.clipId);
      const shouldSnap = !e.shiftKey;
      const applySnap = (v: number) => shouldSnap ? snapWithMeta(v, cands, snapThMs) : { value: v, snapped: false };
      if (dragState.mode === 'move') {
        const raw = Math.max(segLo, Math.min(segHi - dragState.previewDurationMs, Math.round(pointerMs - dragState.offsetMs)));
        const byStart = applySnap(raw);
        const byEnd = Math.max(segLo, applySnap(raw + dragState.previewDurationMs).value - dragState.previewDurationMs);
        const useStart = Math.abs(byStart.value - raw) <= Math.abs(byEnd - raw);
        let next = useStart ? byStart.value : byEnd;
        next = Math.max(segLo, Math.min(segHi - dragState.previewDurationMs, next));
        const guide = useStart ? (byStart.snapped ? byStart.value : null) : (applySnap(raw + dragState.previewDurationMs).snapped ? applySnap(raw + dragState.previewDurationMs).value : null);
        setDragState((p) => p ? { ...p, previewStartMs: next, snapGuideMs: guide } : p);
      } else if (dragState.mode === 'resize-start') {
        const snapped = applySnap(Math.round(pointerMs - dragState.offsetMs));
        const nextStart = Math.max(segLo, Math.min(snapped.value, Math.max(segLo, dragState.fixedEndMs - 1000)));
        setDragState((p) => p ? { ...p, previewStartMs: nextStart, previewDurationMs: Math.max(1000, dragState.fixedEndMs - nextStart), snapGuideMs: snapped.snapped ? snapped.value : null } : p);
      } else {
        const snapped = applySnap(Math.round(pointerMs - dragState.offsetMs));
        const nextEnd = Math.max(dragState.previewStartMs + 1000, Math.min(segHi, snapped.value));
        setDragState((p) => p ? { ...p, previewDurationMs: Math.max(1000, nextEnd - dragState.previewStartMs), snapGuideMs: snapped.snapped ? snapped.value : null } : p);
      }
    };
    const handleUp = () => {
      const clip = animations.find((c) => c.id === dragState.clipId);
      if (clip) {
        const ns = Math.max(0, dragState.previewStartMs), nd = Math.max(1000, dragState.previewDurationMs);
        if (ns !== clip.startTimeMs || nd !== clip.durationMs) {
          ensurePausedForEdit();
          updateAnimationClip(clip.id, { startTimeMs: ns, durationMs: nd });
          if (ns + nd > globalDurationMs) setGlobalDurationMs(ns + nd + 1000);
        }
      }
      setDragState(null);
      setTimeout(() => { clipDragHappenedRef.current = false; }, 0);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => { window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp); };
  }, [animations, dragState, globalDurationMs, selectedObjectClips, setGlobalDurationMs, updateAnimationClip, playbackStatus, pause, effectiveSegments]);

  // 元素出现段拖拽：mousemove + mouseup（带相邻段硬阻挡）
  useEffect(() => {
    if (!windowDragState) return;
    const handleMove = (e: MouseEvent) => {
      windowDragMovedRef.current = true;
      const trackEl = elementTrackRef.current;
      if (!trackEl) return;
      const rect = trackEl.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const pointerMs = Math.round(ratio * globalDurationMs);
      setWindowDragState((p) => {
        if (!p) return p;
        const lo = p.boundLeftMs;
        const hi = p.boundRightMs;
        if (p.mode === 'move') {
          const len = p.fixedEndMs - p.fixedStartMs;
          const rawStart = Math.round(pointerMs - p.offsetMs);
          const ns = Math.max(lo, Math.min(hi - len, rawStart));
          return { ...p, previewStartMs: ns, previewEndMs: ns + len };
        }
        if (p.mode === 'resize-start') {
          const ns = Math.max(lo, Math.min(p.previewEndMs - 1000, Math.round(pointerMs - p.offsetMs)));
          return { ...p, previewStartMs: ns };
        }
        const ne = Math.max(p.previewStartMs + 1000, Math.min(hi, Math.round(pointerMs - p.offsetMs)));
        return { ...p, previewEndMs: ne };
      });
    };
    const handleUp = () => {
      const next = windowDragState;
      windowDragMovedRef.current = false;
      if (next) {
        const ns = Math.max(0, Math.min(globalDurationMs, next.previewStartMs));
        const ne = Math.max(ns + 1000, Math.min(globalDurationMs, next.previewEndMs));
        const target = objects.find((o) => o.id === next.objectId);
        const seg = target?.appearSegments?.find((s) => s.id === next.segmentId);
        if (target && seg && (seg.startMs !== ns || seg.endMs !== ne)) {
          // 整体移动时传入平移量，让内部 clip 随段平移；resize 时不传（clamp 逻辑）
          const translateClipsBy = next.mode === 'move' ? ns - seg.startMs : undefined;
          updateAppearSegment(next.objectId, next.segmentId, { startMs: ns, endMs: ne }, translateClipsBy);
        }
      }
      setWindowDragState(null);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [windowDragState, globalDurationMs, objects, updateAppearSegment]);

  // 关闭添加菜单（点击外部）
  useEffect(() => {
    if (!showAddMenu) return;
    const handler = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) setShowAddMenu(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [showAddMenu]);

  // 关闭复制动画对话框（点击外部）
  useEffect(() => {
    if (!showCopyDialog) return;
    const handler = (e: MouseEvent) => {
      if (copyDialogRef.current && !copyDialogRef.current.contains(e.target as Node)) {
        setShowCopyDialog(false);
        setCopyTargetIds([]);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [showCopyDialog]);

  // 关闭批量修改弹窗（点击外部）
  useEffect(() => {
    if (!showBatchPanel) return;
    const handler = (e: MouseEvent) => {
      if (batchPanelRef.current && !batchPanelRef.current.contains(e.target as Node)) {
        setShowBatchPanel(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [showBatchPanel]);

  // 关闭"增加片段"弹窗（点击外部）
  useEffect(() => {
    if (!showAddSegmentDialog) return;
    const handler = (e: MouseEvent) => {
      if (addSegmentDialogRef.current && !addSegmentDialogRef.current.contains(e.target as Node)) {
        setShowAddSegmentDialog(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [showAddSegmentDialog]);

  // 关闭"删除片段"二次确认（点击外部）
  useEffect(() => {
    if (!showDeleteSegmentConfirm) return;
    const handler = (e: MouseEvent) => {
      if (deleteSegmentConfirmRef.current && !deleteSegmentConfirmRef.current.contains(e.target as Node)) {
        setShowDeleteSegmentConfirm(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [showDeleteSegmentConfirm]);

  // 动画列表手动拖拽排序
  useEffect(() => {
    if (!clipListDrag) return;
    const onMove = (e: MouseEvent) => {
      let newToIndex = clipListDrag.fromIndex;
      let found = false;
      for (let i = 0; i < segmentScopedClips.length; i++) {
        const el = clipCardRefs.current.get(segmentScopedClips[i].id);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (e.clientY < rect.top + rect.height / 2) { newToIndex = i; found = true; break; }
      }
      if (!found) newToIndex = segmentScopedClips.length - 1;
      if (newToIndex !== clipListDrag.toIndex) setClipListDrag((prev) => prev ? { ...prev, toIndex: newToIndex } : null);
    };
    const onUp = () => {
      if (clipListDrag.fromIndex !== clipListDrag.toIndex) {
        const newOrder = segmentScopedClips.map((c) => c.id);
        const [moved] = newOrder.splice(clipListDrag.fromIndex, 1);
        newOrder.splice(clipListDrag.toIndex, 0, moved);
        reorderAnimationClips(newOrder);
      }
      setClipListDrag(null);
      setTimeout(() => { clipDragHappenedRef.current = false; }, 0);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [clipListDrag, segmentScopedClips, reorderAnimationClips]);

  // 点击下拉容器外部时收起下拉
  useEffect(() => {
    if (!batchEasingDropOpen && !batchStateDropOpen) return;
    const handler = (e: MouseEvent) => {
      if (batchEasingDropOpen && batchEasingDropRef.current && !batchEasingDropRef.current.contains(e.target as Node)) {
        setBatchEasingDropOpen(false);
      }
      if (batchStateDropOpen && batchStateDropRef.current && !batchStateDropRef.current.contains(e.target as Node)) {
        setBatchStateDropOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [batchEasingDropOpen, batchStateDropOpen]);

  clipLabelCommitRef.current = commitClipLabelEdit;
  segLabelCommitRef.current = commitSegLabelEdit;

  useEffect(() => {
    if (!clipLabelEditId) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (clipLabelSpanRef.current && !clipLabelSpanRef.current.contains(e.target as Node)) {
        clipLabelCommitRef.current(clipLabelStartRef.current, clipLabelEndRef.current);
      }
    };
    document.addEventListener('mousedown', handleMouseDown, { capture: true });
    return () => document.removeEventListener('mousedown', handleMouseDown, { capture: true });
  }, [clipLabelEditId]);

  useEffect(() => {
    if (!segLabelEditId) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (segLabelSpanRef.current && !segLabelSpanRef.current.contains(e.target as Node)) {
        segLabelCommitRef.current(segLabelStartRef.current, segLabelEndRef.current);
      }
    };
    document.addEventListener('mousedown', handleMouseDown, { capture: true });
    return () => document.removeEventListener('mousedown', handleMouseDown, { capture: true });
  }, [segLabelEditId]);

  // 同步当前展开的 move/moveAlongPath 片段到 store，供画布路径叠加层使用
  useEffect(() => {
    if (!expandedClipId) {
      setExpandedAnimationClipId(null);
      return;
    }
    const clip = animations.find((a) => a.id === expandedClipId);
    if (clip?.type === 'move' || clip?.type === 'moveAlongPath') {
      setExpandedAnimationClipId(expandedClipId);
    } else {
      setExpandedAnimationClipId(null);
    }
  }, [expandedClipId, animations, setExpandedAnimationClipId]);

  const cursorPercent = `${Math.max(0, Math.min(100, (currentTimeMs / Math.max(1, globalDurationMs)) * 100))}%`;
  const cursorTimeLabel = `${(currentTimeMs / 1000).toFixed(2)}s`;

  // ── 渲染 ─────────────────────────────────────────────────────

  return (
    <section className="tl-panel" ref={panelRef}>

      {/* ── 行 1：动画时间轴（顶部） ── */}
      <div className="tl-overall-row">
        <span className="tl-overall-label">动画时间轴</span>
        <div
          className="tl-overall-track"
          ref={overallTrackRef}
          onMouseDown={startOverallScrub}
        >
          {minorRulerTicks.map((ms) => (
            <div key={ms} className="tl-overall-minor-tick" style={{ left: `${globalDurationMs > 0 ? (ms / globalDurationMs) * 100 : 0}%` }} />
          ))}
          {rulerTicks.map((ms) => {
            const pct = globalDurationMs > 0 ? (ms / globalDurationMs) * 100 : 0;
            return (
              <div key={ms} className="tl-overall-tick" style={{ left: `${pct}%` }}>
                <div className="tl-overall-tick-line" />
                <span
                  className="tl-overall-tick-label"
                  style={ms === 0 ? { transform: 'translateX(2px)' } : undefined}
                >
                  {ms >= 1000 ? `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)}s` : `${ms}ms`}
                </span>
              </div>
            );
          })}
          <div className="tl-overall-playhead" style={{ left: cursorPercent }} />
          {isCursorDragging && (
            <div className="tl-overall-badge" style={{ left: cursorPercent }}>
              {cursorTimeLabel}
            </div>
          )}
        </div>
        <div className="tl-row-ctrl">
          {isTimeEditing ? (
            <input
              className="tl-time-input tl-input-nospin"
              type="number"
              value={timeEditValue}
              min={0}
              max={globalDurationMs / 1000}
              step={0.001}
              onChange={(e) => setTimeEditValue(e.target.value)}
              onBlur={(e) => commitTimeEdit(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') { timeEditCancelledRef.current = true; e.currentTarget.blur(); }
              }}
              autoFocus
              onFocus={(e) => e.target.select()}
            />
          ) : (
            <span className="tl-time-display" onClick={startTimeEdit} data-tooltip="点击之后输入想要跳转的时刻">
              {(currentTimeMs / 1000).toFixed(3)}s
            </span>
          )}
          <span className="tl-row-divider" />
          <span className="tl-label">时长/ms</span>
          <input
            className="tl-input-sm tl-input-nospin"
            type="number"
            min={1000}
            value={globalDurationMs}
            onChange={(e) => { ensurePausedForEdit(); setGlobalDurationMs(parseInt(e.target.value || '1000', 10)); }}
            style={{ width: 50 }}
          />
        </div>
      </div>

      {/* ── 行 2：元素分布轴 ── */}
      <div className="tl-overall-thumbs-row">
        <span className="tl-overall-label">元素分布轴</span>
        <div className="tl-overall-thumbs">
          {distMarkers.map((m) => (
            <div
              key={m.timeMs}
              className="tl-dist-marker"
              style={{ left: `${m.leftPct}%`, backgroundColor: m.color }}
              onMouseEnter={(e) => openDistPopup(m.timeMs, e.currentTarget)}
              onMouseLeave={scheduleHideDistPopup}
            >
              {/* 三角旗作为 marker 子元素，与 marker 同坐标系，精确对齐 */}
              <div
                className="tl-dist-tri-flag"
                style={{ borderTopColor: m.color }}
                onMouseEnter={(e) => { cancelHideDistPopup(); openDistPopup(m.timeMs, e.currentTarget.parentElement as HTMLElement); }}
                onMouseLeave={scheduleHideDistPopup}
              />
              {m.elements.length > 1 && (
                <span className="tl-dist-marker-count">{m.elements.length}</span>
              )}
              {m.clipCount > m.elements.length && (
                <span className="tl-dist-marker-clip-count">{m.clipCount}</span>
              )}
            </div>
          ))}
          <div className="tl-dist-playhead" style={{ left: cursorPercent }} />
        </div>
        <span className="tl-dist-count">
          {distMarkers.length > 0 ? (() => {
            const totalElements = new Set(distMarkers.flatMap((m) => m.elements.map((e) => e.id))).size;
            const totalClips = distMarkers.reduce((sum, m) => sum + m.clipCount, 0);
            return `${totalElements} 个元素 ${totalClips} 个动画`;
          })() : ''}
        </span>
      </div>

      {/* 元素分布轴悬浮弹窗：portal 至 document.body，完全脱离组件树的 overflow/transform 影响 */}
      {distPopup && (() => {
        const m = distMarkers.find((x) => x.timeMs === distPopup.timeMs);
        if (!m) return null;
        return createPortal(
          <div
            className="tl-dist-popup"
            style={{ left: distPopup.x, top: distPopup.y }}
            onMouseEnter={cancelHideDistPopup}
            onMouseLeave={scheduleHideDistPopup}
          >
            <div className="tl-dist-popup-time">{(m.timeMs / 1000).toFixed(2)}s</div>
            {m.elements.map((el) => (
              <div
                key={el.id}
                className="tl-dist-popup-item"
                onClick={() => { selectObject(el.id); setDistPopup(null); }}
              >
                <span>{el.name}</span>
                <span className="tl-dist-popup-clip-count">{el.clipCount} 个动画</span>
              </div>
            ))}
          </div>,
          document.body,
        );
      })()}

      {/* ── 第二大行：元素时间轴区块（仅单选元素时显示） ── */}
      {selectedObject && selectedIds.length === 1 && (() => {
        const safeT = Math.max(1, globalDurationMs);
        return (
          <>
          <div className="tl-element-track-row">

            {/* 左列：标签 */}
            <span className="tl-overall-label">元素时间轴</span>

            {/* 中列：轨道（多段渲染） */}
            <div
              className="tl-element-track"
              ref={elementTrackRef}
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setSelectedSegmentIds([]);
              }}
            >
              {effectiveSegments.map((seg, idx) => {
                const isDragging = !!windowDragState
                  && windowDragState.objectId === selectedObject.id
                  && windowDragState.segmentId === seg.id;
                const segStart = isDragging ? windowDragState!.previewStartMs : seg.startMs;
                const segEnd = isDragging ? windowDragState!.previewEndMs : seg.endMs;
                const leftPct = `${Math.max(0, Math.min(100, (segStart / safeT) * 100))}%`;
                const widthPct = `${Math.max(0, Math.min(100, ((segEnd - segStart) / safeT) * 100))}%`;
                const color = SEGMENT_COLORS[idx % SEGMENT_COLORS.length];
                const isSelected = selectedSegmentIds.includes(seg.id);
                const fillStyle = {
                  '--seg-color': color,
                  left: leftPct,
                  width: widthPct,
                  background: hexAlpha(color, 0.25),
                  borderLeft: `1px solid ${color}`,
                  borderRight: `1px solid ${color}`,
                  zIndex: isSelected ? 2 : 1,
                } as CSSProperties;
                const handleBg = hexAlpha(color, 0.7);
                const handleLStyle: CSSProperties = { background: handleBg, left: -1 };
                const handleRStyle: CSSProperties = { background: handleBg, right: -1 };
                return (
                  <div
                    key={seg.id}
                    className={`tl-element-window${isDragging ? ' is-dragging' : ''}${isSelected ? ' is-selected' : ''}`}
                    style={fillStyle}
                    onMouseDown={(e) => { startWindowDrag('move', seg, e); }}
                    onClick={(e) => {
                      // detail===1：精确匹配单击（或双击的第一次点击）
                      // detail===2：双击的第二次 click，跳过，避免重复切换
                      if (e.detail !== 1) return;
                      // 点击标签区域不切换选中，避免双击编辑标签时产生闪烁
                      if ((e.target as HTMLElement).closest('.tl-element-window-label')) return;
                      const additive = e.shiftKey || e.ctrlKey || e.metaKey;
                      setSelectedSegmentIds((prev) => {
                        if (additive) return prev.includes(seg.id) ? prev.filter((id) => id !== seg.id) : [...prev, seg.id];
                        return prev.includes(seg.id) ? [] : [seg.id];
                      });
                    }}
                  >
                    <div
                      className="tl-element-handle-l"
                      style={handleLStyle}
                      onMouseDown={(e) => { startWindowDrag('resize-start', seg, e); }}
                      data-tooltip="拖动以调整片段起点，片段时长不小于1s"
                    />
                    <div
                      className="tl-element-handle-r"
                      style={handleRStyle}
                      onMouseDown={(e) => { startWindowDrag('resize-end', seg, e); }}
                      data-tooltip="拖动以调整片段终点，片段时长不小于1s"
                    />
                    {segLabelEditId === seg.id ? (
                      <span ref={segLabelSpanRef} className="tl-element-window-label"
                        style={{ pointerEvents: 'auto', display: 'inline-flex', alignItems: 'center', width: segLabelWidthRef.current ?? undefined }}>
                        <input
                          className="tl-label-time-input tl-input-nospin"
                          type="number" step={0.001}
                          style={{ flex: 1, width: 'auto', minWidth: 0 }}
                          value={segLabelStart}
                          onChange={(e) => { segLabelStartRef.current = e.target.value; setSegLabelStart(e.target.value); }}
                          onMouseDown={(e) => e.stopPropagation()}
                          onBlur={(e) => {
                            if (e.currentTarget.parentElement?.contains(e.relatedTarget as Node)) return;
                            commitSegLabelEdit(e.target.value, segLabelEndRef.current);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur();
                            if (e.key === 'Escape') { segLabelCancelledRef.current = true; e.currentTarget.blur(); }
                          }}
                          autoFocus onFocus={(e) => e.target.select()}
                        />s ~ <input
                          className="tl-label-time-input tl-input-nospin"
                          type="number" step={0.001}
                          style={{ flex: 1, width: 'auto', minWidth: 0 }}
                          value={segLabelEnd}
                          onChange={(e) => { segLabelEndRef.current = e.target.value; setSegLabelEnd(e.target.value); }}
                          onMouseDown={(e) => e.stopPropagation()}
                          onBlur={(e) => {
                            if (e.currentTarget.parentElement?.contains(e.relatedTarget as Node)) return;
                            commitSegLabelEdit(segLabelStartRef.current, e.target.value);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur();
                            if (e.key === 'Escape') { segLabelCancelledRef.current = true; e.currentTarget.blur(); }
                          }}
                          onFocus={(e) => e.target.select()}
                        />s
                      </span>
                    ) : (
                      <span
                        className="tl-element-window-label"
                        style={{ pointerEvents: 'auto' }}
                        data-tooltip="双击时间标签进行编辑，片段时长不小于1s"
                        onDoubleClick={(e) => { e.stopPropagation(); e.preventDefault(); startSegLabelEdit(seg.id, segStart, segEnd, (e.currentTarget as HTMLElement).offsetWidth); }}
                      >
                        {(segStart / 1000).toFixed(3)}s ~ {(segEnd / 1000).toFixed(3)}s
                      </span>
                    )}
                  </div>
                );
              })}
              {elementMinorRulerTicks.map((ms) => (
                <div key={ms} className="tl-element-minor-tick" style={{ left: `${(ms / safeT) * 100}%` }} />
              ))}
              {elementRulerTicks.map((ms) => (
                <div key={ms} className="tl-element-ruler-tick" style={{ left: `${(ms / safeT) * 100}%` }}>
                  <div className="tl-element-ruler-tick-line" />
                  <span className="tl-element-ruler-tick-label">
                    {ms >= 1000 ? `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)}s` : `${ms}ms`}
                  </span>
                </div>
              ))}
              <span className="tl-element-tick tl-element-tick-start">0s</span>
              <span className="tl-element-tick tl-element-tick-end">
                {(globalDurationMs / 1000).toFixed(globalDurationMs % 1000 === 0 ? 0 : 1)}s
              </span>
              <div className="tl-element-playhead" style={{ left: cursorPercent }} />
            </div>

            {/* 右列 行1：操作按钮（增加/删除片段 + 添加动画） */}
            <div className="tl-row-ctrl">
              {selectedSegmentIds.length === 0 ? (
                <div style={{ position: 'relative' }} ref={addSegmentDialogRef}>
                  <button
                    className={`tl-btn${showAddSegmentDialog ? ' is-active' : ''}`}
                    disabled={!defaultNewSegmentRange}
                    data-tooltip={defaultNewSegmentRange ? '为当前元素增加时间片段' : '没有可用的空闲时间区间'}
                    onClick={() => (showAddSegmentDialog ? setShowAddSegmentDialog(false) : openAddSegmentDialog())}
                  >
                    增加片段
                  </button>
                  {showAddSegmentDialog && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 'calc(-100% - 4px)', zIndex: 200,
                      background: 'var(--panel-bg)', border: '1px solid var(--border-color)',
                      borderRadius: 6, padding: '6px 8px',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.25)', marginTop: 4,
                      display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>起始时刻/ms</span>
                        <input
                          type="number" min={0} max={globalDurationMs}
                          value={addSegStartInput}
                          onChange={(e) => setAddSegStartInput(e.target.value)}
                          style={{ flex: 1, minWidth: 0, height: 24, fontSize: 12, padding: '0 4px', border: '1px solid var(--border-color)', borderRadius: 4, background: 'var(--bg-color)', color: 'var(--text-main)' }}
                        />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>结束时刻/ms</span>
                        <input
                          type="number" min={0} max={globalDurationMs}
                          value={addSegEndInput}
                          onChange={(e) => setAddSegEndInput(e.target.value)}
                          style={{ flex: 1, minWidth: 0, height: 24, fontSize: 12, padding: '0 4px', border: '1px solid var(--border-color)', borderRadius: 4, background: 'var(--bg-color)', color: 'var(--text-main)' }}
                        />
                      </div>
                      {addSegmentInputError && (
                        <div style={{ fontSize: 11, color: '#ef4444' }}>{addSegmentInputError}</div>
                      )}
                      <button
                        disabled={!!addSegmentInputError}
                        onClick={submitAddSegment}
                        style={{
                          width: '100%', height: 24, padding: 0,
                          background: addSegmentInputError ? 'var(--bg-color)' : 'var(--primary-color)',
                          color: addSegmentInputError ? 'var(--text-muted)' : '#fff',
                          border: addSegmentInputError ? '1px solid var(--border-color)' : 'none',
                          borderRadius: 4, cursor: addSegmentInputError ? 'not-allowed' : 'pointer',
                          fontSize: 12,
                        }}
                      >确认</button>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ position: 'relative' }} ref={deleteSegmentConfirmRef}>
                  <button
                    className={`tl-btn${showDeleteSegmentConfirm ? ' is-active' : ''}`}
                    data-tooltip="删除选中的时间片段（连同其内动画）"
                    onClick={() => setShowDeleteSegmentConfirm((p) => !p)}
                  >
                    删除片段{selectedSegmentIds.length > 1 ? ` (${selectedSegmentIds.length})` : ''}
                  </button>
                  {showDeleteSegmentConfirm && (
                    <div style={{
                      position: 'absolute', top: '100%', right: 0, zIndex: 200,
                      background: 'var(--panel-bg)', border: '1px solid var(--border-color)',
                      borderRadius: 6, padding: 10,
                      boxShadow: '0 4px 16px rgba(0,0,0,0.25)', marginTop: 4,
                      whiteSpace: 'nowrap',
                    }}>
                      <div style={{ fontSize: 12, color: 'var(--text-main)', marginBottom: 8 }}>
                        确认删除选中的 {selectedSegmentIds.length} 个时间片段？
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                          归属这些片段的动画将一并删除。
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="tl-btn tl-btn-sm"
                          style={{ flex: 1 }}
                          onClick={() => setShowDeleteSegmentConfirm(false)}
                        >
                          取消
                        </button>
                        <button
                          className="tl-btn tl-btn-sm"
                          onClick={submitDeleteSegments}
                          style={{ flex: 1, background: '#ef4444', color: '#fff', border: 'none' }}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="tl-add-wrap" ref={addMenuRef}>
                <button className="tl-add-btn" onClick={() => setShowAddMenu((p) => !p)}>添加动画</button>
                {showAddMenu && (
                  <div className="tl-add-menu">
                    <div className="tl-add-menu-tabs">
                      {(['basic', 'template'] as const).map((tab) => {
                        const label = { basic: '基础动画', template: '通用模板' }[tab];
                        return (
                          <button
                            key={tab}
                            className={`tl-add-menu-tab${addMenuTab === tab ? ' is-active' : ''}`}
                            onClick={() => setAddMenuTab(tab)}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    {addMenuTab === 'basic' && (
                      <div className="tl-add-menu-grid">
                        {([
                          { type: 'move', label: '移动' },
                          { type: 'moveAlongPath', label: '曲线移动' },
                          { type: 'fade', label: '淡入淡出' },
                          { type: 'scale', label: '缩放' },
                          { type: 'rotate', label: '旋转' },
                          { type: 'shake', label: '抖动' },
                        ] as const).map((item) => (
                          <button key={item.type} className="tl-add-menu-item" onClick={() => { createClip(item.type); setShowAddMenu(false); }}>
                            <span className={`tl-type-dot tl-type-${item.type}`} />
                            {item.label}
                          </button>
                        ))}
                      </div>
                    )}
                    {addMenuTab === 'template' && (
                      <div className="tl-add-menu-grid">
                        {([
                          { key: 'fadeIn', label: '淡入' },
                          { key: 'bounceIn', label: '弹跳进入' },
                          { key: 'moveFadeIn', label: '平移淡入' },
                          { key: 'fadeOut', label: '淡出消失' },
                          { key: 'moveFadeOut', label: '移动消失' },
                        ] as const).map((item) => (
                          <button key={item.key} className="tl-add-menu-item tl-add-menu-template" onClick={() => { createPresetTemplate(item.key); setShowAddMenu(false); }}>
                            {item.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

          </div>
          <div className="tl-element-zoom-row">

            {/* 左列：元素名称 */}
            <span className="tl-overall-label" data-tooltip={selectedObject.name || selectedObject.id}>
              {selectedObject.name || '未命名对象'}
            </span>

            {/* 中列：冲突修复 + 动画排序 + 批量修改 + 复制动画 */}
            <div className="tl-zoom-row-actions">
              {conflictMeta.ids.size > 0 && (
                <button className="tl-conflict-btn" onClick={autoResolveConflicts} data-tooltip={`冲突域：${conflictMeta.domainLabels.join(' / ')}`}>
                  ⚠ {conflictMeta.ids.size} 个冲突 · 修复
                </button>
              )}
              <button
                className="tl-btn"
                onClick={sortClipsByStartTime}
                disabled={segmentScopedClips.length < 2}
                data-tooltip={segmentScopedClips.length < 2 ? '至少需要2个动画片段才需要排序' : '按照动画片段的开始时刻从早到晚排序'}
              >
                动画排序
              </button>
              {/* 外层 wrapper：为「复制动画」弹窗提供统一定位上下文，使其左边界与「批量修改」左边界对齐 */}
              <div style={{ position: 'relative', display: 'flex', gap: 6, alignItems: 'center' }}>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }} ref={batchPanelRef}>
                <button
                  className={`tl-btn${showBatchPanel ? ' is-active' : ''}`}
                  onClick={() => setShowBatchPanel((p) => !p)}
                  disabled={selectedSegmentIds.length !== 1 || segmentScopedClips.length < 2}
                  data-tooltip={
                    selectedSegmentIds.length === 0 ? '请先选中一个时间片段' :
                    selectedSegmentIds.length > 1 ? '选中多片段时不可用，请只选中一个' :
                    segmentScopedClips.length < 2 ? '至少需要2个动画片段才需要批量修改' :
                    '批量修改当前片段内的动画'
                  }
                >
                  批量修改
                </button>
                {showBatchPanel && (
                  <div style={{
                    position: 'absolute', top: '100%', right: 0, zIndex: 200,
                    background: 'var(--panel-bg)', border: '1px solid var(--border-color)',
                    borderRadius: 6, padding: 8, width: 240, height: 160,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.25)', marginTop: 4,
                    display: 'flex', flexDirection: 'row', boxSizing: 'border-box',
                  }}>

                    {/* ── 左列：全选/清空 + 片段列表 ── */}
                    <div style={{ width: 108, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0, marginBottom: 4 }}>
                        <button className="tl-btn tl-btn-sm" style={{ flex: 1 }} onClick={() => setBatchSelectedClipIds(selectedObjectClips.map((c) => c.id))}>全选</button>
                        <button className="tl-btn tl-btn-sm" style={{ flex: 1 }} onClick={() => setBatchSelectedClipIds([])}>清空</button>
                      </div>
                      <div style={{ borderTop: '1px solid var(--border-color)', flexShrink: 0, marginBottom: 4 }} />
                      <div className="tl-batch-clip-list" style={{ flex: 1, maxHeight: 'none', minHeight: 0 }}>
                        {selectedObjectClips.map((clip) => {
                          const isSel = batchSelectedClipIdSet.has(clip.id);
                          return (
                            <div
                              key={clip.id}
                              className={`tl-batch-clip-item${isSel ? ' is-selected' : ''}`}
                              onClick={() => toggleBatchClipSelection(clip.id, !isSel)}
                            >
                              <input
                                type="checkbox"
                                checked={isSel}
                                onChange={(e) => toggleBatchClipSelection(clip.id, e.target.checked)}
                                onClick={(e) => e.stopPropagation()}
                                style={{ margin: 0, cursor: 'pointer', flexShrink: 0 }}
                              />
                              <span className={`tl-type-dot tl-type-${clip.type}`} />
                              <span style={{ flex: 1, fontSize: 11, color: clip.enabled === false ? 'var(--text-muted)' : 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {getClipTypeLabel(clip.type)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* ── 竖向分隔线 ── */}
                    <div style={{ width: 1, background: 'var(--border-color)', margin: '0 8px', flexShrink: 0 }} />

                    {/* ── 右列：字段 + 应用按钮 ── */}
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {/* 缓动 */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0, width: 23 }}>缓动</span>
                        <div ref={batchEasingDropRef} style={{ width: 72, flexShrink: 0, position: 'relative' }}>
                          <div className="tl-batch-select" onClick={() => { setBatchEasingDropOpen((p) => !p); setBatchStateDropOpen(false); }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{BATCH_EASING_OPTS.find((o) => o.value === batchEasingInput)?.label ?? '不修改'}</span>
                            <svg className="tl-batch-select-arrow" width="8" height="5" viewBox="0 0 8 5" fill="none"><path d="M1 1L4 4L7 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </div>
                          {batchEasingDropOpen && (
                            <div className="tl-batch-dropdown">
                              {BATCH_EASING_OPTS.map((opt) => (
                                <div key={opt.value} className={`tl-batch-option${batchEasingInput === opt.value ? ' is-active' : ''}`} onClick={() => { setBatchEasingInput(opt.value); setBatchEasingDropOpen(false); }}>
                                  {opt.label}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      {/* 状态 */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0, width: 23 }}>状态</span>
                        <div ref={batchStateDropRef} style={{ width: 72, flexShrink: 0, position: 'relative' }}>
                          <div className="tl-batch-select" onClick={() => { setBatchStateDropOpen((p) => !p); setBatchEasingDropOpen(false); }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{BATCH_STATE_OPTS.find((o) => o.value === batchEnabledInput)?.label ?? '不修改'}</span>
                            <svg className="tl-batch-select-arrow" width="8" height="5" viewBox="0 0 8 5" fill="none"><path d="M1 1L4 4L7 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </div>
                          {batchStateDropOpen && (
                            <div className="tl-batch-dropdown">
                              {BATCH_STATE_OPTS.map((opt) => (
                                <div key={opt.value} className={`tl-batch-option${batchEnabledInput === opt.value ? ' is-active' : ''}`} onClick={() => { setBatchEnabledInput(opt.value); setBatchStateDropOpen(false); }}>
                                  {opt.label}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      {/* 开始 */}
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: 4, opacity: batchStartDisabled ? 0.4 : 1 }}
                        data-tooltip={batchStartDisabled ? '选中的动画来自不同时间片段，无法统一设置开始时刻' : undefined}
                      >
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0, width: 23 }}>开始</span>
                        <input
                          type="number" min={0} value={batchStartInput} placeholder="—"
                          disabled={batchStartDisabled}
                          onChange={(e) => setBatchStartInput(e.target.value)}
                          style={{ width: 72, flexShrink: 0, height: 24, fontSize: 11, borderRadius: 4, border: '1px solid var(--border-color)', padding: '0 4px', background: 'var(--bg-color)', color: 'var(--text-main)', boxSizing: 'border-box', cursor: batchStartDisabled ? 'not-allowed' : undefined }}
                        />
                      </div>
                      {/* 时长 */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0, width: 23 }}>时长</span>
                        <input
                          type="number" min={1} value={batchDurationInput} placeholder="—"
                          onChange={(e) => setBatchDurationInput(e.target.value)}
                          style={{ width: 72, flexShrink: 0, height: 24, fontSize: 11, borderRadius: 4, border: '1px solid var(--border-color)', padding: '0 4px', background: 'var(--bg-color)', color: 'var(--text-main)', boxSizing: 'border-box' }}
                        />
                      </div>
                      {/* 应用按钮（推到底部） */}
                      <button
                        disabled={selectedBatchClips.length === 0}
                        onClick={() => { applyBatchEdits(); setShowBatchPanel(false); }}
                        style={{
                          marginTop: 'auto', width: '100%', height: 26,
                          background: selectedBatchClips.length === 0 ? 'var(--bg-color)' : 'var(--primary-color)',
                          color: selectedBatchClips.length === 0 ? 'var(--text-muted)' : '#fff',
                          border: selectedBatchClips.length === 0 ? '1px solid var(--border-color)' : 'none',
                          borderRadius: 5, cursor: selectedBatchClips.length === 0 ? 'not-allowed' : 'pointer',
                          fontSize: 11, fontWeight: 600,
                        }}
                      >
                        应用{selectedBatchClips.length > 0 ? `（${selectedBatchClips.length}）` : '修改'}
                      </button>
                    </div>

                  </div>
                )}
              </div>
              {/* display:contents 使该 div 从布局中消失，弹窗锚点升到外层 wrapper；但 DOM 包含关系不变，click-outside 检测仍有效 */}
              <div ref={copyDialogRef} style={{ display: 'contents' }}>
                <button
                  className={`tl-btn${showCopyDialog ? ' is-active' : ''}`}
                  disabled={selectedObjectClips.length === 0 || objects.length <= 1}
                  data-tooltip="将当前对象的所有动画片段复制到其他对象"
                  onClick={() => { setCopyTargetIds([]); setShowCopyDialog((p) => !p); }}
                >
                  复制动画
                </button>
                {showCopyDialog && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
                    background: 'var(--panel-bg)', border: '1px solid var(--border-color)',
                    borderRadius: 6, padding: '8px',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.25)', marginTop: 4,
                    height: 170, display: 'flex', flexDirection: 'column', overflow: 'hidden',
                  }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600, flexShrink: 0 }}>选择目标对象</div>
                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0 }}>
                      {objects.filter((o) => o.id !== selectedObject.id).map((o) => (
                        <label key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '0 4px', borderRadius: 6, fontSize: 12, height: 24, flexShrink: 0 }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-color)'; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                        >
                          <input
                            type="checkbox"
                            checked={copyTargetIds.includes(o.id)}
                            onChange={(e) => {
                              if (e.target.checked) setCopyTargetIds((p) => [...p, o.id]);
                              else setCopyTargetIds((p) => p.filter((id) => id !== o.id));
                            }}
                            style={{ width: 13, height: 13, flexShrink: 0, cursor: 'pointer' }}
                          />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.name || '未命名'}</span>
                        </label>
                      ))}
                    </div>
                    <button
                      disabled={copyTargetIds.length === 0}
                      onClick={() => { copyAnimationClipsToObjects(selectedObject.id, copyTargetIds); setShowCopyDialog(false); setCopyTargetIds([]); }}
                      style={{
                        marginTop: 6, width: '100%', height: 20, padding: 0, flexShrink: 0,
                        background: copyTargetIds.length === 0 ? 'var(--bg-color)' : 'var(--primary-color)',
                        color: copyTargetIds.length === 0 ? 'var(--text-muted)' : '#fff',
                        border: 'none', borderRadius: 4, cursor: copyTargetIds.length === 0 ? 'not-allowed' : 'pointer',
                        fontSize: 11,
                      }}
                    >
                      确认复制 {copyTargetIds.length > 0 ? `(${copyTargetIds.length})` : ''}
                    </button>
                  </div>
                )}
              </div>
              </div>{/* 外层 wrapper 结束 */}
            </div>

            {/* 右列：缩放滑块 */}
            <div className="tl-zoom-ctrl" ref={zoomCtrlRef}>
              <input
                type="range"
                className="tl-zoom-range"
                min={50} max={300} step={10}
                value={timelineZoom}
                style={{ '--fill': `${((timelineZoom - 50) / 250) * 100}%` } as CSSProperties}
                onChange={(e) => setTimelineZoom(parseInt(e.target.value))}
              />
              <span className="tl-zoom-val">{timelineZoom}%</span>
            </div>

          </div>
          </>
        );
      })()}

      {/* ── 主体 ── */}
      {(!selectedObject || selectedIds.length > 1) ? (
        <div className="tl-placeholder">选中画布上的对象，即可在此处管理动画片段<br/><span style={{fontSize:11,opacity:0.6}}>也可在右侧检查器「动画片段」区域快速添加</span></div>
      ) : selectedSegmentIds.length > 1 ? (
        <div className="tl-placeholder">已选中 {selectedSegmentIds.length} 个时间片段，无法显示动画详情<br/><span style={{fontSize:11,opacity:0.6}}>仅选中一个片段以编辑其动画</span></div>
      ) : selectedSegmentIds.length === 0 ? (
        <div className="tl-body"><div className="tl-placeholder">请先在元素时间轴上选中一个时间片段以编辑动画<br/><span style={{fontSize:11,opacity:0.6}}>或点击「添加动画」由系统自动选中第一个片段</span></div></div>
      ) : (
        <div className="tl-body">

          {/* 片段列表 */}
          <div className="tl-clip-list">

            {segmentScopedClips.length === 0 ? (
              <div className="tl-placeholder">
                此片段尚无动画；点击上方「添加动画」进入动画设计
              </div>
            ) : (
              segmentScopedClips.map((clip, clipIndex) => {
                const isExpanded = expandedClipId === clip.id;
                const effStart = dragState?.clipId === clip.id ? dragState.previewStartMs : clip.startTimeMs;
                const effDuration = dragState?.clipId === clip.id ? dragState.previewDurationMs : clip.durationMs;
                const isDragging = dragState?.clipId === clip.id;
                const isSnapping = isDragging && dragState?.snapGuideMs !== null;
                const isCursorSnapping = !isDragging && cursorSnapGuideMs !== null;
                // 段坐标系：track 的 0~100% 表示当前段范围（无活动段时退回全局，仅作兜底）
                const segLo = activeSegment?.startMs ?? 0;
                const segHi = activeSegment?.endMs ?? globalDurationMs;
                const segRange = Math.max(1, segHi - segLo);
                const toSegPct = (ms: number) => Math.max(0, Math.min(100, ((ms - segLo) / segRange) * 100));
                const inSeg = (ms: number) => ms >= segLo && ms <= segHi;
                const showPlayhead = inSeg(currentTimeMs);
                const toPixelLeft = (pct: number) => {
                  const el = clipTrackRefs.current.get(clip.id);
                  if (!el) return `${pct}%`;
                  const dpr = window.devicePixelRatio || 1;
                  return `${Math.round(pct / 100 * el.offsetWidth * dpr) / dpr}px`;
                };
                const playheadLeft = toPixelLeft(toSegPct(currentTimeMs));
                const showGuide = isSnapping || isCursorSnapping;
                const guideRawPct = isSnapping ? toSegPct(dragState?.snapGuideMs ?? 0) : toSegPct(cursorSnapGuideMs ?? 0);
                const guideLeft = showGuide ? toPixelLeft(guideRawPct) : '0%';
                // 段坐标系下 clip 自身位置/宽度
                const clipLeftPct = `${toSegPct(effStart)}%`;
                const clipEndMs = Math.min(segHi, effStart + effDuration);
                const clipWidthPct = `${Math.max(1, ((clipEndMs - effStart) / segRange) * 100)}%`;
                const conflictDomains = conflictMeta.domainsByClipId.get(clip.id) || [];
                const isConflict = conflictDomains.length > 0;
                const isBatchSelected = batchSelectedClipIdSet.has(clip.id);
                const easingPts = parseEasingControlPoints(clip.easing).points;
                const [ex1, ey1, ex2, ey2] = easingPts;

                return (
                  <div
                    key={clip.id}
                    className={[
                      'tl-clip',
                      clip.enabled === false ? 'is-disabled' : '',
                      flashClipId === clip.id ? 'is-flash' : '',
                      isConflict ? 'is-conflict' : '',
                      isBatchSelected ? 'is-batch-selected' : '',
                      isExpanded ? 'is-expanded' : '',
                      clipListDrag?.clipId === clip.id ? 'is-list-dragging' : '',
                      (clipListDrag && clipListDrag.toIndex === clipIndex && clipListDrag.clipId !== clip.id) ? 'is-drop-target' : '',
                    ].filter(Boolean).join(' ')}
                    ref={(node) => { if (node) clipCardRefs.current.set(clip.id, node); else clipCardRefs.current.delete(clip.id); }}
                  >
                    {/* ── 紧凑行（始终可见） */}
                    <div
                      className="tl-clip-row"
                      onClick={() => {
                        if (clipDragHappenedRef.current) { clipDragHappenedRef.current = false; return; }
                        setExpandedClipId(isExpanded ? null : clip.id);
                      }}
                    >
                      {/* col1：类型色点 + 类型名 */}
                      <div className="tl-clip-label">
                        <span className={`tl-type-dot tl-type-${clip.type}`} data-tooltip={getClipTypeLabel(clip.type)} />
                        <span className="tl-clip-type-name">
                          {getClipTypeLabel(clip.type)}
                        </span>
                      </div>

                      {/* col2：轨道条 */}
                      <div className="tl-track-scroll" onClick={(e) => e.stopPropagation()}>
                        <div
                          className="tl-track"
                          style={{ width: `${timelineZoom}%` }}
                          onClick={seekByTrackClick}
                          ref={(node) => { if (node) clipTrackRefs.current.set(clip.id, node); else clipTrackRefs.current.delete(clip.id); }}
                        >
                          {showPlayhead && (
                            <div className="tl-track-playhead" style={{ left: playheadLeft }} />
                          )}
                          {showGuide && (
                            <div className={`tl-track-guide${isCursorSnapping ? ' is-cursor' : ''}`} style={{ left: guideLeft }} />
                          )}
                          <div
                            className={`tl-track-fill tl-type-fill-${clip.type}${isDragging ? ' is-dragging' : ''}${isSnapping ? ' is-snapped' : ''}`}
                            style={{ left: clipLeftPct, width: clipWidthPct }}
                            onMouseDown={clipLabelEditId === clip.id ? undefined : (e) => startClipDrag(clip, e)}
                          >
                            <div className="tl-track-handle-l" onMouseDown={(e) => startClipResizeStart(clip, e)} onClick={(e) => e.stopPropagation()} data-tooltip="拖动以调整动画起点，时长不小于1s" />
                            <div className="tl-track-handle-r" onMouseDown={(e) => startClipResizeEnd(clip, e)} onClick={(e) => e.stopPropagation()} data-tooltip="拖动以调整动画终点，时长不小于1s" />
                            {clipLabelEditId === clip.id ? (
                              <span ref={clipLabelSpanRef} className="tl-track-fill-label"
                                style={{ pointerEvents: 'auto', display: 'inline-flex', alignItems: 'center', width: clipLabelWidthRef.current ?? undefined }}
                                onClick={(e) => e.stopPropagation()}>
                                <input
                                  className="tl-label-time-input tl-input-nospin"
                                  type="number" step={0.001}
                                  style={{ flex: 1, width: 'auto', minWidth: 0 }}
                                  value={clipLabelStart}
                                  onChange={(e) => { clipLabelStartRef.current = e.target.value; setClipLabelStart(e.target.value); }}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onBlur={(e) => {
                                    if (e.currentTarget.parentElement?.contains(e.relatedTarget as Node)) return;
                                    commitClipLabelEdit(e.target.value, clipLabelEndRef.current);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') e.currentTarget.blur();
                                    if (e.key === 'Escape') { clipLabelCancelledRef.current = true; e.currentTarget.blur(); }
                                  }}
                                  autoFocus onFocus={(e) => e.target.select()}
                                />s~<input
                                  className="tl-label-time-input tl-input-nospin"
                                  type="number" step={0.001}
                                  style={{ flex: 1, width: 'auto', minWidth: 0 }}
                                  value={clipLabelEnd}
                                  onChange={(e) => { clipLabelEndRef.current = e.target.value; setClipLabelEnd(e.target.value); }}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onBlur={(e) => {
                                    if (e.currentTarget.parentElement?.contains(e.relatedTarget as Node)) return;
                                    commitClipLabelEdit(clipLabelStartRef.current, e.target.value);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') e.currentTarget.blur();
                                    if (e.key === 'Escape') { clipLabelCancelledRef.current = true; e.currentTarget.blur(); }
                                  }}
                                  onFocus={(e) => e.target.select()}
                                />s
                              </span>
                            ) : (
                              <span
                                className="tl-track-fill-label"
                                style={{ pointerEvents: 'auto' }}
                                data-tooltip="双击时间标签进行编辑，动画时长不小于1s"
                                onClick={(e) => e.stopPropagation()}
                                onDoubleClick={(e) => { e.stopPropagation(); e.preventDefault(); startClipLabelEdit(clip.id, effStart, effDuration, (e.currentTarget as HTMLElement).offsetWidth); }}
                              >
                                {(effStart / 1000).toFixed(3)}s~{((effStart + effDuration) / 1000).toFixed(3)}s
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* col3：冲突标记 + 时长 + 图标控件组 */}
                      <div className="tl-clip-ctrl">
                        {isConflict && (
                          <span className="tl-conflict-tag" data-tooltip={`冲突域：${conflictDomains.map(getConflictDomainLabel).join(' / ')}`}>!</span>
                        )}
                        <span className="tl-clip-dur" data-tooltip="动画片段时长">{(effDuration / 1000).toFixed(3)}s</span>
                        <div className="tl-clip-icon-group">
                          <label className="tl-clip-enable" onClick={(e) => e.stopPropagation()} data-tooltip={clip.enabled !== false ? '已启用（点击禁用）' : '已禁用（点击启用）'}>
                            <input
                              type="checkbox"
                              checked={clip.enabled !== false}
                              onChange={(e) => { ensurePausedForEdit(); updateAnimationClip(clip.id, { enabled: e.target.checked }); }}
                            />
                          </label>
                          <button
                            className="tl-clip-del"
                            data-tooltip="删除片段"
                            onClick={(e) => { e.stopPropagation(); ensurePausedForEdit(); removeAnimationClip(clip.id); }}
                          >
                            ✕
                          </button>
                          <span className="tl-clip-arrow">{isExpanded ? '▲' : '▼'}</span>
                          <span
                            className="tl-clip-drag-handle"
                            data-tooltip="拖动调整顺序"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              clipDragHappenedRef.current = true;
                              setClipListDrag({ clipId: clip.id, fromIndex: clipIndex, toIndex: clipIndex });
                            }}
                          >
                            ⠿
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* ── 展开详情：6列布局 */}
                    {isExpanded && (
                      <div className="tl-clip-detail">

                        {/* ── 基础参数：时间设置子列 + 基础参数子列 */}
                        <div className="tl-basic-section">

                          {/* 时间设置 */}
                          <div className="tl-time-subcol">
                            <span className="tl-col-header-centered">时间设置</span>
                            <div className="tl-time-subcol-body">
                              <label className="tl-detail-label">开始(ms)<input className="tl-input-sm" type="number" min={0} max={99999} value={effStart} onChange={(e) => updateClipNumberField(clip, 'startTimeMs', e.target.value)} /></label>
                              <div style={{ position: 'relative' }}>
                                <label className="tl-detail-label">时长(ms)<input className="tl-input-sm" type="number" min={0} max={99999} value={effDuration} onChange={(e) => updateClipNumberField(clip, 'durationMs', e.target.value)} /></label>
                                {clipDurationWarnId === clip.id && (
                                  <div style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, fontSize: 11, color: '#ef4444', whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 10 }}>
                                    片段时长不能小于 1000ms
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* 基础参数（类型专属） */}
                          <div className="tl-params-subcol">
                            <span className="tl-col-header-centered">基础参数</span>
                            <div className={`tl-params-subcol-body${clip.type === 'moveAlongPath' ? ' tl-map-params' : ''}`}>
                              <div className="tl-type-row">
                                {(clip.type === 'move' || clip.type === 'moveAlongPath') && (<>
                                  <span className="tl-coord-label">起点</span>
                                  <label className="tl-detail-label">X<input type="number" step={1} value={Math.round(clip.payload.fromX)} onChange={(e) => updatePayloadNumberField(clip, 'fromX', e.target.value)} /></label>
                                  <label className="tl-detail-label">Y<input type="number" step={1} value={Math.round(clip.payload.fromY)} onChange={(e) => updatePayloadNumberField(clip, 'fromY', e.target.value)} /></label>
                                  <button type="button" className="tl-btn tl-btn-sm" data-tooltip="将对象当前位置设为起点" onClick={() => selectedObjectAtCurrentTime && updateClipPayload(clip, { fromX: Math.round(selectedObjectAtCurrentTime.x), fromY: Math.round(selectedObjectAtCurrentTime.y) })}>取当前位置</button>
                                </>)}
                                {clip.type === 'fade' && <label className="tl-detail-label">起始透明度<input type="number" min={0} max={1} step={0.01} value={clip.payload.fromOpacity} onChange={(e) => updatePayloadNumberField(clip, 'fromOpacity', e.target.value)} /></label>}
                                {clip.type === 'scale' && (<><label className="tl-detail-label">起始缩放X<input type="number" step={0.01} value={clip.payload.fromScaleX} onChange={(e) => updatePayloadNumberField(clip, 'fromScaleX', e.target.value)} /></label><label className="tl-detail-label">起始缩放Y<input type="number" step={0.01} value={clip.payload.fromScaleY} onChange={(e) => updatePayloadNumberField(clip, 'fromScaleY', e.target.value)} /></label></>)}
                                {clip.type === 'rotate' && <label className="tl-detail-label">起始角度<input type="number" value={clip.payload.fromRotation} onChange={(e) => updatePayloadNumberField(clip, 'fromRotation', e.target.value)} /></label>}
                                {clip.type === 'shake' && (<><label className="tl-detail-label"><span className="tl-shake-lbl">基准X</span><input type="number" step={1} value={Math.round(clip.payload.baseX)} onChange={(e) => updatePayloadNumberField(clip, 'baseX', e.target.value)} /></label><label className="tl-detail-label"><span className="tl-shake-lbl">基准Y</span><input type="number" step={1} value={Math.round(clip.payload.baseY)} onChange={(e) => updatePayloadNumberField(clip, 'baseY', e.target.value)} /></label></>)}
                              </div>
                              <div className="tl-type-row">
                                {clip.type === 'move' && (<>
                                  <span className="tl-coord-label">终点</span>
                                  <label className="tl-detail-label">X<input type="number" step={1} value={Math.round(clip.payload.toX)} onChange={(e) => updatePayloadNumberField(clip, 'toX', e.target.value)} /></label>
                                  <label className="tl-detail-label">Y<input type="number" step={1} value={Math.round(clip.payload.toY)} onChange={(e) => updatePayloadNumberField(clip, 'toY', e.target.value)} /></label>
                                  <button type="button" className="tl-btn tl-btn-sm" data-tooltip="将对象当前位置设为终点" onClick={() => selectedObjectAtCurrentTime && updateClipPayload(clip, { toX: Math.round(selectedObjectAtCurrentTime.x), toY: Math.round(selectedObjectAtCurrentTime.y) })}>取当前位置</button>
                                </>)}
                                {clip.type === 'moveAlongPath' && (<>
                                  <span className="tl-coord-label">控制点1</span>
                                  <label className="tl-detail-label">X<input type="number" step={1} value={Math.round(clip.payload.control1X)} onChange={(e) => updatePayloadNumberField(clip, 'control1X', e.target.value)} /></label>
                                  <label className="tl-detail-label">Y<input type="number" step={1} value={Math.round(clip.payload.control1Y)} onChange={(e) => updatePayloadNumberField(clip, 'control1Y', e.target.value)} /></label>
                                  <span className="tl-map-btn-placeholder" />
                                </>)}
                                {clip.type === 'fade' && <label className="tl-detail-label">结束透明度<input type="number" min={0} max={1} step={0.01} value={clip.payload.toOpacity} onChange={(e) => updatePayloadNumberField(clip, 'toOpacity', e.target.value)} /></label>}
                                {clip.type === 'scale' && (<><label className="tl-detail-label">结束缩放X<input type="number" step={0.01} value={clip.payload.toScaleX} onChange={(e) => updatePayloadNumberField(clip, 'toScaleX', e.target.value)} /></label><label className="tl-detail-label">结束缩放Y<input type="number" step={0.01} value={clip.payload.toScaleY} onChange={(e) => updatePayloadNumberField(clip, 'toScaleY', e.target.value)} /></label></>)}
                                {clip.type === 'rotate' && <label className="tl-detail-label">结束角度<input type="number" value={clip.payload.toRotation} onChange={(e) => updatePayloadNumberField(clip, 'toRotation', e.target.value)} /></label>}
                                {clip.type === 'shake' && (<><label className="tl-detail-label"><span className="tl-shake-lbl">振幅X</span><input type="number" min={0} value={clip.payload.amplitudeX} onChange={(e) => updatePayloadNumberField(clip, 'amplitudeX', e.target.value)} /></label><label className="tl-detail-label"><span className="tl-shake-lbl">振幅Y</span><input type="number" min={0} value={clip.payload.amplitudeY} onChange={(e) => updatePayloadNumberField(clip, 'amplitudeY', e.target.value)} /></label></>)}
                              </div>
                              {clip.type === 'moveAlongPath' && (
                                <div className="tl-type-row">
                                  <span className="tl-coord-label">控制点2</span>
                                  <label className="tl-detail-label">X<input type="number" step={1} value={Math.round(clip.payload.control2X)} onChange={(e) => updatePayloadNumberField(clip, 'control2X', e.target.value)} /></label>
                                  <label className="tl-detail-label">Y<input type="number" step={1} value={Math.round(clip.payload.control2Y)} onChange={(e) => updatePayloadNumberField(clip, 'control2Y', e.target.value)} /></label>
                                  <span className="tl-map-btn-placeholder" />
                                </div>
                              )}
                              {(clip.type === 'moveAlongPath' || clip.type === 'shake') && (
                                <div className="tl-type-row">
                                  {clip.type === 'moveAlongPath' && (<>
                                    <span className="tl-coord-label">终点</span>
                                    <label className="tl-detail-label">X<input type="number" step={1} value={Math.round(clip.payload.toX)} onChange={(e) => updatePayloadNumberField(clip, 'toX', e.target.value)} /></label>
                                    <label className="tl-detail-label">Y<input type="number" step={1} value={Math.round(clip.payload.toY)} onChange={(e) => updatePayloadNumberField(clip, 'toY', e.target.value)} /></label>
                                    <button type="button" className="tl-btn tl-btn-sm" data-tooltip="将对象当前位置设为终点" onClick={() => selectedObjectAtCurrentTime && updateClipPayload(clip, { toX: Math.round(selectedObjectAtCurrentTime.x), toY: Math.round(selectedObjectAtCurrentTime.y) })}>取当前位置</button>
                                  </>)}
                                  {clip.type === 'shake' && (<><label className="tl-detail-label"><span className="tl-shake-lbl">频率</span><input type="number" min={0} value={clip.payload.frequency} onChange={(e) => updatePayloadNumberField(clip, 'frequency', e.target.value)} /></label><label className="tl-detail-label"><span className="tl-shake-lbl">衰减</span><input type="number" min={0} step={0.1} value={clip.payload.decay ?? 1} onChange={(e) => updatePayloadNumberField(clip, 'decay', e.target.value)} /></label></>)}
                                </div>
                              )}
                            </div>
                          </div>

                        </div>

                        {/* ── 动画节奏（纵向堆叠） */}
                        <div className="tl-easing-col">
                          <span className="tl-col-header">动画节奏</span>
                          {EASING_PRESET_OPTIONS.map((preset) => (
                            <button
                              key={preset.value}
                              type="button"
                              className={`tl-easing-btn${(clip.easing || 'linear') === preset.value ? ' is-active' : ''}`}
                              onClick={() => setClipEasingPreset(clip, preset.value)}
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>

                        {/* ── 节奏调整（纵向堆叠） */}
                        <div className="tl-bezier-col">
                          <span className="tl-col-header">节奏调整</span>
                          {(
                            [
                              { label: 'X1', idx: 0 as const, min: 0, max: 1, step: 0.01, val: ex1 },
                              { label: 'Y1', idx: 1 as const, min: -2, max: 2, step: 0.01, val: ey1 },
                              { label: 'X2', idx: 2 as const, min: 0, max: 1, step: 0.01, val: ex2 },
                              { label: 'Y2', idx: 3 as const, min: -2, max: 2, step: 0.01, val: ey2 },
                            ]
                          ).map((f) => (
                            <label key={f.label} className="tl-detail-label">
                              {f.label}
                              <input type="number" min={f.min} max={f.max} step={f.step} value={formatBezierValue(f.val)} onChange={(e) => updateClipBezierControlPoint(clip, f.idx, e.target.value)} />
                            </label>
                          ))}
                        </div>

                        {/* ── 节奏曲线 */}
                        <div className="tl-curve-col">
                          <span className="tl-col-header">节奏曲线</span>
                          <div className="tl-easing-preview-wrap tl-easing-preview-lg">
                            <EasingCurve
                              ex1={ex1} ey1={ey1} ex2={ex2} ey2={ey2}
                              onDrag={(nx1, ny1, nx2, ny2) => {
                                ensurePausedForEdit();
                                updateAnimationClip(clip.id, { easing: buildBezierEasingValue(nx1, ny1, nx2, ny2) });
                              }}
                            />
                          </div>
                        </div>

                        {/* ── 关键帧设置 */}
                        <div className="tl-kf-col">
                          {(clip.type === 'move' || clip.type === 'fade' || clip.type === 'scale' || clip.type === 'rotate') ? (
                            <KeyframeEditor
                              clip={clip}
                              currentTimeMs={currentTimeMs}
                              ensurePausedForEdit={ensurePausedForEdit}
                              updateClipPayload={updateClipPayload}
                            />
                          ) : (
                            <>
                              <span className="tl-col-header">关键帧设置</span>
                              {clip.type === 'shake' && (
                                <span className="tl-kf-empty">抖动效果由「振幅 / 频率 / 衰减」基础参数控制，无需关键帧</span>
                              )}
                              {clip.type === 'moveAlongPath' && (
                                <span className="tl-kf-empty">曲线移动通过编辑两个控制点调整轨迹形状，无需关键帧</span>
                              )}
                              {clip.type === 'stateChange' && (
                                <span className="tl-kf-empty">状态切换是离散事件，没有中间过渡</span>
                              )}
                            </>
                          )}
                        </div>

                        {/* ── 基础操作 */}
                        <div className="tl-ops-col">
                          <span className="tl-col-header">基础操作</span>
                          <button className="tl-btn tl-btn-sm" data-tooltip="跳到动画开始的时刻" onClick={() => { ensurePausedForEdit(); setCurrentTimeMs(clip.startTimeMs); }}>跳到</button>
                          <button className="tl-btn tl-btn-sm" data-tooltip="复制一份动画片段" onClick={() => duplicateClip(clip)}>复制</button>
                          <button
                            className="tl-btn tl-btn-sm"
                            data-tooltip="只播放此动画片段"
                            onClick={() => startClipPreview(clip.id)}
                          >
                            预览
                          </button>
                        </div>

                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </section>
  );
}
