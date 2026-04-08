import { useEffect, useMemo, useRef, useState } from 'react';
import { useEditorStore } from '../../state/editorStore';
import { buildAnimatedPreviewObjects } from '../../animation/engine';
import type { AnimationClip } from '../../types';
import './TimelinePanel.css';

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

const findPresetByValue = (value: string) =>
  EASING_PRESET_OPTIONS.find((item) => item.value === value);

const parseEasingControlPoints = (easing?: AnimationClip['easing']) => {
  const raw = easing || 'linear';
  const preset = findPresetByValue(raw);
  if (preset) {
    return {
      points: [...preset.points] as [number, number, number, number],
    };
  }
  const matched = /^cubic-bezier\(\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*\)$/i.exec(raw);
  if (matched) {
    const x1 = clamp01(parseFloat(matched[1]));
    const y1 = parseFloat(matched[2]);
    const x2 = clamp01(parseFloat(matched[3]));
    const y2 = parseFloat(matched[4]);
    if (![x1, y1, x2, y2].some((value) => Number.isNaN(value))) {
      return {
        points: [x1, y1, x2, y2] as [number, number, number, number],
      };
    }
  }

  return {
    points: [0, 0, 1, 1] as [number, number, number, number],
  };
};

const formatBezierValue = (value: number) => {
  const rounded = Math.round(value * 1000) / 1000;
  return Number(rounded.toFixed(3));
};

const buildBezierEasingValue = (x1: number, y1: number, x2: number, y2: number) =>
  `cubic-bezier(${formatBezierValue(x1)},${formatBezierValue(y1)},${formatBezierValue(x2)},${formatBezierValue(y2)})` as AnimationClip['easing'];

const getEasingPreviewPath = (x1: number, y1: number, x2: number, y2: number) => {
  const width = 88;
  const height = 52;
  const startX = 4;
  const startY = height - 4;
  const endX = width - 4;
  const endY = 4;
  const c1x = startX + (endX - startX) * x1;
  const c1y = startY - (startY - endY) * y1;
  const c2x = startX + (endX - startX) * x2;
  const c2y = startY - (startY - endY) * y2;
  return `M ${startX} ${startY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${endX} ${endY}`;
};

const sortAndSanitizeInternalKeyframes = <T extends { at: number }>(keyframes: T[]) => {
  const sorted = keyframes
    .filter((frame) => Number.isFinite(frame.at))
    .map((frame) => ({
      ...frame,
      at: clamp01(frame.at),
    }))
    .filter((frame) => frame.at > 0 && frame.at < 1)
    .sort((a, b) => a.at - b.at);

  const deduped: T[] = [];
  for (const frame of sorted) {
    const prev = deduped[deduped.length - 1];
    if (prev && Math.abs(prev.at - frame.at) < 0.0001) {
      deduped[deduped.length - 1] = frame;
      continue;
    }
    deduped.push(frame);
  }
  return deduped;
};

const getConflictDomain = (clipType: AnimationClip['type']) => {
  switch (clipType) {
    case 'move':
    case 'moveAlongPath':
    case 'shake':
      return 'position';
    case 'fade':
      return 'opacity';
    case 'scale':
      return 'scale';
    case 'rotate':
      return 'rotation';
    case 'stateChange':
      return 'state';
    default:
      return clipType;
  }
};

const getConflictDomainLabel = (domain: string) => {
  switch (domain) {
    case 'position':
      return '位置';
    case 'opacity':
      return '透明度';
    case 'scale':
      return '缩放';
    case 'rotation':
      return '旋转';
    case 'state':
      return '状态';
    default:
      return domain;
  }
};

const sortConflictDomains = (domains: string[]) =>
  [...domains].sort((a, b) => {
    const indexA = CONFLICT_DOMAIN_ORDER.indexOf(a);
    const indexB = CONFLICT_DOMAIN_ORDER.indexOf(b);
    const rankA = indexA === -1 ? Number.MAX_SAFE_INTEGER : indexA;
    const rankB = indexB === -1 ? Number.MAX_SAFE_INTEGER : indexB;
    return rankA - rankB;
  });

export function TimelinePanel() {
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
  const objects = useEditorStore((state) => state.objects);
  const selectedIds = useEditorStore((state) => state.selectedIds);
  const animations = useEditorStore((state) => state.animations);
  const playbackStatus = useEditorStore((state) => state.playbackStatus);
  const globalDurationMs = useEditorStore((state) => state.globalDurationMs);
  const currentTimeMs = useEditorStore((state) => state.currentTimeMs);
  const setGlobalDurationMs = useEditorStore((state) => state.setGlobalDurationMs);
  const setCurrentTimeMs = useEditorStore((state) => state.setCurrentTimeMs);
  const pause = useEditorStore((state) => state.pause);
  const addAnimationClip = useEditorStore((state) => state.addAnimationClip);
  const updateAnimationClip = useEditorStore((state) => state.updateAnimationClip);
  const removeAnimationClip = useEditorStore((state) => state.removeAnimationClip);

  const selectedObject = useMemo(
    () => objects.find((obj) => obj.id === selectedIds[0]) || null,
    [objects, selectedIds],
  );

  const previewObjectsAtCurrentTime = useMemo(() => {
    if (currentTimeMs <= 0 || animations.length === 0) return objects;
    return buildAnimatedPreviewObjects(objects, animations, currentTimeMs);
  }, [objects, animations, currentTimeMs]);

  const selectedObjectAtCurrentTime = useMemo(
    () => previewObjectsAtCurrentTime.find((obj) => obj.id === selectedIds[0]) || null,
    [previewObjectsAtCurrentTime, selectedIds],
  );

  const selectedObjectClips = useMemo(
    () =>
      selectedObject
        ? animations
            .filter((clip) => clip.objectId === selectedObject.id)
            .sort((a, b) => a.startTimeMs - b.startTimeMs)
        : [],
    [animations, selectedObject],
  );

  const batchSelectedClipIdSet = useMemo(
    () => new Set(batchSelectedClipIds),
    [batchSelectedClipIds],
  );

  const selectedBatchClips = useMemo(
    () => selectedObjectClips.filter((clip) => batchSelectedClipIdSet.has(clip.id)),
    [selectedObjectClips, batchSelectedClipIdSet],
  );

  const conflictMeta = useMemo(() => {
    const conflictIds = new Set<string>();
    const rawDomainsByClipId = new Map<string, Set<string>>();
    const globalConflictDomains = new Set<string>();

    const markConflict = (clipId: string, domain: string) => {
      conflictIds.add(clipId);
      const current = rawDomainsByClipId.get(clipId) || new Set<string>();
      current.add(domain);
      rawDomainsByClipId.set(clipId, current);
      globalConflictDomains.add(domain);
    };

    for (let i = 0; i < selectedObjectClips.length; i += 1) {
      const first = selectedObjectClips[i];
      if (first.enabled === false) continue;
      const firstStart = dragState?.clipId === first.id ? dragState.previewStartMs : first.startTimeMs;
      const firstDuration =
        dragState?.clipId === first.id ? dragState.previewDurationMs : first.durationMs;
      const firstEnd = firstStart + Math.max(1, firstDuration);

      for (let j = i + 1; j < selectedObjectClips.length; j += 1) {
        const second = selectedObjectClips[j];
        if (second.enabled === false) continue;
        const conflictDomain = getConflictDomain(first.type);
        if (conflictDomain !== getConflictDomain(second.type)) continue;
        const secondStart =
          dragState?.clipId === second.id ? dragState.previewStartMs : second.startTimeMs;
        const secondDuration =
          dragState?.clipId === second.id ? dragState.previewDurationMs : second.durationMs;
        const secondEnd = secondStart + Math.max(1, secondDuration);

        const isOverlapping = firstStart < secondEnd && secondStart < firstEnd;
        if (isOverlapping) {
          markConflict(first.id, conflictDomain);
          markConflict(second.id, conflictDomain);
        }
      }
    }

    const domainsByClipId = new Map<string, string[]>();
    rawDomainsByClipId.forEach((domains, clipId) => {
      domainsByClipId.set(clipId, sortConflictDomains([...domains]));
    });

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
        clip,
        index,
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

  const getSnapCandidates = (activeClipId: string) => {
    const candidates: number[] = [0, globalDurationMs];
    for (const clip of selectedObjectClips) {
      if (clip.id === activeClipId) continue;
      candidates.push(clip.startTimeMs, clip.startTimeMs + clip.durationMs);
    }
    return candidates;
  };

  const snapWithMeta = (
    valueMs: number,
    candidates: number[],
    thresholdMs: number,
  ) => {
    let bestValue = valueMs;
    let bestDelta = thresholdMs + 1;
    for (const candidate of candidates) {
      const delta = Math.abs(candidate - valueMs);
      if (delta <= thresholdMs && delta < bestDelta) {
        bestValue = candidate;
        bestDelta = delta;
      }
    }
    return {
      value: bestValue,
      snapped: bestDelta <= thresholdMs,
    };
  };

  const getCursorSnapCandidates = () => {
    const candidates: number[] = [0, globalDurationMs];
    for (const clip of selectedObjectClips) {
      candidates.push(clip.startTimeMs, clip.startTimeMs + clip.durationMs);
    }
    return candidates;
  };

  const getCursorSnapResult = (timeMs: number) => {
    const clamped = Math.max(0, Math.min(globalDurationMs, timeMs));
    const thresholdMs = Math.max(20, Math.round(globalDurationMs * 0.003));
    return snapWithMeta(clamped, getCursorSnapCandidates(), thresholdMs);
  };

  const syncDurationIfNeeded = (clip: AnimationClip) => {
    const clipEnd = clip.startTimeMs + clip.durationMs;
    if (clipEnd > globalDurationMs) {
      setGlobalDurationMs(clipEnd + 1000);
    }
  };

  const ensurePausedForEdit = () => {
    if (playbackStatus === 'playing') {
      pause();
    }
  };

  const createClip = (type: 'move' | 'moveAlongPath' | 'shake' | 'fade' | 'scale' | 'rotate') => {
    if (!selectedObject) return;
    ensurePausedForEdit();
    const sourceObject = selectedObjectAtCurrentTime || selectedObject;
    const base = {
      id: crypto.randomUUID(),
      objectId: selectedObject.id,
      type,
      startTimeMs: currentTimeMs,
      durationMs: 1000,
      easing: 'linear' as const,
      enabled: true,
    };

    let clip: AnimationClip;
    switch (type) {
      case 'move':
        clip = {
          ...base,
          type: 'move',
          payload: {
            fromX: sourceObject.x,
            fromY: sourceObject.y,
            toX: sourceObject.x + 120,
            toY: sourceObject.y + 80,
          },
        };
        break;
      case 'moveAlongPath':
        clip = {
          ...base,
          type: 'moveAlongPath',
          payload: {
            fromX: sourceObject.x,
            fromY: sourceObject.y,
            controlX: sourceObject.x + 80,
            controlY: sourceObject.y - 100,
            toX: sourceObject.x + 160,
            toY: sourceObject.y,
          },
        };
        break;
      case 'shake':
        clip = {
          ...base,
          type: 'shake',
          payload: {
            baseX: sourceObject.x,
            baseY: sourceObject.y,
            amplitudeX: 16,
            amplitudeY: 8,
            frequency: 6,
            decay: 1,
          },
        };
        break;
      case 'fade':
        clip = {
          ...base,
          type: 'fade',
          payload: {
            fromOpacity: sourceObject.opacity,
            toOpacity: Math.max(0.1, sourceObject.opacity * 0.4),
          },
        };
        break;
      case 'scale':
        clip = {
          ...base,
          type: 'scale',
          payload: {
            fromScaleX: sourceObject.scaleX,
            fromScaleY: sourceObject.scaleY,
            toScaleX: sourceObject.scaleX * 1.2,
            toScaleY: sourceObject.scaleY * 1.2,
          },
        };
        break;
      case 'rotate':
      default:
        clip = {
          ...base,
          type: 'rotate',
          payload: {
            fromRotation: sourceObject.rotation,
            toRotation: sourceObject.rotation + 90,
          },
        };
        break;
    }

    addAnimationClip(clip);
    syncDurationIfNeeded(clip);
    setFlashClipId(clip.id);
  };

  const createPresetTemplate = (template: 'fadeIn' | 'bounceIn' | 'moveFadeIn') => {
    if (!selectedObject) return;
    ensurePausedForEdit();

    const sourceObject = selectedObjectAtCurrentTime || selectedObject;
    const createdClips: AnimationClip[] = [];

    if (template === 'fadeIn') {
      const clip: AnimationClip = {
        id: crypto.randomUUID(),
        objectId: selectedObject.id,
        type: 'fade',
        startTimeMs: currentTimeMs,
        durationMs: 700,
        easing: 'ease-out',
        enabled: true,
        payload: {
          fromOpacity: 0,
          toOpacity: clamp01(sourceObject.opacity),
        },
      };
      createdClips.push(clip);
    }

    if (template === 'bounceIn') {
      const scaleClip: AnimationClip = {
        id: crypto.randomUUID(),
        objectId: selectedObject.id,
        type: 'scale',
        startTimeMs: currentTimeMs,
        durationMs: 900,
        easing: 'cubic-bezier(0.2,0.9,0.2,1)',
        enabled: true,
        payload: {
          fromScaleX: sourceObject.scaleX * 0.45,
          fromScaleY: sourceObject.scaleY * 0.45,
          toScaleX: sourceObject.scaleX,
          toScaleY: sourceObject.scaleY,
          keyframes: [
            {
              at: 0.55,
              scaleX: sourceObject.scaleX * 1.12,
              scaleY: sourceObject.scaleY * 1.12,
            },
            {
              at: 0.78,
              scaleX: sourceObject.scaleX * 0.96,
              scaleY: sourceObject.scaleY * 0.96,
            },
          ],
        },
      };
      const fadeClip: AnimationClip = {
        id: crypto.randomUUID(),
        objectId: selectedObject.id,
        type: 'fade',
        startTimeMs: currentTimeMs,
        durationMs: 500,
        easing: 'ease-out',
        enabled: true,
        payload: {
          fromOpacity: 0,
          toOpacity: clamp01(sourceObject.opacity),
        },
      };
      createdClips.push(scaleClip, fadeClip);
    }

    if (template === 'moveFadeIn') {
      const moveClip: AnimationClip = {
        id: crypto.randomUUID(),
        objectId: selectedObject.id,
        type: 'move',
        startTimeMs: currentTimeMs,
        durationMs: 800,
        easing: 'ease-out',
        enabled: true,
        payload: {
          fromX: sourceObject.x - 120,
          fromY: sourceObject.y,
          toX: sourceObject.x,
          toY: sourceObject.y,
        },
      };
      const fadeClip: AnimationClip = {
        id: crypto.randomUUID(),
        objectId: selectedObject.id,
        type: 'fade',
        startTimeMs: currentTimeMs,
        durationMs: 800,
        easing: 'ease-out',
        enabled: true,
        payload: {
          fromOpacity: 0,
          toOpacity: clamp01(sourceObject.opacity),
        },
      };
      createdClips.push(moveClip, fadeClip);
    }

    if (createdClips.length === 0) return;
    for (const clip of createdClips) {
      addAnimationClip(clip);
      syncDurationIfNeeded(clip);
    }
    setFlashClipId(createdClips[createdClips.length - 1].id);
  };

  const duplicateClip = (clip: AnimationClip) => {
    ensurePausedForEdit();
    const duplicated = JSON.parse(JSON.stringify(clip)) as AnimationClip;
    duplicated.id = crypto.randomUUID();
    duplicated.startTimeMs = clip.startTimeMs + clip.durationMs;
    addAnimationClip(duplicated);
    syncDurationIfNeeded(duplicated);
    setFlashClipId(duplicated.id);
  };
  useEffect(() => {
    if (!flashClipId) return;
    const targetCard = clipCardRefs.current.get(flashClipId);
    if (targetCard) {
      targetCard.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    const timer = window.setTimeout(() => setFlashClipId(null), 1200);
    return () => window.clearTimeout(timer);
  }, [flashClipId]);

  useEffect(() => {
    setBatchSelectedClipIds((prev) => {
      if (prev.length === 0) return prev;
      const validIds = new Set(selectedObjectClips.map((clip) => clip.id));
      const filtered = prev.filter((id) => validIds.has(id));
      return filtered.length === prev.length ? prev : filtered;
    });
  }, [selectedObjectClips]);

  useEffect(() => {
    if (cursorSnapGuideMs === null) return;
    const timer = window.setTimeout(() => setCursorSnapGuideMs(null), 350);
    return () => window.clearTimeout(timer);
  }, [cursorSnapGuideMs]);

  useEffect(() => {
    if (!isCursorDragging) return;
    const stopDrag = () => setIsCursorDragging(false);
    window.addEventListener('mouseup', stopDrag);
    window.addEventListener('touchend', stopDrag);
    return () => {
      window.removeEventListener('mouseup', stopDrag);
      window.removeEventListener('touchend', stopDrag);
    };
  }, [isCursorDragging]);

  useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (event: MouseEvent) => {
      const trackEl = clipTrackRefs.current.get(dragState.clipId);
      if (!trackEl) return;
      const rect = trackEl.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const pointerMs = ratio * globalDurationMs;
      const snapThresholdMs = Math.max(1, (globalDurationMs * SNAP_DISTANCE_PX) / rect.width);
      const snapCandidates = getSnapCandidates(dragState.clipId);
      const shouldSnap = !event.shiftKey;
      const applySnap = (valueMs: number) =>
        shouldSnap
          ? snapWithMeta(valueMs, snapCandidates, snapThresholdMs)
          : { value: valueMs, snapped: false };
      if (dragState.mode === 'move') {
        const rawStartMs = Math.max(0, Math.round(pointerMs - dragState.offsetMs));
        const snappedByStart = applySnap(rawStartMs);
        const rawEndMs = rawStartMs + dragState.previewDurationMs;
        const snappedEnd = applySnap(rawEndMs);
        const snappedByEnd = Math.max(0, snappedEnd.value - dragState.previewDurationMs);
        const deltaStart = Math.abs(snappedByStart.value - rawStartMs);
        const deltaEnd = Math.abs(snappedByEnd - rawStartMs);
        const useStartSnap = deltaStart <= deltaEnd;
        const nextStartMs = useStartSnap ? snappedByStart.value : snappedByEnd;
        const snapGuideMs =
          useStartSnap
            ? (snappedByStart.snapped ? snappedByStart.value : null)
            : (snappedEnd.snapped ? snappedEnd.value : null);
        setDragState((prev) =>
          prev ? { ...prev, previewStartMs: nextStartMs, snapGuideMs } : prev,
        );
        return;
      }
      if (dragState.mode === 'resize-start') {
        const snappedStart = applySnap(Math.round(pointerMs - dragState.offsetMs));
        const maxStartMs = Math.max(0, dragState.fixedEndMs - 1);
        const nextStartMs = Math.max(0, Math.min(snappedStart.value, maxStartMs));
        const nextDuration = Math.max(1, dragState.fixedEndMs - nextStartMs);
        setDragState((prev) =>
          prev
            ? {
              ...prev,
              previewStartMs: nextStartMs,
              previewDurationMs: nextDuration,
              snapGuideMs: snappedStart.snapped ? snappedStart.value : null,
            }
            : prev,
        );
        return;
      }
      const snappedEnd = applySnap(Math.round(pointerMs - dragState.offsetMs));
      const nextEndMs = snappedEnd.value;
      const nextDuration = Math.max(1, nextEndMs - dragState.previewStartMs);
      setDragState((prev) =>
        prev
          ? {
            ...prev,
            previewDurationMs: nextDuration,
            snapGuideMs: snappedEnd.snapped ? snappedEnd.value : null,
          }
          : prev,
      );
    };

    const handleMouseUp = () => {
      const clip = animations.find((item) => item.id === dragState.clipId);
      if (clip) {
        const nextStart = Math.max(0, dragState.previewStartMs);
        const nextDuration = Math.max(1, dragState.previewDurationMs);
        if (nextStart !== clip.startTimeMs || nextDuration !== clip.durationMs) {
          ensurePausedForEdit();
          updateAnimationClip(clip.id, {
            startTimeMs: nextStart,
            durationMs: nextDuration,
          });
          const nextEnd = nextStart + nextDuration;
          if (nextEnd > globalDurationMs) {
            setGlobalDurationMs(nextEnd + 1000);
          }
        }
      }
      setDragState(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [
    animations,
    dragState,
    globalDurationMs,
    selectedObjectClips,
    setGlobalDurationMs,
    updateAnimationClip,
    playbackStatus,
    pause,
  ]);

  const updateClipNumberField = (
    clip: AnimationClip,
    field: 'startTimeMs' | 'durationMs',
    rawValue: string,
  ) => {
    ensurePausedForEdit();
    const parsed = parseInt(rawValue, 10);
    if (Number.isNaN(parsed)) return;

    const nextValue = field === 'durationMs' ? clampPositive(parsed, 1000) : Math.max(0, parsed);
    const updates = { [field]: nextValue } as Partial<AnimationClip>;
    updateAnimationClip(clip.id, updates);

    const nextEnd =
      (field === 'startTimeMs' ? nextValue : clip.startTimeMs) +
      (field === 'durationMs' ? nextValue : clip.durationMs);
    if (nextEnd > globalDurationMs) {
      setGlobalDurationMs(nextEnd + 1000);
    }
  };

  const updatePayloadNumberField = (clip: AnimationClip, field: string, rawValue: string) => {
    ensurePausedForEdit();
    const parsed = parseFloat(rawValue);
    if (Number.isNaN(parsed)) return;
    const shouldClampNonNegative =
      clip.type === 'shake'
      && (field === 'amplitudeX' || field === 'amplitudeY' || field === 'frequency' || field === 'decay');
    const nextValue =
      clip.type === 'fade' && (field === 'fromOpacity' || field === 'toOpacity')
        ? clamp01(parsed)
        : shouldClampNonNegative
          ? Math.max(0, parsed)
        : parsed;

    updateAnimationClip(clip.id, {
      payload: {
        ...(clip.payload as Record<string, number>),
        [field]: nextValue,
      },
    } as Partial<AnimationClip>);
  };

  const updateClipPayload = (
    clip: AnimationClip,
    payloadUpdates: Record<string, unknown>,
  ) => {
    ensurePausedForEdit();
    updateAnimationClip(clip.id, {
      payload: {
        ...(clip.payload as Record<string, unknown>),
        ...payloadUpdates,
      },
    } as Partial<AnimationClip>);
  };

  const setClipEasingPreset = (clip: AnimationClip, preset: EasingPresetValue) => {
    ensurePausedForEdit();
    updateAnimationClip(clip.id, {
      easing: preset,
    });
  };

  const updateClipBezierControlPoint = (
    clip: AnimationClip,
    controlIndex: 0 | 1 | 2 | 3,
    rawValue: string,
  ) => {
    const parsed = parseFloat(rawValue);
    if (Number.isNaN(parsed)) return;
    const easingMeta = parseEasingControlPoints(clip.easing);
    const nextPoints = [...easingMeta.points] as [number, number, number, number];
    if (controlIndex === 0 || controlIndex === 2) {
      nextPoints[controlIndex] = clamp01(parsed);
    } else {
      nextPoints[controlIndex] = clampBezierY(parsed);
    }
    ensurePausedForEdit();
    updateAnimationClip(clip.id, {
      easing: buildBezierEasingValue(
        nextPoints[0],
        nextPoints[1],
        nextPoints[2],
        nextPoints[3],
      ),
    });
  };

  const addMoveKeyframe = (clip: Extract<AnimationClip, { type: 'move' }>) => {
    const next = sortAndSanitizeInternalKeyframes([
      ...(clip.payload.keyframes || []),
      {
        at: 0.5,
        x: (clip.payload.fromX + clip.payload.toX) / 2,
        y: (clip.payload.fromY + clip.payload.toY) / 2,
      },
    ]);
    updateClipPayload(clip, { keyframes: next });
  };

  const updateMoveKeyframeField = (
    clip: Extract<AnimationClip, { type: 'move' }>,
    index: number,
    field: 'at' | 'x' | 'y',
    rawValue: string,
  ) => {
    const parsed = parseFloat(rawValue);
    if (Number.isNaN(parsed)) return;
    const next = [...(clip.payload.keyframes || [])];
    const current = next[index];
    if (!current) return;
    if (field === 'at') {
      next[index] = { ...current, at: clampKeyframePercent(parsed) / 100 };
    } else {
      next[index] = { ...current, [field]: parsed };
    }
    updateClipPayload(clip, { keyframes: sortAndSanitizeInternalKeyframes(next) });
  };

  const removeMoveKeyframe = (
    clip: Extract<AnimationClip, { type: 'move' }>,
    index: number,
  ) => {
    const next = [...(clip.payload.keyframes || [])];
    if (index < 0 || index >= next.length) return;
    next.splice(index, 1);
    updateClipPayload(clip, { keyframes: sortAndSanitizeInternalKeyframes(next) });
  };

  const addFadeKeyframe = (clip: Extract<AnimationClip, { type: 'fade' }>) => {
    const next = sortAndSanitizeInternalKeyframes([
      ...(clip.payload.keyframes || []),
      {
        at: 0.5,
        value: (clip.payload.fromOpacity + clip.payload.toOpacity) / 2,
      },
    ]);
    updateClipPayload(clip, { keyframes: next });
  };

  const updateFadeKeyframeField = (
    clip: Extract<AnimationClip, { type: 'fade' }>,
    index: number,
    field: 'at' | 'value',
    rawValue: string,
  ) => {
    const parsed = parseFloat(rawValue);
    if (Number.isNaN(parsed)) return;
    const next = [...(clip.payload.keyframes || [])];
    const current = next[index];
    if (!current) return;
    if (field === 'at') {
      next[index] = { ...current, at: clampKeyframePercent(parsed) / 100 };
    } else {
      next[index] = { ...current, value: clamp01(parsed) };
    }
    updateClipPayload(clip, { keyframes: sortAndSanitizeInternalKeyframes(next) });
  };

  const removeFadeKeyframe = (
    clip: Extract<AnimationClip, { type: 'fade' }>,
    index: number,
  ) => {
    const next = [...(clip.payload.keyframes || [])];
    if (index < 0 || index >= next.length) return;
    next.splice(index, 1);
    updateClipPayload(clip, { keyframes: sortAndSanitizeInternalKeyframes(next) });
  };

  const addScaleKeyframe = (clip: Extract<AnimationClip, { type: 'scale' }>) => {
    const next = sortAndSanitizeInternalKeyframes([
      ...(clip.payload.keyframes || []),
      {
        at: 0.5,
        scaleX: (clip.payload.fromScaleX + clip.payload.toScaleX) / 2,
        scaleY: (clip.payload.fromScaleY + clip.payload.toScaleY) / 2,
      },
    ]);
    updateClipPayload(clip, { keyframes: next });
  };

  const updateScaleKeyframeField = (
    clip: Extract<AnimationClip, { type: 'scale' }>,
    index: number,
    field: 'at' | 'scaleX' | 'scaleY',
    rawValue: string,
  ) => {
    const parsed = parseFloat(rawValue);
    if (Number.isNaN(parsed)) return;
    const next = [...(clip.payload.keyframes || [])];
    const current = next[index];
    if (!current) return;
    if (field === 'at') {
      next[index] = { ...current, at: clampKeyframePercent(parsed) / 100 };
    } else {
      next[index] = { ...current, [field]: parsed };
    }
    updateClipPayload(clip, { keyframes: sortAndSanitizeInternalKeyframes(next) });
  };

  const removeScaleKeyframe = (
    clip: Extract<AnimationClip, { type: 'scale' }>,
    index: number,
  ) => {
    const next = [...(clip.payload.keyframes || [])];
    if (index < 0 || index >= next.length) return;
    next.splice(index, 1);
    updateClipPayload(clip, { keyframes: sortAndSanitizeInternalKeyframes(next) });
  };

  const addRotateKeyframe = (clip: Extract<AnimationClip, { type: 'rotate' }>) => {
    const next = sortAndSanitizeInternalKeyframes([
      ...(clip.payload.keyframes || []),
      {
        at: 0.5,
        value: (clip.payload.fromRotation + clip.payload.toRotation) / 2,
      },
    ]);
    updateClipPayload(clip, { keyframes: next });
  };

  const updateRotateKeyframeField = (
    clip: Extract<AnimationClip, { type: 'rotate' }>,
    index: number,
    field: 'at' | 'value',
    rawValue: string,
  ) => {
    const parsed = parseFloat(rawValue);
    if (Number.isNaN(parsed)) return;
    const next = [...(clip.payload.keyframes || [])];
    const current = next[index];
    if (!current) return;
    if (field === 'at') {
      next[index] = { ...current, at: clampKeyframePercent(parsed) / 100 };
    } else {
      next[index] = { ...current, value: parsed };
    }
    updateClipPayload(clip, { keyframes: sortAndSanitizeInternalKeyframes(next) });
  };

  const removeRotateKeyframe = (
    clip: Extract<AnimationClip, { type: 'rotate' }>,
    index: number,
  ) => {
    const next = [...(clip.payload.keyframes || [])];
    if (index < 0 || index >= next.length) return;
    next.splice(index, 1);
    updateClipPayload(clip, { keyframes: sortAndSanitizeInternalKeyframes(next) });
  };

  const toggleBatchClipSelection = (clipId: string, checked: boolean) => {
    setBatchSelectedClipIds((prev) => {
      if (checked) {
        if (prev.includes(clipId)) return prev;
        return [...prev, clipId];
      }
      return prev.filter((id) => id !== clipId);
    });
  };

  const selectAllBatchClips = () => {
    setBatchSelectedClipIds(selectedObjectClips.map((clip) => clip.id));
  };

  const clearBatchClipSelection = () => {
    setBatchSelectedClipIds([]);
  };

  const applyBatchEdits = () => {
    if (selectedBatchClips.length === 0) return;

    const rawDuration = batchDurationInput.trim();
    const hasDurationUpdate = rawDuration.length > 0;
    const parsedDuration = hasDurationUpdate ? parseInt(rawDuration, 10) : NaN;
    if (hasDurationUpdate && Number.isNaN(parsedDuration)) return;

    const hasEasingUpdate = batchEasingInput !== '';
    const hasEnabledUpdate = batchEnabledInput !== '';
    if (!hasDurationUpdate && !hasEasingUpdate && !hasEnabledUpdate) return;

    const nextDuration = hasDurationUpdate ? clampPositive(parsedDuration, 1000) : null;
    const nextEnabled = hasEnabledUpdate ? batchEnabledInput === 'enabled' : null;
    const nextEasing = hasEasingUpdate ? batchEasingInput : null;

    ensurePausedForEdit();

    let maxEnd = globalDurationMs;
    let lastUpdatedClipId: string | null = null;
    for (const clip of selectedBatchClips) {
      const updates: Partial<AnimationClip> = {};
      if (nextDuration !== null && clip.durationMs !== nextDuration) {
        updates.durationMs = nextDuration;
        maxEnd = Math.max(maxEnd, clip.startTimeMs + nextDuration);
      }

      if (nextEasing && (clip.easing || 'linear') !== nextEasing) {
        updates.easing = nextEasing;
      }

      const clipEnabled = clip.enabled !== false;
      if (nextEnabled !== null && clipEnabled !== nextEnabled) {
        updates.enabled = nextEnabled;
      }

      if (Object.keys(updates).length === 0) continue;
      updateAnimationClip(clip.id, updates);
      lastUpdatedClipId = clip.id;
    }

    if (maxEnd > globalDurationMs) {
      setGlobalDurationMs(maxEnd + 1000);
    }
    if (lastUpdatedClipId) {
      setFlashClipId(lastUpdatedClipId);
    }
  };

  const autoResolveConflicts = () => {
    if (!selectedObject || conflictMeta.ids.size === 0) return;
    if (dragState) {
      setDragState(null);
    }
    ensurePausedForEdit();

    const enabledClips = selectedObjectClips.filter((clip) => clip.enabled !== false);
    if (enabledClips.length < 2) return;

    const domainBuckets = new Map<string, AnimationClip[]>();
    for (const clip of enabledClips) {
      const domain = getConflictDomain(clip.type);
      const list = domainBuckets.get(domain) || [];
      list.push(clip);
      domainBuckets.set(domain, list);
    }

    const domainOrder = [
      ...CONFLICT_DOMAIN_ORDER,
      ...[...domainBuckets.keys()].filter((domain) => !CONFLICT_DOMAIN_ORDER.includes(domain)),
    ];

    const nextStartById = new Map<string, number>();
    for (const domain of domainOrder) {
      const clips = (domainBuckets.get(domain) || [])
        .sort((a, b) => (a.startTimeMs - b.startTimeMs) || a.id.localeCompare(b.id));

      let currentDomainEnd = -Infinity;
      for (const clip of clips) {
        const currentStart = nextStartById.get(clip.id) ?? clip.startTimeMs;
        const duration = Math.max(1, clip.durationMs);
        if (currentStart < currentDomainEnd) {
          const shiftedStart = Math.ceil(currentDomainEnd);
          nextStartById.set(clip.id, shiftedStart);
          currentDomainEnd = shiftedStart + duration;
        } else {
          currentDomainEnd = currentStart + duration;
        }
      }
    }

    if (nextStartById.size === 0) return;

    let maxEnd = globalDurationMs;
    const clipById = new Map(selectedObjectClips.map((clip) => [clip.id, clip]));
    let lastMovedClipId: string | null = null;

    nextStartById.forEach((nextStart, clipId) => {
      const original = clipById.get(clipId);
      if (!original) return;
      if (nextStart === original.startTimeMs) return;
      updateAnimationClip(clipId, { startTimeMs: nextStart });
      lastMovedClipId = clipId;
      maxEnd = Math.max(maxEnd, nextStart + Math.max(1, original.durationMs));
    });

    if (maxEnd > globalDurationMs) {
      setGlobalDurationMs(maxEnd + 1000);
    }
    if (lastMovedClipId) {
      setFlashClipId(lastMovedClipId);
    }
  };

  const handleCursorChange = (rawValue: string) => {
    ensurePausedForEdit();
    const parsed = parseInt(rawValue, 10);
    if (Number.isNaN(parsed)) return;
    const snapResult = getCursorSnapResult(parsed);
    setCurrentTimeMs(snapResult.value);
    setCursorSnapGuideMs(snapResult.snapped ? snapResult.value : null);
  };

  const getClipTrackStyle = (startTimeMs: number, durationMs: number) => {
    const safeDuration = Math.max(1, globalDurationMs);
    const clipStart = Math.max(0, Math.min(startTimeMs, safeDuration));
    const clipEnd = Math.max(clipStart, Math.min(startTimeMs + durationMs, safeDuration));
    const leftPercent = (clipStart / safeDuration) * 100;
    const widthPercent = Math.max(((clipEnd - clipStart) / safeDuration) * 100, 1);
    return {
      left: `${leftPercent}%`,
      width: `${Math.min(widthPercent, 100 - leftPercent)}%`,
    };
  };

  const seekByTrackClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    ensurePausedForEdit();
    const snapResult = getCursorSnapResult(Math.round(ratio * globalDurationMs));
    setCurrentTimeMs(snapResult.value);
    setCursorSnapGuideMs(snapResult.snapped ? snapResult.value : null);
  };

  const cursorPercent = `${Math.max(
    0,
    Math.min(100, (currentTimeMs / Math.max(1, globalDurationMs)) * 100),
  )}%`;
  const cursorTimeLabel = `${Math.round(currentTimeMs)}ms / ${(currentTimeMs / 1000).toFixed(2)}s`;

  const startClipDrag = (clip: AnimationClip, event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const trackEl = clipTrackRefs.current.get(clip.id);
    if (!trackEl) return;
    const rect = trackEl.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const pointerMs = ratio * globalDurationMs;
    ensurePausedForEdit();
    setDragState({
      clipId: clip.id,
      mode: 'move',
      offsetMs: pointerMs - clip.startTimeMs,
      fixedEndMs: clip.startTimeMs + clip.durationMs,
      previewStartMs: clip.startTimeMs,
      previewDurationMs: clip.durationMs,
      snapGuideMs: null,
    });
    event.preventDefault();
    event.stopPropagation();
  };

  const startClipResizeStart = (clip: AnimationClip, event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const trackEl = clipTrackRefs.current.get(clip.id);
    if (!trackEl) return;
    const rect = trackEl.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const pointerMs = ratio * globalDurationMs;
    const clipEndMs = clip.startTimeMs + clip.durationMs;
    ensurePausedForEdit();
    setDragState({
      clipId: clip.id,
      mode: 'resize-start',
      offsetMs: pointerMs - clip.startTimeMs,
      fixedEndMs: clipEndMs,
      previewStartMs: clip.startTimeMs,
      previewDurationMs: clip.durationMs,
      snapGuideMs: null,
    });
    event.preventDefault();
    event.stopPropagation();
  };

  const startClipResizeEnd = (clip: AnimationClip, event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const trackEl = clipTrackRefs.current.get(clip.id);
    if (!trackEl) return;
    const rect = trackEl.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const pointerMs = ratio * globalDurationMs;
    const clipEndMs = clip.startTimeMs + clip.durationMs;
    ensurePausedForEdit();
    setDragState({
      clipId: clip.id,
      mode: 'resize-end',
      offsetMs: pointerMs - clipEndMs,
      fixedEndMs: clipEndMs,
      previewStartMs: clip.startTimeMs,
      previewDurationMs: clip.durationMs,
      snapGuideMs: null,
    });
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <section className="timeline-panel">
      <div className="timeline-header">
        <div className="timeline-header-group">
          <label htmlFor="timeline-duration">总时长(ms)</label>
          <input
            id="timeline-duration"
            type="number"
            min={1000}
            value={globalDurationMs}
            onChange={(e) => {
              ensurePausedForEdit();
              setGlobalDurationMs(parseInt(e.target.value || '1000', 10));
            }}
          />
        </div>
        <div className="timeline-header-group timeline-zoom-group">
          <label htmlFor="timeline-zoom">缩放</label>
          <input
            id="timeline-zoom"
            type="range"
            min={50}
            max={400}
            step={10}
            value={timelineZoomPercent}
            onChange={(e) => {
              const parsed = parseInt(e.target.value, 10);
              if (Number.isNaN(parsed)) return;
              setTimelineZoomPercent(clampTimelineZoom(parsed));
            }}
          />
          <span className="timeline-zoom-value">{timelineZoomPercent}%</span>
        </div>
        <div className="timeline-header-group timeline-header-grow">
          <label htmlFor="timeline-cursor">当前时间 {Math.round(currentTimeMs)}ms ({(currentTimeMs / 1000).toFixed(2)}s)</label>
          <div className="timeline-cursor-wrap">
            <input
              id="timeline-cursor"
              type="range"
              min={0}
              max={globalDurationMs}
              value={currentTimeMs}
              onChange={(e) => handleCursorChange(e.target.value)}
              onMouseDown={() => setIsCursorDragging(true)}
              onTouchStart={() => setIsCursorDragging(true)}
              onBlur={() => setIsCursorDragging(false)}
            />
            {isCursorDragging && (
              <div className="timeline-cursor-badge" style={{ left: cursorPercent }}>
                {cursorTimeLabel}
              </div>
            )}
          </div>
        </div>
      </div>

      {!selectedObject ? (
        <div className="timeline-empty">请先选中一个画布元素，再创建动画片段。</div>
      ) : (
        <>
          <div className="timeline-toolbar">
            <span>当前对象：{selectedObject.name || selectedObject.id}</span>
            <div className="timeline-actions">
              <button onClick={() => createClip('move')}>+ 移动</button>
              <button onClick={() => createClip('moveAlongPath')}>+ 曲线移动</button>
              <button onClick={() => createClip('shake')}>+ 抖动</button>
              <button onClick={() => createClip('fade')}>+ 透明度</button>
              <button onClick={() => createClip('scale')}>+ 缩放</button>
              <button onClick={() => createClip('rotate')}>+ 旋转</button>
              <button onClick={() => createPresetTemplate('fadeIn')}>模板: 淡入</button>
              <button onClick={() => createPresetTemplate('bounceIn')}>模板: 弹跳进入</button>
              <button onClick={() => createPresetTemplate('moveFadeIn')}>模板: 平移+淡入</button>
            </div>
          </div>
          <div className="timeline-hint">播放头与片段拖动均支持吸附，按住 Shift 可临时关闭</div>
          {conflictMeta.ids.size > 0 && (
            <div className="timeline-conflict-banner">
              <span>
                检测到 {conflictMeta.ids.size} 个片段存在冲突域：{conflictMeta.domainLabels.join(' / ')}，请调整开始时间或时长（冲突片段已置顶）。
              </span>
              <button
                className="timeline-conflict-fix-btn"
                onClick={autoResolveConflicts}
              >
                自动修复
              </button>
            </div>
          )}
          {selectedBatchClips.length > 0 && (
            <div className="timeline-batch-panel">
              <div className="timeline-batch-top">
                <span>批量编辑：已选 {selectedBatchClips.length} 个片段</span>
                <div className="timeline-batch-top-actions">
                  <button className="clip-btn" onClick={selectAllBatchClips}>
                    全选
                  </button>
                  <button className="clip-btn" onClick={clearBatchClipSelection}>
                    清空
                  </button>
                </div>
              </div>
              <div className="timeline-batch-grid">
                <label>
                  时长(ms)
                  <input
                    type="number"
                    min={1}
                    value={batchDurationInput}
                    placeholder="不修改"
                    onChange={(e) => setBatchDurationInput(e.target.value)}
                  />
                </label>
                <label>
                  缓动
                  <select
                    value={batchEasingInput}
                    onChange={(e) => setBatchEasingInput(e.target.value as AnimationClip['easing'] | '')}
                  >
                    <option value="">不修改</option>
                    <option value="linear">linear</option>
                    <option value="ease-in">ease-in</option>
                    <option value="ease-out">ease-out</option>
                    <option value="ease-in-out">ease-in-out</option>
                  </select>
                </label>
                <label>
                  启用状态
                  <select
                    value={batchEnabledInput}
                    onChange={(e) => setBatchEnabledInput(e.target.value as '' | 'enabled' | 'disabled')}
                  >
                    <option value="">不修改</option>
                    <option value="enabled">启用</option>
                    <option value="disabled">禁用</option>
                  </select>
                </label>
                <button className="timeline-batch-apply-btn" onClick={applyBatchEdits}>
                  应用到已选片段
                </button>
              </div>
            </div>
          )}

          <div className="clip-list">
            {selectedObjectClips.length === 0 ? (
              <div className="timeline-empty">当前对象还没有动画片段。</div>
            ) : (
              displayObjectClips.map((clip) => {
                const effectiveStartMs =
                  dragState?.clipId === clip.id ? dragState.previewStartMs : clip.startTimeMs;
                const effectiveDurationMs =
                  dragState?.clipId === clip.id ? dragState.previewDurationMs : clip.durationMs;
                const isDragging = dragState?.clipId === clip.id;
                const isSnapping = isDragging && dragState?.snapGuideMs !== null;
                const isCursorSnapping = !isDragging && cursorSnapGuideMs !== null;
                const playheadPercent = `${Math.max(
                  0,
                  Math.min(100, (currentTimeMs / Math.max(1, globalDurationMs)) * 100),
                )}%`;
                const snapGuidePercent =
                  isSnapping
                    ? `${Math.max(0, Math.min(100, ((dragState?.snapGuideMs || 0) / Math.max(1, globalDurationMs)) * 100))}%`
                    : '0%';
                const cursorSnapGuidePercent =
                  isCursorSnapping
                    ? `${Math.max(0, Math.min(100, ((cursorSnapGuideMs || 0) / Math.max(1, globalDurationMs)) * 100))}%`
                    : '0%';
                const showGuide = isSnapping || isCursorSnapping;
                const guidePercent = isSnapping ? snapGuidePercent : cursorSnapGuidePercent;
                const conflictDomains = conflictMeta.domainsByClipId.get(clip.id) || [];
                const isConflict = conflictDomains.length > 0;
                const isBatchSelected = batchSelectedClipIdSet.has(clip.id);
                return (
                <div
                  className={`clip-card${clip.enabled === false ? ' is-disabled' : ''}${flashClipId === clip.id ? ' is-flash' : ''}${isConflict ? ' is-conflict' : ''}${isBatchSelected ? ' is-batch-selected' : ''}`}
                  key={clip.id}
                  ref={(node) => {
                    if (node) {
                      clipCardRefs.current.set(clip.id, node);
                    } else {
                      clipCardRefs.current.delete(clip.id);
                    }
                  }}
                >
                  <div className="clip-card-top">
                    <div className="clip-card-top-left">
                      <strong>{clip.type}</strong>
                      {isConflict && (
                        <span
                          className="clip-conflict-tag"
                          title={`冲突域：${conflictDomains.map(getConflictDomainLabel).join(' / ')}`}
                        >
                          {conflictDomains.map(getConflictDomainLabel).join('/')}
                        </span>
                      )}
                      <span className="clip-end-time">结束 {effectiveStartMs + effectiveDurationMs}ms</span>
                    </div>
                    <div className="clip-card-top-actions">
                      <label className="clip-select-toggle">
                        <input
                          type="checkbox"
                          checked={isBatchSelected}
                          onChange={(e) => toggleBatchClipSelection(clip.id, e.target.checked)}
                        />
                        批选
                      </label>
                      <label className="clip-enabled-toggle">
                        <input
                          type="checkbox"
                          checked={clip.enabled !== false}
                          onChange={(e) => {
                            ensurePausedForEdit();
                            updateAnimationClip(clip.id, {
                              enabled: e.target.checked,
                            });
                          }}
                        />
                        启用
                      </label>
                      <button
                        className="clip-btn"
                        onClick={() => duplicateClip(clip)}
                      >
                        复制
                      </button>
                      <button
                        className="clip-btn"
                        onClick={() => {
                          ensurePausedForEdit();
                          setCurrentTimeMs(clip.startTimeMs);
                        }}
                      >
                        定位
                      </button>
                      <button
                        className="clip-btn clip-btn-danger"
                        onClick={() => {
                          ensurePausedForEdit();
                          removeAnimationClip(clip.id);
                        }}
                      >
                        删除
                      </button>
                    </div>
                  </div>

                  <div className="clip-track-scroll">
                    <div
                      className="clip-track clip-track-zoom-area"
                      style={{ width: `${timelineZoomPercent}%` }}
                      onClick={seekByTrackClick}
                      role="button"
                      tabIndex={0}
                      ref={(node) => {
                        if (node) {
                          clipTrackRefs.current.set(clip.id, node);
                        } else {
                          clipTrackRefs.current.delete(clip.id);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          ensurePausedForEdit();
                          setCurrentTimeMs(clip.startTimeMs);
                        }
                      }}
                    >
                      <div
                        className="clip-track-playhead"
                        style={{ left: playheadPercent }}
                      />
                      {showGuide && (
                        <div
                          className={`clip-track-snap-guide${isCursorSnapping ? ' is-cursor-snap' : ''}`}
                          style={{ left: guidePercent }}
                        />
                      )}
                      <div
                        className={`clip-track-fill${isDragging ? ' is-dragging' : ''}${isSnapping ? ' is-snapped' : ''}`}
                        style={getClipTrackStyle(effectiveStartMs, effectiveDurationMs)}
                        onMouseDown={(e) => startClipDrag(clip, e)}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div
                          className="clip-track-resize-handle clip-track-resize-handle-left"
                          onMouseDown={(e) => startClipResizeStart(clip, e)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div
                          className="clip-track-resize-handle clip-track-resize-handle-right"
                          onMouseDown={(e) => startClipResizeEnd(clip, e)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="clip-grid">
                    <label>
                      开始(ms)
                      <input
                        type="number"
                        min={0}
                        value={effectiveStartMs}
                        onChange={(e) => updateClipNumberField(clip, 'startTimeMs', e.target.value)}
                      />
                    </label>
                    <label>
                      时长(ms)
                      <input
                        type="number"
                        min={1}
                        value={effectiveDurationMs}
                        onChange={(e) => updateClipNumberField(clip, 'durationMs', e.target.value)}
                      />
                    </label>
                    <div className="clip-easing-editor">
                      <div className="clip-easing-header">
                        <span>缓动曲线</span>
                        <div className="clip-easing-presets">
                          {EASING_PRESET_OPTIONS.map((preset) => (
                            <button
                              type="button"
                              key={preset.value}
                              className={`clip-easing-preset-btn${(clip.easing || 'linear') === preset.value ? ' is-active' : ''}`}
                              onClick={() => setClipEasingPreset(clip, preset.value)}
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      {(() => {
                        const easingMeta = parseEasingControlPoints(clip.easing);
                        const [x1, y1, x2, y2] = easingMeta.points;
                        return (
                          <div className="clip-easing-body">
                            <div className="clip-easing-preview">
                              <svg viewBox="0 0 88 52" aria-hidden="true">
                                <path d="M 4 48 L 84 4" className="clip-easing-preview-base" />
                                <path
                                  d={getEasingPreviewPath(x1, y1, x2, y2)}
                                  className="clip-easing-preview-curve"
                                />
                              </svg>
                            </div>
                            <div className="clip-easing-fields">
                              <label>
                                x1
                                <input
                                  type="number"
                                  min={0}
                                  max={1}
                                  step={0.01}
                                  value={formatBezierValue(x1)}
                                  onChange={(e) => updateClipBezierControlPoint(clip, 0, e.target.value)}
                                />
                              </label>
                              <label>
                                y1
                                <input
                                  type="number"
                                  min={-2}
                                  max={2}
                                  step={0.01}
                                  value={formatBezierValue(y1)}
                                  onChange={(e) => updateClipBezierControlPoint(clip, 1, e.target.value)}
                                />
                              </label>
                              <label>
                                x2
                                <input
                                  type="number"
                                  min={0}
                                  max={1}
                                  step={0.01}
                                  value={formatBezierValue(x2)}
                                  onChange={(e) => updateClipBezierControlPoint(clip, 2, e.target.value)}
                                />
                              </label>
                              <label>
                                y2
                                <input
                                  type="number"
                                  min={-2}
                                  max={2}
                                  step={0.01}
                                  value={formatBezierValue(y2)}
                                  onChange={(e) => updateClipBezierControlPoint(clip, 3, e.target.value)}
                                />
                              </label>
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {clip.type === 'move' && (
                      <>
                        <label>
                          终点X
                          <input
                            type="number"
                            value={clip.payload.toX}
                            onChange={(e) => updatePayloadNumberField(clip, 'toX', e.target.value)}
                          />
                        </label>
                        <label>
                          终点Y
                          <input
                            type="number"
                            value={clip.payload.toY}
                            onChange={(e) => updatePayloadNumberField(clip, 'toY', e.target.value)}
                          />
                        </label>
                        <div className="clip-keyframe-section">
                          <div className="clip-keyframe-header">
                            <span>关键帧</span>
                            <button
                              type="button"
                              className="clip-btn"
                              onClick={() => addMoveKeyframe(clip)}
                            >
                              + 关键帧
                            </button>
                          </div>
                          {(clip.payload.keyframes || []).length === 0 ? (
                            <div className="clip-keyframe-empty">暂无内部关键帧</div>
                          ) : (
                            <div className="clip-keyframe-list">
                              {(clip.payload.keyframes || []).map((frame, index) => (
                                <div className="clip-keyframe-row" key={`${frame.at}-${index}`}>
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    step={1}
                                    value={Number((frame.at * 100).toFixed(1))}
                                    onChange={(e) => updateMoveKeyframeField(clip, index, 'at', e.target.value)}
                                    title="时间(%)"
                                  />
                                  <input
                                    type="number"
                                    value={frame.x}
                                    onChange={(e) => updateMoveKeyframeField(clip, index, 'x', e.target.value)}
                                    title="X"
                                  />
                                  <input
                                    type="number"
                                    value={frame.y}
                                    onChange={(e) => updateMoveKeyframeField(clip, index, 'y', e.target.value)}
                                    title="Y"
                                  />
                                  <button
                                    type="button"
                                    className="clip-keyframe-remove"
                                    onClick={() => removeMoveKeyframe(clip, index)}
                                  >
                                    删除
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </>
                    )}

                    {clip.type === 'moveAlongPath' && (
                      <>
                        <label>
                          控制点X
                          <input
                            type="number"
                            value={clip.payload.controlX}
                            onChange={(e) => updatePayloadNumberField(clip, 'controlX', e.target.value)}
                          />
                        </label>
                        <label>
                          控制点Y
                          <input
                            type="number"
                            value={clip.payload.controlY}
                            onChange={(e) => updatePayloadNumberField(clip, 'controlY', e.target.value)}
                          />
                        </label>
                        <label>
                          终点X
                          <input
                            type="number"
                            value={clip.payload.toX}
                            onChange={(e) => updatePayloadNumberField(clip, 'toX', e.target.value)}
                          />
                        </label>
                        <label>
                          终点Y
                          <input
                            type="number"
                            value={clip.payload.toY}
                            onChange={(e) => updatePayloadNumberField(clip, 'toY', e.target.value)}
                          />
                        </label>
                      </>
                    )}

                    {clip.type === 'shake' && (
                      <>
                        <label>
                          基准X
                          <input
                            type="number"
                            value={clip.payload.baseX}
                            onChange={(e) => updatePayloadNumberField(clip, 'baseX', e.target.value)}
                          />
                        </label>
                        <label>
                          基准Y
                          <input
                            type="number"
                            value={clip.payload.baseY}
                            onChange={(e) => updatePayloadNumberField(clip, 'baseY', e.target.value)}
                          />
                        </label>
                        <label>
                          振幅X
                          <input
                            type="number"
                            min={0}
                            value={clip.payload.amplitudeX}
                            onChange={(e) => updatePayloadNumberField(clip, 'amplitudeX', e.target.value)}
                          />
                        </label>
                        <label>
                          振幅Y
                          <input
                            type="number"
                            min={0}
                            value={clip.payload.amplitudeY}
                            onChange={(e) => updatePayloadNumberField(clip, 'amplitudeY', e.target.value)}
                          />
                        </label>
                        <label>
                          频率
                          <input
                            type="number"
                            step={0.5}
                            min={0}
                            value={clip.payload.frequency}
                            onChange={(e) => updatePayloadNumberField(clip, 'frequency', e.target.value)}
                          />
                        </label>
                        <label>
                          衰减
                          <input
                            type="number"
                            step={0.1}
                            min={0}
                            value={clip.payload.decay ?? 1}
                            onChange={(e) => updatePayloadNumberField(clip, 'decay', e.target.value)}
                          />
                        </label>
                      </>
                    )}

                    {clip.type === 'fade' && (
                      <>
                        <label>
                          起始透明度
                          <input
                            type="number"
                            step={0.05}
                            value={clip.payload.fromOpacity}
                            onChange={(e) => updatePayloadNumberField(clip, 'fromOpacity', e.target.value)}
                          />
                        </label>
                        <label>
                          结束透明度
                          <input
                            type="number"
                            step={0.05}
                            value={clip.payload.toOpacity}
                            onChange={(e) => updatePayloadNumberField(clip, 'toOpacity', e.target.value)}
                          />
                        </label>
                        <div className="clip-keyframe-section">
                          <div className="clip-keyframe-header">
                            <span>关键帧</span>
                            <button
                              type="button"
                              className="clip-btn"
                              onClick={() => addFadeKeyframe(clip)}
                            >
                              + 关键帧
                            </button>
                          </div>
                          {(clip.payload.keyframes || []).length === 0 ? (
                            <div className="clip-keyframe-empty">暂无内部关键帧</div>
                          ) : (
                            <div className="clip-keyframe-list">
                              {(clip.payload.keyframes || []).map((frame, index) => (
                                <div className="clip-keyframe-row" key={`${frame.at}-${index}`}>
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    step={1}
                                    value={Number((frame.at * 100).toFixed(1))}
                                    onChange={(e) => updateFadeKeyframeField(clip, index, 'at', e.target.value)}
                                    title="时间(%)"
                                  />
                                  <input
                                    type="number"
                                    step={0.05}
                                    min={0}
                                    max={1}
                                    value={frame.value}
                                    onChange={(e) => updateFadeKeyframeField(clip, index, 'value', e.target.value)}
                                    title="透明度"
                                  />
                                  <button
                                    type="button"
                                    className="clip-keyframe-remove"
                                    onClick={() => removeFadeKeyframe(clip, index)}
                                  >
                                    删除
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </>
                    )}

                    {clip.type === 'scale' && (
                      <>
                        <label>
                          终点ScaleX
                          <input
                            type="number"
                            step={0.1}
                            value={clip.payload.toScaleX}
                            onChange={(e) => updatePayloadNumberField(clip, 'toScaleX', e.target.value)}
                          />
                        </label>
                        <label>
                          终点ScaleY
                          <input
                            type="number"
                            step={0.1}
                            value={clip.payload.toScaleY}
                            onChange={(e) => updatePayloadNumberField(clip, 'toScaleY', e.target.value)}
                          />
                        </label>
                        <div className="clip-keyframe-section">
                          <div className="clip-keyframe-header">
                            <span>关键帧</span>
                            <button
                              type="button"
                              className="clip-btn"
                              onClick={() => addScaleKeyframe(clip)}
                            >
                              + 关键帧
                            </button>
                          </div>
                          {(clip.payload.keyframes || []).length === 0 ? (
                            <div className="clip-keyframe-empty">暂无内部关键帧</div>
                          ) : (
                            <div className="clip-keyframe-list">
                              {(clip.payload.keyframes || []).map((frame, index) => (
                                <div className="clip-keyframe-row" key={`${frame.at}-${index}`}>
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    step={1}
                                    value={Number((frame.at * 100).toFixed(1))}
                                    onChange={(e) => updateScaleKeyframeField(clip, index, 'at', e.target.value)}
                                    title="时间(%)"
                                  />
                                  <input
                                    type="number"
                                    step={0.1}
                                    value={frame.scaleX}
                                    onChange={(e) => updateScaleKeyframeField(clip, index, 'scaleX', e.target.value)}
                                    title="ScaleX"
                                  />
                                  <input
                                    type="number"
                                    step={0.1}
                                    value={frame.scaleY}
                                    onChange={(e) => updateScaleKeyframeField(clip, index, 'scaleY', e.target.value)}
                                    title="ScaleY"
                                  />
                                  <button
                                    type="button"
                                    className="clip-keyframe-remove"
                                    onClick={() => removeScaleKeyframe(clip, index)}
                                  >
                                    删除
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </>
                    )}

                    {clip.type === 'rotate' && (
                      <>
                        <label>
                          终点角度
                          <input
                            type="number"
                            value={clip.payload.toRotation}
                            onChange={(e) => updatePayloadNumberField(clip, 'toRotation', e.target.value)}
                          />
                        </label>
                        <div className="clip-keyframe-section">
                          <div className="clip-keyframe-header">
                            <span>关键帧</span>
                            <button
                              type="button"
                              className="clip-btn"
                              onClick={() => addRotateKeyframe(clip)}
                            >
                              + 关键帧
                            </button>
                          </div>
                          {(clip.payload.keyframes || []).length === 0 ? (
                            <div className="clip-keyframe-empty">暂无内部关键帧</div>
                          ) : (
                            <div className="clip-keyframe-list">
                              {(clip.payload.keyframes || []).map((frame, index) => (
                                <div className="clip-keyframe-row" key={`${frame.at}-${index}`}>
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    step={1}
                                    value={Number((frame.at * 100).toFixed(1))}
                                    onChange={(e) => updateRotateKeyframeField(clip, index, 'at', e.target.value)}
                                    title="时间(%)"
                                  />
                                  <input
                                    type="number"
                                    value={frame.value}
                                    onChange={(e) => updateRotateKeyframeField(clip, index, 'value', e.target.value)}
                                    title="角度"
                                  />
                                  <button
                                    type="button"
                                    className="clip-keyframe-remove"
                                    onClick={() => removeRotateKeyframe(clip, index)}
                                  >
                                    删除
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
                );
              })
            )}
          </div>
        </>
      )}
    </section>
  );
}



