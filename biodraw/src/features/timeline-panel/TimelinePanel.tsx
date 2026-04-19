import { useEffect, useMemo, useRef, useState } from 'react';
import { useEditorStore } from '../../state/editorStore';
import { buildAnimatedPreviewObjects } from '../../animation/engine';
import type { AnimationClip } from '../../types';
import './TimelinePanel.css';

// ── 辅助常量 ────────────────────────────────────────────────

const clampPositive = (value: number, fallback: number) => {
  if (Number.isNaN(value)) return fallback;
  return Math.max(1, value);
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const clampKeyframePercent = (value: number) => Math.max(0, Math.min(100, value));
const clampBezierY = (value: number) => Math.max(-2, Math.min(2, value));
const clampTimelineZoom = (value: number) => Math.max(50, Math.min(400, value));
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

const sortAndSanitizeInternalKeyframes = <T extends { at: number }>(keyframes: T[]) => {
  const sorted = keyframes
    .filter((f) => Number.isFinite(f.at))
    .map((f) => ({ ...f, at: clamp01(f.at) }))
    .filter((f) => f.at > 0 && f.at < 1)
    .sort((a, b) => a.at - b.at);
  const deduped: T[] = [];
  for (const f of sorted) {
    const prev = deduped[deduped.length - 1];
    if (prev && Math.abs(prev.at - f.at) < 0.0001) { deduped[deduped.length - 1] = f; continue; }
    deduped.push(f);
  }
  return deduped;
};

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
  const [timelineZoomPercent, setTimelineZoomPercent] = useState(100);
  const [batchSelectedClipIds, setBatchSelectedClipIds] = useState<string[]>([]);
  const [batchDurationInput, setBatchDurationInput] = useState('');
  const [batchEasingInput, setBatchEasingInput] = useState<AnimationClip['easing'] | ''>('');
  const [batchEnabledInput, setBatchEnabledInput] = useState<'' | 'enabled' | 'disabled'>('');
  const clipCardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const clipTrackRefs = useRef<Map<string, HTMLDivElement>>(new Map());
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
  const [showBatchPanel, setShowBatchPanel] = useState(false);
  const [showAdvancedEasing, setShowAdvancedEasing] = useState(false);
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [copyTargetIds, setCopyTargetIds] = useState<string[]>([]);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const copyDialogRef = useRef<HTMLDivElement>(null);

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
        ? animations
            .filter((c) => c.objectId === selectedObject.id)
            .sort((a, b) => a.startTimeMs - b.startTimeMs)
        : [],
    [animations, selectedObject],
  );

  const batchSelectedClipIdSet = useMemo(() => new Set(batchSelectedClipIds), [batchSelectedClipIds]);

  const selectedBatchClips = useMemo(
    () => selectedObjectClips.filter((c) => batchSelectedClipIdSet.has(c.id)),
    [selectedObjectClips, batchSelectedClipIdSet],
  );

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

  const displayObjectClips = useMemo(() => {
    if (conflictMeta.ids.size === 0) return selectedObjectClips;
    return [...selectedObjectClips]
      .map((clip, index) => ({
        clip, index,
        isConflict: conflictMeta.ids.has(clip.id),
        conflictLevel: conflictMeta.domainsByClipId.get(clip.id)?.length || 0,
      }))
      .sort((a, b) => {
        if (a.isConflict !== b.isConflict) return a.isConflict ? -1 : 1;
        if (a.conflictLevel !== b.conflictLevel) return b.conflictLevel - a.conflictLevel;
        if (a.clip.startTimeMs !== b.clip.startTimeMs) return a.clip.startTimeMs - b.clip.startTimeMs;
        return a.index - b.index;
      })
      .map((item) => item.clip);
  }, [selectedObjectClips, conflictMeta]);

  // ── 吸附辅助
  const getSnapCandidates = (activeClipId: string) => {
    const cands: number[] = [0, globalDurationMs];
    for (const c of selectedObjectClips) {
      if (c.id === activeClipId) continue;
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
    const cands: number[] = [0, globalDurationMs];
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

  // ── 创建动画片段
  const createClip = (type: 'move' | 'moveAlongPath' | 'shake' | 'fade' | 'scale' | 'rotate') => {
    if (!selectedObject) return;
    ensurePausedForEdit();
    const src = selectedObjectAtCurrentTime || selectedObject;
    const base = {
      id: crypto.randomUUID(), objectId: selectedObject.id, type,
      startTimeMs: currentTimeMs, durationMs: 1000, easing: 'linear' as const, enabled: true,
    };
    let clip: AnimationClip;
    switch (type) {
      case 'move':
        clip = { ...base, type: 'move', payload: { fromX: src.x, fromY: src.y, toX: src.x + 120, toY: src.y + 80 } };
        break;
      case 'moveAlongPath':
        clip = { ...base, type: 'moveAlongPath', payload: { fromX: src.x, fromY: src.y, controlX: src.x + 80, controlY: src.y - 100, toX: src.x + 160, toY: src.y } };
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
      created.push({ id: crypto.randomUUID(), objectId: selectedObject.id, type: 'moveAlongPath', startTimeMs: currentTimeMs, durationMs: 1200, easing: 'ease-in-out', enabled: true, payload: { fromX: src.x - 80, fromY: src.y, controlX: src.x, controlY: src.y - 60, toX: src.x + 80, toY: src.y } });
    }
    if (template === 'endocytosis') {
      // 胞吞入胞：物质从细胞外弧形进入细胞内（大弧 + 淡入）
      created.push(
        { id: crypto.randomUUID(), objectId: selectedObject.id, type: 'moveAlongPath', startTimeMs: currentTimeMs, durationMs: 1500, easing: 'ease-in-out', enabled: true, payload: { fromX: src.x, fromY: src.y - 120, controlX: src.x + 130, controlY: src.y + 60, toX: src.x, toY: src.y + 80 } },
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
    for (const c of created) { addAnimationClip(c); syncDurationIfNeeded(c); }
    setFlashClipId(created[created.length - 1].id);
    setExpandedClipId(created[created.length - 1].id);
  };

  const duplicateClip = (clip: AnimationClip) => {
    ensurePausedForEdit();
    const dup = JSON.parse(JSON.stringify(clip)) as AnimationClip;
    dup.id = crypto.randomUUID();
    dup.startTimeMs = clip.startTimeMs + clip.durationMs;
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
    const rawDuration = batchDurationInput.trim();
    const hasDuration = rawDuration.length > 0;
    const parsedDuration = hasDuration ? parseInt(rawDuration, 10) : NaN;
    if (hasDuration && Number.isNaN(parsedDuration)) return;
    const hasEasing = batchEasingInput !== '';
    const hasEnabled = batchEnabledInput !== '';
    if (!hasDuration && !hasEasing && !hasEnabled) return;
    const nextDuration = hasDuration ? clampPositive(parsedDuration, 1000) : null;
    const nextEnabled = hasEnabled ? batchEnabledInput === 'enabled' : null;
    const nextEasing = hasEasing ? batchEasingInput : null;
    ensurePausedForEdit();
    let maxEnd = globalDurationMs, lastId: string | null = null;
    for (const clip of selectedBatchClips) {
      const upd: Partial<AnimationClip> = {};
      if (nextDuration !== null && clip.durationMs !== nextDuration) { upd.durationMs = nextDuration; maxEnd = Math.max(maxEnd, clip.startTimeMs + nextDuration); }
      if (nextEasing && (clip.easing || 'linear') !== nextEasing) upd.easing = nextEasing;
      const clipEnabled = clip.enabled !== false;
      if (nextEnabled !== null && clipEnabled !== nextEnabled) upd.enabled = nextEnabled;
      if (Object.keys(upd).length === 0) continue;
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

  // ── 字段更新
  const updateClipNumberField = (clip: AnimationClip, field: 'startTimeMs' | 'durationMs', rawValue: string) => {
    ensurePausedForEdit();
    const parsed = parseInt(rawValue, 10);
    if (Number.isNaN(parsed)) return;
    const next = field === 'durationMs' ? clampPositive(parsed, 1000) : Math.max(0, parsed);
    updateAnimationClip(clip.id, { [field]: next } as Partial<AnimationClip>);
    const end = (field === 'startTimeMs' ? next : clip.startTimeMs) + (field === 'durationMs' ? next : clip.durationMs);
    if (end > globalDurationMs) setGlobalDurationMs(end + 1000);
  };

  const updatePayloadNumberField = (clip: AnimationClip, field: string, rawValue: string) => {
    ensurePausedForEdit();
    const parsed = parseFloat(rawValue);
    if (Number.isNaN(parsed)) return;
    const shouldClampNonNeg = clip.type === 'shake' && ['amplitudeX', 'amplitudeY', 'frequency', 'decay'].includes(field);
    const next =
      clip.type === 'fade' && ['fromOpacity', 'toOpacity'].includes(field) ? clamp01(parsed)
      : shouldClampNonNeg ? Math.max(0, parsed)
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

  // ── 关键帧
  const addMoveKeyframe = (clip: Extract<AnimationClip, { type: 'move' }>) => {
    updateClipPayload(clip, { keyframes: sortAndSanitizeInternalKeyframes([...(clip.payload.keyframes || []), { at: 0.5, x: (clip.payload.fromX + clip.payload.toX) / 2, y: (clip.payload.fromY + clip.payload.toY) / 2 }]) });
  };
  const updateMoveKeyframeField = (clip: Extract<AnimationClip, { type: 'move' }>, index: number, field: 'at' | 'x' | 'y', rawValue: string) => {
    const parsed = parseFloat(rawValue);
    if (Number.isNaN(parsed)) return;
    const next = [...(clip.payload.keyframes || [])];
    const cur = next[index];
    if (!cur) return;
    next[index] = field === 'at' ? { ...cur, at: clampKeyframePercent(parsed) / 100 } : { ...cur, [field]: parsed };
    updateClipPayload(clip, { keyframes: sortAndSanitizeInternalKeyframes(next) });
  };
  const removeMoveKeyframe = (clip: Extract<AnimationClip, { type: 'move' }>, index: number) => {
    const next = [...(clip.payload.keyframes || [])];
    next.splice(index, 1);
    updateClipPayload(clip, { keyframes: sortAndSanitizeInternalKeyframes(next) });
  };

  const addFadeKeyframe = (clip: Extract<AnimationClip, { type: 'fade' }>) => {
    updateClipPayload(clip, { keyframes: sortAndSanitizeInternalKeyframes([...(clip.payload.keyframes || []), { at: 0.5, value: (clip.payload.fromOpacity + clip.payload.toOpacity) / 2 }]) });
  };
  const updateFadeKeyframeField = (clip: Extract<AnimationClip, { type: 'fade' }>, index: number, field: 'at' | 'value', rawValue: string) => {
    const parsed = parseFloat(rawValue);
    if (Number.isNaN(parsed)) return;
    const next = [...(clip.payload.keyframes || [])];
    const cur = next[index];
    if (!cur) return;
    next[index] = field === 'at' ? { ...cur, at: clampKeyframePercent(parsed) / 100 } : { ...cur, value: clamp01(parsed) };
    updateClipPayload(clip, { keyframes: sortAndSanitizeInternalKeyframes(next) });
  };
  const removeFadeKeyframe = (clip: Extract<AnimationClip, { type: 'fade' }>, index: number) => {
    const next = [...(clip.payload.keyframes || [])]; next.splice(index, 1);
    updateClipPayload(clip, { keyframes: sortAndSanitizeInternalKeyframes(next) });
  };

  const addScaleKeyframe = (clip: Extract<AnimationClip, { type: 'scale' }>) => {
    updateClipPayload(clip, { keyframes: sortAndSanitizeInternalKeyframes([...(clip.payload.keyframes || []), { at: 0.5, scaleX: (clip.payload.fromScaleX + clip.payload.toScaleX) / 2, scaleY: (clip.payload.fromScaleY + clip.payload.toScaleY) / 2 }]) });
  };
  const updateScaleKeyframeField = (clip: Extract<AnimationClip, { type: 'scale' }>, index: number, field: 'at' | 'scaleX' | 'scaleY', rawValue: string) => {
    const parsed = parseFloat(rawValue);
    if (Number.isNaN(parsed)) return;
    const next = [...(clip.payload.keyframes || [])];
    const cur = next[index];
    if (!cur) return;
    next[index] = field === 'at' ? { ...cur, at: clampKeyframePercent(parsed) / 100 } : { ...cur, [field]: parsed };
    updateClipPayload(clip, { keyframes: sortAndSanitizeInternalKeyframes(next) });
  };
  const removeScaleKeyframe = (clip: Extract<AnimationClip, { type: 'scale' }>, index: number) => {
    const next = [...(clip.payload.keyframes || [])]; next.splice(index, 1);
    updateClipPayload(clip, { keyframes: sortAndSanitizeInternalKeyframes(next) });
  };

  const addRotateKeyframe = (clip: Extract<AnimationClip, { type: 'rotate' }>) => {
    updateClipPayload(clip, { keyframes: sortAndSanitizeInternalKeyframes([...(clip.payload.keyframes || []), { at: 0.5, value: (clip.payload.fromRotation + clip.payload.toRotation) / 2 }]) });
  };
  const updateRotateKeyframeField = (clip: Extract<AnimationClip, { type: 'rotate' }>, index: number, field: 'at' | 'value', rawValue: string) => {
    const parsed = parseFloat(rawValue);
    if (Number.isNaN(parsed)) return;
    const next = [...(clip.payload.keyframes || [])];
    const cur = next[index];
    if (!cur) return;
    next[index] = field === 'at' ? { ...cur, at: clampKeyframePercent(parsed) / 100 } : { ...cur, value: parsed };
    updateClipPayload(clip, { keyframes: sortAndSanitizeInternalKeyframes(next) });
  };
  const removeRotateKeyframe = (clip: Extract<AnimationClip, { type: 'rotate' }>, index: number) => {
    const next = [...(clip.payload.keyframes || [])]; next.splice(index, 1);
    updateClipPayload(clip, { keyframes: sortAndSanitizeInternalKeyframes(next) });
  };

  // ── 时间轴光标
  const handleCursorChange = (rawValue: string) => {
    ensurePausedForEdit();
    const parsed = parseInt(rawValue, 10);
    if (Number.isNaN(parsed)) return;
    const snap = getCursorSnapResult(parsed);
    setCurrentTimeMs(snap.value);
    setCursorSnapGuideMs(snap.snapped ? snap.value : null);
  };

  // ── 时间轴标尺刻度计算 ───────────────────────────────────────
  const rulerIntervalMs = useMemo(() => {
    const trackWidthPx = 600 * (timelineZoomPercent / 100);
    const msPerPx = globalDurationMs / Math.max(1, trackWidthPx);
    const rawIntervalMs = msPerPx * 80;
    const niceIntervals = [100, 200, 250, 500, 1000, 2000, 5000, 10000, 30000];
    return niceIntervals.find((v) => v >= rawIntervalMs) ?? 30000;
  }, [globalDurationMs, timelineZoomPercent]);

  const rulerTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let ms = 0; ms <= globalDurationMs; ms += rulerIntervalMs) {
      ticks.push(ms);
    }
    return ticks;
  }, [globalDurationMs, rulerIntervalMs]);

  const getClipTrackStyle = (startTimeMs: number, durationMs: number) => {
    const safe = Math.max(1, globalDurationMs);
    const s = Math.max(0, Math.min(startTimeMs, safe));
    const e = Math.max(s, Math.min(startTimeMs + durationMs, safe));
    const left = (s / safe) * 100;
    const width = Math.max(((e - s) / safe) * 100, 1);
    return { left: `${left}%`, width: `${Math.min(width, 100 - left)}%` };
  };

  const seekByTrackClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    ensurePausedForEdit();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const snap = getCursorSnapResult(Math.round(ratio * globalDurationMs));
    setCurrentTimeMs(snap.value);
    setCursorSnapGuideMs(snap.snapped ? snap.value : null);
  };

  // ── 拖拽逻辑（保持原有完整实现）
  const startClipDrag = (clip: AnimationClip, event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const trackEl = clipTrackRefs.current.get(clip.id);
    if (!trackEl) return;
    const rect = trackEl.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    ensurePausedForEdit();
    setDragState({ clipId: clip.id, mode: 'move', offsetMs: ratio * globalDurationMs - clip.startTimeMs, fixedEndMs: clip.startTimeMs + clip.durationMs, previewStartMs: clip.startTimeMs, previewDurationMs: clip.durationMs, snapGuideMs: null });
    event.preventDefault(); event.stopPropagation();
  };
  const startClipResizeStart = (clip: AnimationClip, event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const trackEl = clipTrackRefs.current.get(clip.id);
    if (!trackEl) return;
    const rect = trackEl.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    ensurePausedForEdit();
    setDragState({ clipId: clip.id, mode: 'resize-start', offsetMs: ratio * globalDurationMs - clip.startTimeMs, fixedEndMs: clip.startTimeMs + clip.durationMs, previewStartMs: clip.startTimeMs, previewDurationMs: clip.durationMs, snapGuideMs: null });
    event.preventDefault(); event.stopPropagation();
  };
  const startClipResizeEnd = (clip: AnimationClip, event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const trackEl = clipTrackRefs.current.get(clip.id);
    if (!trackEl) return;
    const rect = trackEl.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    ensurePausedForEdit();
    setDragState({ clipId: clip.id, mode: 'resize-end', offsetMs: ratio * globalDurationMs - (clip.startTimeMs + clip.durationMs), fixedEndMs: clip.startTimeMs + clip.durationMs, previewStartMs: clip.startTimeMs, previewDurationMs: clip.durationMs, snapGuideMs: null });
    event.preventDefault(); event.stopPropagation();
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
      const trackEl = clipTrackRefs.current.get(dragState.clipId);
      if (!trackEl) return;
      const rect = trackEl.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const pointerMs = ratio * globalDurationMs;
      const snapThMs = Math.max(1, (globalDurationMs * SNAP_DISTANCE_PX) / rect.width);
      const cands = getSnapCandidates(dragState.clipId);
      const shouldSnap = !e.shiftKey;
      const applySnap = (v: number) => shouldSnap ? snapWithMeta(v, cands, snapThMs) : { value: v, snapped: false };
      if (dragState.mode === 'move') {
        const raw = Math.max(0, Math.round(pointerMs - dragState.offsetMs));
        const byStart = applySnap(raw);
        const byEnd = Math.max(0, applySnap(raw + dragState.previewDurationMs).value - dragState.previewDurationMs);
        const useStart = Math.abs(byStart.value - raw) <= Math.abs(byEnd - raw);
        const next = useStart ? byStart.value : byEnd;
        const guide = useStart ? (byStart.snapped ? byStart.value : null) : (applySnap(raw + dragState.previewDurationMs).snapped ? applySnap(raw + dragState.previewDurationMs).value : null);
        setDragState((p) => p ? { ...p, previewStartMs: next, snapGuideMs: guide } : p);
      } else if (dragState.mode === 'resize-start') {
        const snapped = applySnap(Math.round(pointerMs - dragState.offsetMs));
        const nextStart = Math.max(0, Math.min(snapped.value, Math.max(0, dragState.fixedEndMs - 1)));
        setDragState((p) => p ? { ...p, previewStartMs: nextStart, previewDurationMs: Math.max(1, dragState.fixedEndMs - nextStart), snapGuideMs: snapped.snapped ? snapped.value : null } : p);
      } else {
        const snapped = applySnap(Math.round(pointerMs - dragState.offsetMs));
        setDragState((p) => p ? { ...p, previewDurationMs: Math.max(1, snapped.value - dragState.previewStartMs), snapGuideMs: snapped.snapped ? snapped.value : null } : p);
      }
    };
    const handleUp = () => {
      const clip = animations.find((c) => c.id === dragState.clipId);
      if (clip) {
        const ns = Math.max(0, dragState.previewStartMs), nd = Math.max(1, dragState.previewDurationMs);
        if (ns !== clip.startTimeMs || nd !== clip.durationMs) {
          ensurePausedForEdit();
          updateAnimationClip(clip.id, { startTimeMs: ns, durationMs: nd });
          if (ns + nd > globalDurationMs) setGlobalDurationMs(ns + nd + 1000);
        }
      }
      setDragState(null);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => { window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp); };
  }, [animations, dragState, globalDurationMs, selectedObjectClips, setGlobalDurationMs, updateAnimationClip, playbackStatus, pause]);

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

  // 切换展开片段时重置高级缓动面板
  useEffect(() => { setShowAdvancedEasing(false); }, [expandedClipId]);

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
    <section className="tl-panel">

      {/* ── 顶部控制栏 ── */}
      <div className="tl-header">
        <div className="tl-header-item">
          <span className="tl-label">总时长</span>
          <input
            className="tl-input-sm"
            type="number"
            min={1000}
            value={globalDurationMs}
            onChange={(e) => { ensurePausedForEdit(); setGlobalDurationMs(parseInt(e.target.value || '1000', 10)); }}
          />
          <span className="tl-unit">ms</span>
        </div>

        <div className="tl-header-item tl-header-cursor">
          <span className="tl-time-display">
            {(currentTimeMs / 1000).toFixed(2)}s / {(globalDurationMs / 1000).toFixed(2)}s
          </span>
          <div className="tl-cursor-wrap">
            <input
              type="range"
              min={0}
              max={globalDurationMs}
              value={currentTimeMs}
              className="tl-cursor-range"
              onChange={(e) => handleCursorChange(e.target.value)}
              onMouseDown={() => setIsCursorDragging(true)}
              onTouchStart={() => setIsCursorDragging(true)}
              onBlur={() => setIsCursorDragging(false)}
            />
            {isCursorDragging && (
              <div className="tl-cursor-badge" style={{ left: cursorPercent }}>
                {cursorTimeLabel}
              </div>
            )}
          </div>
        </div>

        <div className="tl-header-item">
          <span className="tl-label">缩放</span>
          <input
            type="range"
            min={50}
            max={400}
            step={10}
            value={timelineZoomPercent}
            className="tl-zoom-range"
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!Number.isNaN(v)) setTimelineZoomPercent(clampTimelineZoom(v));
            }}
          />
          <span className="tl-zoom-val">{timelineZoomPercent}%</span>
        </div>
      </div>

      {/* ── 主体 ── */}
      {!selectedObject ? (
        <div className="tl-placeholder">选中画布上的对象，即可在此处管理动画片段<br/><span style={{fontSize:11,opacity:0.6}}>也可在右侧检查器「动画片段」区域快速添加</span></div>
      ) : (
        <div className="tl-body">

          {/* 对象操作栏 */}
          <div className="tl-object-bar">
            <span className="tl-object-name" data-tooltip={selectedObject.name || selectedObject.id}>
              {selectedObject.name || '未命名对象'}
            </span>
            <div className="tl-object-actions">
              {/* 冲突警告 */}
              {conflictMeta.ids.size > 0 && (
                <button className="tl-conflict-btn" onClick={autoResolveConflicts} data-tooltip={`冲突域：${conflictMeta.domainLabels.join(' / ')}`}>
                  ⚠ {conflictMeta.ids.size} 个冲突 · 修复
                </button>
              )}

              {/* 批量操作开关 */}
              {selectedObjectClips.length > 0 && (
                <button
                  className={`tl-btn${showBatchPanel ? ' is-active' : ''}`}
                  onClick={() => setShowBatchPanel((p) => !p)}
                >
                  批量
                </button>
              )}

              {/* 复制动画到其他对象 */}
              {selectedObjectClips.length > 0 && objects.length > 1 && (
                <div style={{ position: 'relative' }} ref={copyDialogRef}>
                  <button
                    className={`tl-btn${showCopyDialog ? ' is-active' : ''}`}
                    data-tooltip="将当前对象的所有动画片段复制到其他对象"
                    onClick={() => {
                      setCopyTargetIds([]);
                      setShowCopyDialog((p) => !p);
                    }}
                  >
                    复制动画
                  </button>
                  {showCopyDialog && (
                    <div style={{
                      position: 'absolute', top: '100%', right: 0, zIndex: 200,
                      background: 'var(--bg-panel)', border: '1px solid var(--border-color)',
                      borderRadius: 6, padding: '8px', minWidth: 180,
                      boxShadow: '0 4px 16px rgba(0,0,0,0.25)', marginTop: 4,
                    }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>
                        选择目标对象
                      </div>
                      <div style={{ maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {objects
                          .filter((o) => o.id !== selectedObject.id)
                          .map((o) => (
                            <label key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '3px 4px', borderRadius: 6, fontSize: 12 }}
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
                              />
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {o.name || '未命名'}
                              </span>
                            </label>
                          ))}
                      </div>
                      <button
                        disabled={copyTargetIds.length === 0}
                        onClick={() => {
                          copyAnimationClipsToObjects(selectedObject.id, copyTargetIds);
                          setShowCopyDialog(false);
                          setCopyTargetIds([]);
                        }}
                        style={{
                          marginTop: 8, width: '100%', padding: '5px 0',
                          background: copyTargetIds.length === 0 ? 'var(--bg-color)' : 'var(--primary-color)',
                          color: copyTargetIds.length === 0 ? 'var(--text-muted)' : '#fff',
                          border: 'none', borderRadius: 6, cursor: copyTargetIds.length === 0 ? 'not-allowed' : 'pointer',
                          fontSize: 12, fontWeight: 600,
                        }}
                      >
                        确认复制 {copyTargetIds.length > 0 ? `(${copyTargetIds.length})` : ''}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* 添加动画下拉 */}
              <div className="tl-add-wrap" ref={addMenuRef}>
                <button className="tl-add-btn" onClick={() => setShowAddMenu((p) => !p)}>
                  ＋ 添加动画
                </button>
                {showAddMenu && (
                  <div className="tl-add-menu">
                    <div className="tl-add-menu-section">基础动画</div>
                    <div className="tl-add-menu-grid">
                      {(
                        [
                          { type: 'move', label: '移动' },
                          { type: 'moveAlongPath', label: '曲线移动' },
                          { type: 'fade', label: '淡入淡出' },
                          { type: 'scale', label: '缩放' },
                          { type: 'rotate', label: '旋转' },
                          { type: 'shake', label: '抖动' },
                        ] as const
                      ).map((item) => (
                        <button
                          key={item.type}
                          className="tl-add-menu-item"
                          onClick={() => { createClip(item.type); setShowAddMenu(false); }}
                        >
                          <span className={`tl-type-dot tl-type-${item.type}`} />
                          {item.label}
                        </button>
                      ))}
                    </div>
                    <div className="tl-add-menu-section">通用模板</div>
                    <div className="tl-add-menu-grid">
                      {(
                        [
                          { key: 'fadeIn', label: '淡入' },
                          { key: 'bounceIn', label: '弹跳进入' },
                          { key: 'moveFadeIn', label: '平移淡入' },
                          { key: 'fadeOut', label: '淡出消失' },
                          { key: 'moveFadeOut', label: '移动消失' },
                        ] as const
                      ).map((item) => (
                        <button
                          key={item.key}
                          className="tl-add-menu-item tl-add-menu-template"
                          onClick={() => { createPresetTemplate(item.key); setShowAddMenu(false); }}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                    <div className="tl-add-menu-section">生物场景</div>
                    <div className="tl-add-menu-grid">
                      {(
                        [
                          { key: 'crossMembrane', label: '跨膜移动' },
                          { key: 'endocytosis', label: '胞吞入胞' },
                        ] as const
                      ).map((item) => (
                        <button
                          key={item.key}
                          className="tl-add-menu-item tl-add-menu-template tl-add-menu-bio"
                          onClick={() => { createPresetTemplate(item.key); setShowAddMenu(false); }}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 批量编辑面板（可折叠） */}
          {showBatchPanel && (
            <div className="tl-batch-panel">
              <div className="tl-batch-header">
                <span>批量编辑：已选 {selectedBatchClips.length} / {selectedObjectClips.length} 个片段</span>
                <div className="tl-batch-header-actions">
                  <button className="tl-btn tl-btn-sm" onClick={() => setBatchSelectedClipIds(selectedObjectClips.map((c) => c.id))}>全选</button>
                  <button className="tl-btn tl-btn-sm" onClick={() => setBatchSelectedClipIds([])}>清空</button>
                </div>
              </div>
              <div className="tl-batch-fields">
                <label className="tl-detail-label">
                  时长(ms)
                  <input type="number" min={1} value={batchDurationInput} placeholder="不修改" onChange={(e) => setBatchDurationInput(e.target.value)} />
                </label>
                <label className="tl-detail-label">
                  缓动
                  <select value={batchEasingInput} onChange={(e) => setBatchEasingInput(e.target.value as AnimationClip['easing'] | '')}>
                    <option value="">不修改</option>
                    <option value="linear">线性</option>
                    <option value="ease-in">缓入</option>
                    <option value="ease-out">缓出</option>
                    <option value="ease-in-out">缓入缓出</option>
                  </select>
                </label>
                <label className="tl-detail-label">
                  状态
                  <select value={batchEnabledInput} onChange={(e) => setBatchEnabledInput(e.target.value as '' | 'enabled' | 'disabled')}>
                    <option value="">不修改</option>
                    <option value="enabled">启用</option>
                    <option value="disabled">禁用</option>
                  </select>
                </label>
                <button className="tl-apply-btn" onClick={applyBatchEdits}>应用</button>
              </div>
            </div>
          )}

          {/* 片段列表 */}
          <div className="tl-clip-list">

            {/* 时间轴标尺 */}
            <div
              style={{
                position: 'relative', height: 20, flexShrink: 0,
                borderBottom: '1px solid var(--border-color)',
                overflow: 'hidden', fontSize: 10,
                color: 'var(--text-muted)', userSelect: 'none',
              }}
              onClick={seekByTrackClick}
            >
              {rulerTicks.map((ms) => {
                const pct = globalDurationMs > 0 ? (ms / globalDurationMs) * 100 : 0;
                return (
                  <div key={ms} style={{ position: 'absolute', left: `${pct}%`, top: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', pointerEvents: 'none' }}>
                    <div style={{ width: 1, height: 6, background: 'var(--border-color)', flexShrink: 0 }} />
                    <span style={{ fontSize: 9, lineHeight: '14px', whiteSpace: 'nowrap', transform: 'translateX(-50%)' }}>
                      {ms >= 1000 ? `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)}s` : `${ms}ms`}
                    </span>
                  </div>
                );
              })}
              {/* 播放头线 */}
              <div style={{
                position: 'absolute', top: 0, bottom: 0, width: 1,
                background: 'var(--primary-color, #3b82f6)', pointerEvents: 'none',
                left: `${globalDurationMs > 0 ? (currentTimeMs / globalDurationMs) * 100 : 0}%`,
              }} />
            </div>

            {selectedObjectClips.length === 0 ? (
              <div className="tl-placeholder tl-placeholder-sm">
                点击上方「＋ 添加动画」，或在右侧检查器快速添加
              </div>
            ) : (
              displayObjectClips.map((clip) => {
                const isExpanded = expandedClipId === clip.id;
                const effStart = dragState?.clipId === clip.id ? dragState.previewStartMs : clip.startTimeMs;
                const effDuration = dragState?.clipId === clip.id ? dragState.previewDurationMs : clip.durationMs;
                const isDragging = dragState?.clipId === clip.id;
                const isSnapping = isDragging && dragState?.snapGuideMs !== null;
                const isCursorSnapping = !isDragging && cursorSnapGuideMs !== null;
                const playheadPct = `${Math.max(0, Math.min(100, (currentTimeMs / Math.max(1, globalDurationMs)) * 100))}%`;
                const snapGuidePct = isSnapping
                  ? `${Math.max(0, Math.min(100, ((dragState?.snapGuideMs || 0) / Math.max(1, globalDurationMs)) * 100))}%`
                  : '0%';
                const cursorSnapPct = isCursorSnapping
                  ? `${Math.max(0, Math.min(100, ((cursorSnapGuideMs || 0) / Math.max(1, globalDurationMs)) * 100))}%`
                  : '0%';
                const showGuide = isSnapping || isCursorSnapping;
                const guidePct = isSnapping ? snapGuidePct : cursorSnapPct;
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
                    ].filter(Boolean).join(' ')}
                    ref={(node) => { if (node) clipCardRefs.current.set(clip.id, node); else clipCardRefs.current.delete(clip.id); }}
                  >
                    {/* ── 紧凑行（始终可见） */}
                    <div
                      className="tl-clip-row"
                      onClick={() => setExpandedClipId(isExpanded ? null : clip.id)}
                    >
                      {/* 类型色点 */}
                      <span className={`tl-type-dot tl-type-${clip.type}`} data-tooltip={getClipTypeLabel(clip.type)} />

                      {/* 类型名 */}
                      <span className="tl-clip-type-name">
                        {getClipTypeLabel(clip.type)}
                        {isConflict && (
                          <span className="tl-conflict-tag" data-tooltip={`冲突域：${conflictDomains.map(getConflictDomainLabel).join(' / ')}`}>!</span>
                        )}
                      </span>

                      {/* 轨道条 */}
                      <div className="tl-track-scroll">
                        <div
                          className="tl-track"
                          style={{ width: `${timelineZoomPercent}%` }}
                          onClick={seekByTrackClick}
                          ref={(node) => { if (node) clipTrackRefs.current.set(clip.id, node); else clipTrackRefs.current.delete(clip.id); }}
                        >
                          <div className="tl-track-playhead" style={{ left: playheadPct }} />
                          {showGuide && (
                            <div className={`tl-track-guide${isCursorSnapping ? ' is-cursor' : ''}`} style={{ left: guidePct }} />
                          )}
                          <div
                            className={`tl-track-fill tl-type-fill-${clip.type}${isDragging ? ' is-dragging' : ''}${isSnapping ? ' is-snapped' : ''}`}
                            style={getClipTrackStyle(effStart, effDuration)}
                            onMouseDown={(e) => startClipDrag(clip, e)}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="tl-track-handle-l" onMouseDown={(e) => startClipResizeStart(clip, e)} onClick={(e) => e.stopPropagation()} />
                            <div className="tl-track-handle-r" onMouseDown={(e) => startClipResizeEnd(clip, e)} onClick={(e) => e.stopPropagation()} />
                          </div>
                        </div>
                      </div>

                      {/* 时长 */}
                      <span className="tl-clip-dur">{effDuration}ms</span>

                      {/* 批量选中 */}
                      {showBatchPanel && (
                        <label className="tl-clip-check" onClick={(e) => e.stopPropagation()} data-tooltip="批量选中">
                          <input
                            type="checkbox"
                            checked={isBatchSelected}
                            onChange={(e) => toggleBatchClipSelection(clip.id, e.target.checked)}
                          />
                        </label>
                      )}

                      {/* 启用开关 */}
                      <label className="tl-clip-enable" onClick={(e) => e.stopPropagation()} data-tooltip={clip.enabled !== false ? '已启用（点击禁用）' : '已禁用（点击启用）'}>
                        <input
                          type="checkbox"
                          checked={clip.enabled !== false}
                          onChange={(e) => { ensurePausedForEdit(); updateAnimationClip(clip.id, { enabled: e.target.checked }); }}
                        />
                      </label>

                      {/* 删除 */}
                      <button
                        className="tl-clip-del"
                        data-tooltip="删除片段"
                        onClick={(e) => { e.stopPropagation(); ensurePausedForEdit(); removeAnimationClip(clip.id); }}
                      >
                        ✕
                      </button>

                      {/* 展开箭头 */}
                      <span className="tl-clip-arrow">{isExpanded ? '▲' : '▼'}</span>
                    </div>

                    {/* ── 展开详情 */}
                    {isExpanded && (
                      <div className="tl-clip-detail">

                        {/* 时间 + 操作 */}
                        <div className="tl-detail-row">
                          <label className="tl-detail-label">
                            开始(ms)
                            <input className="tl-input-sm" type="number" min={0} value={effStart} onChange={(e) => updateClipNumberField(clip, 'startTimeMs', e.target.value)} />
                          </label>
                          <label className="tl-detail-label">
                            时长(ms)
                            <input className="tl-input-sm" type="number" min={1} value={effDuration} onChange={(e) => updateClipNumberField(clip, 'durationMs', e.target.value)} />
                          </label>
                          <button className="tl-btn tl-btn-sm" onClick={() => { ensurePausedForEdit(); setCurrentTimeMs(clip.startTimeMs); }}>跳到</button>
                          <button className="tl-btn tl-btn-sm" onClick={() => duplicateClip(clip)}>复制</button>
                        </div>

                        {/* 缓动 */}
                        <div className="tl-easing-row">
                          <span className="tl-section-label">缓动</span>
                          <div className="tl-easing-presets">
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
                          <div className="tl-easing-preview-wrap">
                            <svg viewBox="0 0 88 52" className="tl-easing-svg" aria-hidden="true">
                              <path d="M 4 48 L 84 4" className="tl-easing-base" />
                              <path d={getEasingPreviewPath(ex1, ey1, ex2, ey2)} className="tl-easing-curve" />
                            </svg>
                          </div>
                          <button
                            type="button"
                            className={`tl-btn tl-btn-sm${showAdvancedEasing ? ' is-active' : ''}`}
                            onClick={() => setShowAdvancedEasing((p) => !p)}
                          >
                            高级
                          </button>
                        </div>

                        {/* 高级缓动：贝塞尔控制点 */}
                        {showAdvancedEasing && (
                          <div className="tl-easing-advanced">
                            {(
                              [
                                { label: 'x1', idx: 0 as const, min: 0, max: 1, step: 0.01, val: ex1 },
                                { label: 'y1', idx: 1 as const, min: -2, max: 2, step: 0.01, val: ey1 },
                                { label: 'x2', idx: 2 as const, min: 0, max: 1, step: 0.01, val: ex2 },
                                { label: 'y2', idx: 3 as const, min: -2, max: 2, step: 0.01, val: ey2 },
                              ]
                            ).map((f) => (
                              <label key={f.label} className="tl-detail-label">
                                {f.label}
                                <input type="number" min={f.min} max={f.max} step={f.step} value={formatBezierValue(f.val)} onChange={(e) => updateClipBezierControlPoint(clip, f.idx, e.target.value)} />
                              </label>
                            ))}
                          </div>
                        )}

                        {/* 类型专属字段 */}
                        {clip.type === 'move' && (
                          <div className="tl-payload-section">
                            <div className="tl-grab-row">
                              <button
                                type="button"
                                className="tl-btn tl-btn-sm"
                                data-tooltip="将对象当前位置设为起点"
                                onClick={() => selectedObjectAtCurrentTime && updateClipPayload(clip, { fromX: Math.round(selectedObjectAtCurrentTime.x), fromY: Math.round(selectedObjectAtCurrentTime.y) })}
                              >
                                取当前位置 → 起点
                              </button>
                              <button
                                type="button"
                                className="tl-btn tl-btn-sm"
                                data-tooltip="将对象当前位置设为终点"
                                onClick={() => selectedObjectAtCurrentTime && updateClipPayload(clip, { toX: Math.round(selectedObjectAtCurrentTime.x), toY: Math.round(selectedObjectAtCurrentTime.y) })}
                              >
                                取当前位置 → 终点
                              </button>
                            </div>
                            <div className="tl-payload-grid">
                              <label className="tl-detail-label">起点X<input type="number" value={clip.payload.fromX} onChange={(e) => updatePayloadNumberField(clip, 'fromX', e.target.value)} /></label>
                              <label className="tl-detail-label">起点Y<input type="number" value={clip.payload.fromY} onChange={(e) => updatePayloadNumberField(clip, 'fromY', e.target.value)} /></label>
                              <label className="tl-detail-label">终点X<input type="number" value={clip.payload.toX} onChange={(e) => updatePayloadNumberField(clip, 'toX', e.target.value)} /></label>
                              <label className="tl-detail-label">终点Y<input type="number" value={clip.payload.toY} onChange={(e) => updatePayloadNumberField(clip, 'toY', e.target.value)} /></label>
                            </div>
                            <div className="tl-keyframe-section">
                              <div className="tl-keyframe-header">
                                <span className="tl-section-label">关键帧</span>
                                <button type="button" className="tl-btn tl-btn-sm" onClick={() => addMoveKeyframe(clip)}>+ 添加</button>
                              </div>
                              {(clip.payload.keyframes || []).length === 0 ? (
                                <span className="tl-kf-empty">无</span>
                              ) : (
                                (clip.payload.keyframes || []).map((frame, i) => (
                                  <div className="tl-kf-row" key={`${frame.at}-${i}`}>
                                    <input type="number" min={0} max={100} step={1} value={Number((frame.at * 100).toFixed(1))} onChange={(e) => updateMoveKeyframeField(clip, i, 'at', e.target.value)} data-tooltip="时间(%)" />
                                    <input type="number" value={frame.x} onChange={(e) => updateMoveKeyframeField(clip, i, 'x', e.target.value)} data-tooltip="X" />
                                    <input type="number" value={frame.y} onChange={(e) => updateMoveKeyframeField(clip, i, 'y', e.target.value)} data-tooltip="Y" />
                                    <button type="button" className="tl-kf-del" onClick={() => removeMoveKeyframe(clip, i)}>✕</button>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        )}

                        {clip.type === 'moveAlongPath' && (
                          <div className="tl-payload-section">
                            <div className="tl-grab-row">
                              <button
                                type="button"
                                className="tl-btn tl-btn-sm"
                                data-tooltip="将对象当前位置设为起点"
                                onClick={() => selectedObjectAtCurrentTime && updateClipPayload(clip, { fromX: Math.round(selectedObjectAtCurrentTime.x), fromY: Math.round(selectedObjectAtCurrentTime.y) })}
                              >
                                取当前位置 → 起点
                              </button>
                              <button
                                type="button"
                                className="tl-btn tl-btn-sm"
                                data-tooltip="将对象当前位置设为终点"
                                onClick={() => selectedObjectAtCurrentTime && updateClipPayload(clip, { toX: Math.round(selectedObjectAtCurrentTime.x), toY: Math.round(selectedObjectAtCurrentTime.y) })}
                              >
                                取当前位置 → 终点
                              </button>
                            </div>
                            <div className="tl-payload-grid">
                              <label className="tl-detail-label">起点X<input type="number" value={clip.payload.fromX} onChange={(e) => updatePayloadNumberField(clip, 'fromX', e.target.value)} /></label>
                              <label className="tl-detail-label">起点Y<input type="number" value={clip.payload.fromY} onChange={(e) => updatePayloadNumberField(clip, 'fromY', e.target.value)} /></label>
                              <label className="tl-detail-label">控制点X<input type="number" value={clip.payload.controlX} onChange={(e) => updatePayloadNumberField(clip, 'controlX', e.target.value)} /></label>
                              <label className="tl-detail-label">控制点Y<input type="number" value={clip.payload.controlY} onChange={(e) => updatePayloadNumberField(clip, 'controlY', e.target.value)} /></label>
                              <label className="tl-detail-label">终点X<input type="number" value={clip.payload.toX} onChange={(e) => updatePayloadNumberField(clip, 'toX', e.target.value)} /></label>
                              <label className="tl-detail-label">终点Y<input type="number" value={clip.payload.toY} onChange={(e) => updatePayloadNumberField(clip, 'toY', e.target.value)} /></label>
                            </div>
                          </div>
                        )}

                        {clip.type === 'shake' && (
                          <div className="tl-payload-grid">
                            <label className="tl-detail-label">基准X<input type="number" value={clip.payload.baseX} onChange={(e) => updatePayloadNumberField(clip, 'baseX', e.target.value)} /></label>
                            <label className="tl-detail-label">基准Y<input type="number" value={clip.payload.baseY} onChange={(e) => updatePayloadNumberField(clip, 'baseY', e.target.value)} /></label>
                            <label className="tl-detail-label">振幅X<input type="number" min={0} value={clip.payload.amplitudeX} onChange={(e) => updatePayloadNumberField(clip, 'amplitudeX', e.target.value)} /></label>
                            <label className="tl-detail-label">振幅Y<input type="number" min={0} value={clip.payload.amplitudeY} onChange={(e) => updatePayloadNumberField(clip, 'amplitudeY', e.target.value)} /></label>
                            <label className="tl-detail-label">频率<input type="number" min={0} value={clip.payload.frequency} onChange={(e) => updatePayloadNumberField(clip, 'frequency', e.target.value)} /></label>
                            <label className="tl-detail-label">衰减<input type="number" min={0} step={0.1} value={clip.payload.decay ?? 1} onChange={(e) => updatePayloadNumberField(clip, 'decay', e.target.value)} /></label>
                          </div>
                        )}

                        {clip.type === 'fade' && (
                          <div className="tl-payload-section">
                            <div className="tl-payload-grid">
                              <label className="tl-detail-label">起始透明度<input type="number" min={0} max={1} step={0.01} value={clip.payload.fromOpacity} onChange={(e) => updatePayloadNumberField(clip, 'fromOpacity', e.target.value)} /></label>
                              <label className="tl-detail-label">结束透明度<input type="number" min={0} max={1} step={0.01} value={clip.payload.toOpacity} onChange={(e) => updatePayloadNumberField(clip, 'toOpacity', e.target.value)} /></label>
                            </div>
                            <div className="tl-keyframe-section">
                              <div className="tl-keyframe-header">
                                <span className="tl-section-label">关键帧</span>
                                <button type="button" className="tl-btn tl-btn-sm" onClick={() => addFadeKeyframe(clip)}>+ 添加</button>
                              </div>
                              {(clip.payload.keyframes || []).length === 0 ? (
                                <span className="tl-kf-empty">无</span>
                              ) : (
                                (clip.payload.keyframes || []).map((frame, i) => (
                                  <div className="tl-kf-row" key={`${frame.at}-${i}`}>
                                    <input type="number" min={0} max={100} step={1} value={Number((frame.at * 100).toFixed(1))} onChange={(e) => updateFadeKeyframeField(clip, i, 'at', e.target.value)} data-tooltip="时间(%)" />
                                    <input type="number" min={0} max={1} step={0.01} value={frame.value} onChange={(e) => updateFadeKeyframeField(clip, i, 'value', e.target.value)} data-tooltip="透明度" />
                                    <button type="button" className="tl-kf-del" onClick={() => removeFadeKeyframe(clip, i)}>✕</button>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        )}

                        {clip.type === 'scale' && (
                          <div className="tl-payload-section">
                            <div className="tl-payload-grid">
                              <label className="tl-detail-label">起始缩放X<input type="number" step={0.01} value={clip.payload.fromScaleX} onChange={(e) => updatePayloadNumberField(clip, 'fromScaleX', e.target.value)} /></label>
                              <label className="tl-detail-label">起始缩放Y<input type="number" step={0.01} value={clip.payload.fromScaleY} onChange={(e) => updatePayloadNumberField(clip, 'fromScaleY', e.target.value)} /></label>
                              <label className="tl-detail-label">结束缩放X<input type="number" step={0.01} value={clip.payload.toScaleX} onChange={(e) => updatePayloadNumberField(clip, 'toScaleX', e.target.value)} /></label>
                              <label className="tl-detail-label">结束缩放Y<input type="number" step={0.01} value={clip.payload.toScaleY} onChange={(e) => updatePayloadNumberField(clip, 'toScaleY', e.target.value)} /></label>
                            </div>
                            <div className="tl-keyframe-section">
                              <div className="tl-keyframe-header">
                                <span className="tl-section-label">关键帧</span>
                                <button type="button" className="tl-btn tl-btn-sm" onClick={() => addScaleKeyframe(clip)}>+ 添加</button>
                              </div>
                              {(clip.payload.keyframes || []).length === 0 ? (
                                <span className="tl-kf-empty">无</span>
                              ) : (
                                (clip.payload.keyframes || []).map((frame, i) => (
                                  <div className="tl-kf-row tl-kf-row-wide" key={`${frame.at}-${i}`}>
                                    <input type="number" min={0} max={100} step={1} value={Number((frame.at * 100).toFixed(1))} onChange={(e) => updateScaleKeyframeField(clip, i, 'at', e.target.value)} data-tooltip="时间(%)" />
                                    <input type="number" step={0.01} value={frame.scaleX} onChange={(e) => updateScaleKeyframeField(clip, i, 'scaleX', e.target.value)} data-tooltip="缩放X" />
                                    <input type="number" step={0.01} value={frame.scaleY} onChange={(e) => updateScaleKeyframeField(clip, i, 'scaleY', e.target.value)} data-tooltip="缩放Y" />
                                    <button type="button" className="tl-kf-del" onClick={() => removeScaleKeyframe(clip, i)}>✕</button>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        )}

                        {clip.type === 'rotate' && (
                          <div className="tl-payload-section">
                            <div className="tl-payload-grid">
                              <label className="tl-detail-label">起始角度<input type="number" value={clip.payload.fromRotation} onChange={(e) => updatePayloadNumberField(clip, 'fromRotation', e.target.value)} /></label>
                              <label className="tl-detail-label">结束角度<input type="number" value={clip.payload.toRotation} onChange={(e) => updatePayloadNumberField(clip, 'toRotation', e.target.value)} /></label>
                            </div>
                            <div className="tl-keyframe-section">
                              <div className="tl-keyframe-header">
                                <span className="tl-section-label">关键帧</span>
                                <button type="button" className="tl-btn tl-btn-sm" onClick={() => addRotateKeyframe(clip)}>+ 添加</button>
                              </div>
                              {(clip.payload.keyframes || []).length === 0 ? (
                                <span className="tl-kf-empty">无</span>
                              ) : (
                                (clip.payload.keyframes || []).map((frame, i) => (
                                  <div className="tl-kf-row" key={`${frame.at}-${i}`}>
                                    <input type="number" min={0} max={100} step={1} value={Number((frame.at * 100).toFixed(1))} onChange={(e) => updateRotateKeyframeField(clip, i, 'at', e.target.value)} data-tooltip="时间(%)" />
                                    <input type="number" value={frame.value} onChange={(e) => updateRotateKeyframeField(clip, i, 'value', e.target.value)} data-tooltip="角度" />
                                    <button type="button" className="tl-kf-del" onClick={() => removeRotateKeyframe(clip, i)}>✕</button>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        )}

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
