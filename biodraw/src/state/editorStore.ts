import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { AnimationClip, AppearSegment, SceneObject } from '../types';

const MAX_HISTORY = 50;

type PlaybackStatus = 'stopped' | 'playing' | 'paused';
type SequenceExportStatus = 'idle' | 'running' | 'done' | 'error';
type VideoExportStatus = 'idle' | 'running' | 'done' | 'error';

type SequenceExportOptions = {
  width: number;
  height: number;
  fps: number;
  startMs: number;
  endMs: number;
  prefix: string;
};

type VideoExportFormat = 'mp4' | 'webm';

type VideoExportOptions = {
  width: number;
  height: number;
  fps: number;
  startMs: number;
  endMs: number;
  prefix: string;
  format: VideoExportFormat;
};

type EditorSnapshot = {
  objects: SceneObject[];
  animations: AnimationClip[];
  globalDurationMs: number;
};

type ApplyAnimationResult = {
  appliedTargetCount: number;
  skippedTargetCount: number;
  copiedClipCount: number;
  skippedReasons: Record<string, 'segment-conflict' | 'animation-conflict' | 'locked-target' | 'missing-target'>;
};

type ApplyAnimationOptions = {
  sourceObjectId: string;
  sourceSegmentId: string;
  targetObjectIds: string[];
};

interface EditorState {
  objects: SceneObject[];
  animations: AnimationClip[];
  globalDurationMs: number;
  playbackStatus: PlaybackStatus;
  currentTimeMs: number;
  previewClipId: string | null;
  playbackRate: number;
  playbackLoopEnabled: boolean;
  sequenceExportRequestId: number;
  sequenceExportOptions: SequenceExportOptions;
  sequenceExportStatus: SequenceExportStatus;
  sequenceExportMessage: string;
  videoExportRequestId: number;
  videoExportOptions: VideoExportOptions;
  videoExportStatus: VideoExportStatus;
  videoExportMessage: string;
  past: EditorSnapshot[];
  future: EditorSnapshot[];
  selectedIds: string[];
  applyAnimationFlashObjectIds: string[];
  applyAnimationFlashKey: number;
  isRatioLocked: boolean;
  canvasWidth: number;
  canvasHeight: number;
  canvasBgColor: string;

  loadSnapshot: (snapshot: {
    objects: SceneObject[];
    animations: AnimationClip[];
    globalDurationMs: number;
    canvasWidth?: number;
    canvasHeight?: number;
    canvasBgColor?: string;
  }) => void;

  addSceneObject: (obj: SceneObject) => void;
  updateSceneObject: (id: string, updates: Partial<SceneObject>) => void;
  removeSceneObject: (id: string) => void;
  removeSceneObjects: (ids: string[]) => void;
  selectObject: (id: string | null) => void;
  toggleSelectObject: (id: string) => void;
  selectAllObjects: () => void;
  duplicateObject: (id: string) => void;
  moveMultipleSceneObjects: (moves: Array<{ id: string; x: number; y: number }>) => void;
  setCanvasSize: (width: number, height: number) => void;
  setCanvasBgColor: (color: string) => void;
  moveObjectForward: (id: string) => void;
  moveObjectBackward: (id: string) => void;
  moveObjectToFront: (id: string) => void;
  moveObjectToBack: (id: string) => void;
  reorderObject: (id: string, toObjIndex: number) => void;
  setIsRatioLocked: (locked: boolean) => void;
  toggleObjectLock: (id: string) => void;
  groupObjects: (ids: string[]) => void;
  ungroupObjects: (groupId: string) => void;
  selectSceneObjects: (ids: string[]) => void;
  triggerApplyAnimationFlash: (ids: string[]) => void;
  clearApplyAnimationFlash: () => void;

  addAnimationClip: (clip: AnimationClip) => void;
  updateAnimationClip: (id: string, updates: Partial<AnimationClip>) => void;
  removeAnimationClip: (id: string) => void;
  reorderAnimationClips: (orderedIds: string[]) => void;
  copyAnimationClipsToObjects: (sourceObjectId: string, targetObjectIds: string[]) => void;
  applyAnimationClipsToObjects: (options: ApplyAnimationOptions) => ApplyAnimationResult;

  addAppearSegment: (objectId: string, segment: AppearSegment) => void;
  removeAppearSegments: (objectId: string, segmentIds: string[]) => void;
  updateAppearSegment: (objectId: string, segmentId: string, updates: { startMs?: number; endMs?: number }, translateClipsBy?: number) => void;
  setGlobalDurationMs: (durationMs: number) => void;
  setCurrentTimeMs: (timeMs: number) => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
  startClipPreview: (clipId: string) => void;
  advancePlayback: (deltaMs: number) => void;
  setPlaybackRate: (rate: number) => void;
  setPlaybackLoopEnabled: (enabled: boolean) => void;
  stepPlaybackFrame: (direction: 1 | -1) => void;
  exportCancelCount: number;
  singleFrameExportId: number;
  cancelExport: () => void;
  requestSingleFrameExport: () => void;
  isPreviewMode: boolean;
  setPreviewMode: (v: boolean) => void;
  focusMode: boolean;
  setFocusMode: (v: boolean) => void;
  fitVersion: number;
  requestFit: () => void;

  requestSequenceExport: (options: SequenceExportOptions) => void;
  setSequenceExportStatus: (status: SequenceExportStatus, message?: string) => void;
  requestVideoExport: (options: VideoExportOptions) => void;
  setVideoExportStatus: (status: VideoExportStatus, message?: string) => void;

  undo: () => void;
  redo: () => void;

  expandedAnimationClipIds: string[];
  setExpandedAnimationClipIds: (ids: string[]) => void;

  canvasDrawingMode: {
    type: 'move-path';
    clipId: string;
    step: 'start' | 'end';
    startX?: number;
    startY?: number;
  } | {
    type: 'polyline-path';
    clipId: string;
    step: 'start' | 'mid' | 'end';
    startX?: number;
    startY?: number;
    midX?: number;
    midY?: number;
  } | {
    type: 'curve-path';
    clipId: string;
    step: 'from' | 'ctrl1' | 'ctrl2' | 'to';
    fromX?: number;
    fromY?: number;
    ctrl1X?: number;
    ctrl1Y?: number;
    ctrl2X?: number;
    ctrl2Y?: number;
  } | null;
  setCanvasDrawingMode: (mode: EditorState['canvasDrawingMode']) => void;
  patchAnimationClipSilent: (id: string, updates: Partial<AnimationClip>) => void;
  materializeAppearSegmentsSilent: (objectId: string, fallbackEndMs: number) => void;

  hasUnsavedChanges: boolean;
  currentFileName: string | null;
  markSaved: (fileName?: string) => void;
  resetScene: () => void;
  setCurrentFileName: (name: string | null) => void;
}

const generateFileName = () => {
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const ts = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  return `biodraw_${ts}.biodraw`;
};

const cloneDeep = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const toSnapshot = (state: EditorState): EditorSnapshot => ({
  objects: cloneDeep(state.objects),
  animations: cloneDeep(state.animations),
  globalDurationMs: state.globalDurationMs,
});

const clampTime = (timeMs: number, durationMs: number) =>
  Math.max(0, Math.min(durationMs, timeMs));

const clampPlaybackRate = (rate: number) => Math.max(0.25, Math.min(2, rate));

function pushHistory(state: EditorState) {
  state.past.push(toSnapshot(state));
  if (state.past.length > MAX_HISTORY) state.past.shift();
  state.future = [];
  state.hasUnsavedChanges = true;
}

const getObjectSegment = (obj: SceneObject, segmentId: string, fallbackEndMs: number) => {
  if (obj.appearSegments) {
    return obj.appearSegments.find((seg) => seg.id === segmentId) ?? null;
  }
  if (segmentId === '__virtual__') {
    return {
      id: segmentId,
      startMs: obj.appearStartMs ?? 0,
      endMs: obj.appearEndMs ?? fallbackEndMs,
    };
  }
  return null;
};

const ensureSegments = (obj: SceneObject, fallbackEndMs: number) => {
  if (obj.appearSegments) return obj.appearSegments;
  obj.appearSegments = [{
    id: crypto.randomUUID(),
    startMs: obj.appearStartMs ?? 0,
    endMs: obj.appearEndMs ?? fallbackEndMs,
  }];
  return obj.appearSegments;
};

const resolveTargetSegmentForApply = (
  obj: SceneObject,
  sourceSegment: AppearSegment,
  fallbackEndMs: number,
) => {
  const segments = ensureSegments(obj, fallbackEndMs);
  const exact = segments.find(
    (seg) => seg.startMs === sourceSegment.startMs && seg.endMs === sourceSegment.endMs,
  );
  if (exact) return { segment: exact, skipped: false };

  const containing = segments.find(
    (seg) => seg.startMs <= sourceSegment.startMs && seg.endMs >= sourceSegment.endMs,
  );
  if (containing) return { segment: containing, skipped: false };

  const hasPartialOverlap = segments.some(
    (seg) => Math.max(seg.startMs, sourceSegment.startMs) < Math.min(seg.endMs, sourceSegment.endMs),
  );
  if (hasPartialOverlap) return { segment: null, skipped: true };

  const nextSegment = {
    id: crypto.randomUUID(),
    startMs: sourceSegment.startMs,
    endMs: sourceSegment.endMs,
  };
  segments.push(nextSegment);
  segments.sort((a, b) => a.startMs - b.startMs);
  return { segment: nextSegment, skipped: false };
};

const canApplyToTargetSegment = (
  obj: SceneObject,
  sourceSegment: AppearSegment,
  fallbackEndMs: number,
) => {
  const segments = obj.appearSegments ?? [{
    id: '__virtual__',
    startMs: obj.appearStartMs ?? 0,
    endMs: obj.appearEndMs ?? fallbackEndMs,
  }];
  const reusable = segments.some(
    (seg) => seg.startMs <= sourceSegment.startMs && seg.endMs >= sourceSegment.endMs,
  );
  if (reusable) return true;
  return !segments.some(
    (seg) => Math.max(seg.startMs, sourceSegment.startMs) < Math.min(seg.endMs, sourceSegment.endMs),
  );
};

const getApplyConflictDomain = (clipType: AnimationClip['type']) => {
  switch (clipType) {
    case 'move': case 'moveAlongPath': case 'polylineMove': case 'shake': return 'position';
    case 'fade': return 'opacity';
    case 'scale': return 'scale';
    case 'rotate': return 'rotation';
    case 'stateChange': return 'state';
    default: return clipType;
  }
};

const getReusableTargetSegmentForApply = (
  obj: SceneObject,
  sourceSegment: AppearSegment,
  fallbackEndMs: number,
) => {
  const segments = obj.appearSegments ?? [{
    id: '__virtual__',
    startMs: obj.appearStartMs ?? 0,
    endMs: obj.appearEndMs ?? fallbackEndMs,
  }];
  return segments.find(
    (seg) => seg.startMs <= sourceSegment.startMs && seg.endMs >= sourceSegment.endMs,
  ) ?? null;
};

const hasAnimationDomainConflict = (
  targetObj: SceneObject,
  targetSegment: AppearSegment,
  sourceClips: AnimationClip[],
  allClips: AnimationClip[],
) => {
  const sourceDomains = new Set(sourceClips.map((clip) => getApplyConflictDomain(clip.type)));
  return allClips.some((clip) => {
    if (clip.objectId !== targetObj.id) return false;
    const isSameSegment = clip.segmentId === targetSegment.id
      || (targetSegment.id === '__virtual__' && clip.segmentId === undefined);
    return isSameSegment && sourceDomains.has(getApplyConflictDomain(clip.type));
  });
};

const translatePointKeyframes = (
  keyframes: Array<{ at: number; x: number; y: number; preset?: string }> | undefined,
  dx: number,
  dy: number,
) => keyframes?.map((frame) => ({ ...frame, x: frame.x + dx, y: frame.y + dy }));

const scaleKeyframes = (
  keyframes: Array<{ at: number; scaleX: number; scaleY: number; preset?: string }> | undefined,
  ratioX: number,
  ratioY: number,
) => keyframes?.map((frame) => ({ ...frame, scaleX: frame.scaleX * ratioX, scaleY: frame.scaleY * ratioY }));

const rotateKeyframes = (
  keyframes: Array<{ at: number; value: number; preset?: string }> | undefined,
  delta: number,
) => keyframes?.map((frame) => ({ ...frame, value: frame.value + delta }));

const buildAppliedClip = (
  clip: AnimationClip,
  sourceObj: SceneObject,
  targetObj: SceneObject,
  targetSegmentId: string,
): AnimationClip => {
  const dx = targetObj.x - sourceObj.x;
  const dy = targetObj.y - sourceObj.y;
  const scaleRatioX = sourceObj.scaleX === 0 ? 1 : targetObj.scaleX / sourceObj.scaleX;
  const scaleRatioY = sourceObj.scaleY === 0 ? 1 : targetObj.scaleY / sourceObj.scaleY;
  const rotationDelta = targetObj.rotation - sourceObj.rotation;

  switch (clip.type) {
    case 'move': {
      const base = cloneDeep(clip);
      return {
        ...base,
        id: crypto.randomUUID(),
        objectId: targetObj.id,
        segmentId: targetSegmentId,
        payload: {
          ...base.payload,
          fromX: clip.payload.fromX + dx,
          fromY: clip.payload.fromY + dy,
          toX: clip.payload.toX + dx,
          toY: clip.payload.toY + dy,
          keyframes: translatePointKeyframes(clip.payload.keyframes, dx, dy),
        },
      };
    }
    case 'polylineMove': {
      const base = cloneDeep(clip);
      return {
        ...base,
        id: crypto.randomUUID(),
        objectId: targetObj.id,
        segmentId: targetSegmentId,
        payload: {
          ...base.payload,
          fromX: clip.payload.fromX + dx,
          fromY: clip.payload.fromY + dy,
          midX: clip.payload.midX + dx,
          midY: clip.payload.midY + dy,
          toX: clip.payload.toX + dx,
          toY: clip.payload.toY + dy,
        },
      };
    }
    case 'moveAlongPath': {
      const base = cloneDeep(clip);
      return {
        ...base,
        id: crypto.randomUUID(),
        objectId: targetObj.id,
        segmentId: targetSegmentId,
        payload: {
          ...base.payload,
          fromX: clip.payload.fromX + dx,
          fromY: clip.payload.fromY + dy,
          control1X: clip.payload.control1X + dx,
          control1Y: clip.payload.control1Y + dy,
          control2X: clip.payload.control2X + dx,
          control2Y: clip.payload.control2Y + dy,
          toX: clip.payload.toX + dx,
          toY: clip.payload.toY + dy,
        },
      };
    }
    case 'shake': {
      const base = cloneDeep(clip);
      return {
        ...base,
        id: crypto.randomUUID(),
        objectId: targetObj.id,
        segmentId: targetSegmentId,
        payload: {
          ...base.payload,
          baseX: clip.payload.baseX + dx,
          baseY: clip.payload.baseY + dy,
        },
      };
    }
    case 'scale': {
      const base = cloneDeep(clip);
      return {
        ...base,
        id: crypto.randomUUID(),
        objectId: targetObj.id,
        segmentId: targetSegmentId,
        payload: {
          ...base.payload,
          fromScaleX: clip.payload.fromScaleX * scaleRatioX,
          fromScaleY: clip.payload.fromScaleY * scaleRatioY,
          toScaleX: clip.payload.toScaleX * scaleRatioX,
          toScaleY: clip.payload.toScaleY * scaleRatioY,
          keyframes: scaleKeyframes(clip.payload.keyframes, scaleRatioX, scaleRatioY),
        },
      };
    }
    case 'rotate': {
      const base = cloneDeep(clip);
      return {
        ...base,
        id: crypto.randomUUID(),
        objectId: targetObj.id,
        segmentId: targetSegmentId,
        payload: {
          ...base.payload,
          fromRotation: clip.payload.fromRotation + rotationDelta,
          toRotation: clip.payload.toRotation + rotationDelta,
          keyframes: rotateKeyframes(clip.payload.keyframes, rotationDelta),
        },
      };
    }
    default:
      return {
        ...cloneDeep(clip),
        id: crypto.randomUUID(),
        objectId: targetObj.id,
        segmentId: targetSegmentId,
      };
  }
};

export const useEditorStore = create<EditorState>()(
  immer((set) => ({
    objects: [],
    animations: [],
    globalDurationMs: 10000,
    playbackStatus: 'stopped',
    currentTimeMs: 0,
    previewClipId: null,
    playbackRate: 1,
    playbackLoopEnabled: false,
    sequenceExportRequestId: 0,
    sequenceExportOptions: {
      width: 1280,
      height: 720,
      fps: 24,
      startMs: 0,
      endMs: 10000,
      prefix: 'biodraw-frame',
    },
    exportCancelCount: 0,
    singleFrameExportId: 0,
    isPreviewMode: false,
    focusMode: false,
    fitVersion: 0,
    sequenceExportStatus: 'idle',
    sequenceExportMessage: '',
    videoExportRequestId: 0,
    videoExportOptions: {
      width: 1280,
      height: 720,
      fps: 24,
      startMs: 0,
      endMs: 10000,
      prefix: 'biodraw-video',
      format: 'mp4',
    },
    videoExportStatus: 'idle',
    videoExportMessage: '',
    past: [],
    future: [],
    selectedIds: [],
    applyAnimationFlashObjectIds: [],
    applyAnimationFlashKey: 0,
    isRatioLocked: true,
    canvasWidth: 1280,
    canvasHeight: 720,
    canvasBgColor: '#ffffff',
    expandedAnimationClipIds: [],
    canvasDrawingMode: null,
    hasUnsavedChanges: false,
    currentFileName: generateFileName(),

    addSceneObject: (obj) =>
      set((state) => {
        pushHistory(state);
        const next: SceneObject = { ...obj };
        if (!next.appearSegments || next.appearSegments.length === 0) {
          next.appearSegments = [{
            id: crypto.randomUUID(),
            startMs: 0,
            endMs: state.globalDurationMs,
          }];
        }
        state.objects.push(next);
        state.selectedIds = [next.id];
      }),

    removeSceneObject: (id) =>
      set((state) => {
        pushHistory(state);
        state.objects = state.objects.filter((o) => o.id !== id);
        state.selectedIds = state.selectedIds.filter((sid) => sid !== id);
        state.applyAnimationFlashObjectIds = state.applyAnimationFlashObjectIds.filter((sid) => sid !== id);
        const removedClipIds = new Set(
          state.animations.filter((a) => a.objectId === id).map((a) => a.id),
        );
        if (removedClipIds.size > 0) {
          state.animations = state.animations.filter((a) => a.objectId !== id);
          state.objects = state.objects.map((o) => ({
            ...o,
            animationIds: (o.animationIds || []).filter((cid) => !removedClipIds.has(cid)),
          }));
        }
      }),

    removeSceneObjects: (ids) =>
      set((state) => {
        if (ids.length === 0) return;
        pushHistory(state);
        const idSet = new Set(ids);
        const removedClipIds = new Set(
          state.animations.filter((a) => idSet.has(a.objectId)).map((a) => a.id),
        );
        state.objects = state.objects.filter((o) => !idSet.has(o.id));
        state.selectedIds = state.selectedIds.filter((sid) => !idSet.has(sid));
        state.applyAnimationFlashObjectIds = state.applyAnimationFlashObjectIds.filter((sid) => !idSet.has(sid));
        if (removedClipIds.size > 0) {
          state.animations = state.animations.filter((a) => !idSet.has(a.objectId));
          state.objects = state.objects.map((o) => ({
            ...o,
            animationIds: (o.animationIds || []).filter((cid) => !removedClipIds.has(cid)),
          }));
        }
      }),

    updateSceneObject: (id, updates) =>
      set((state) => {
        pushHistory(state);
        const idx = state.objects.findIndex((o) => o.id === id);
        if (idx !== -1) {
          state.objects[idx] = { ...state.objects[idx], ...updates };
        }
      }),

    moveObjectForward: (id) =>
      set((state) => {
        pushHistory(state);
        const idx = state.objects.findIndex((o) => o.id === id);
        if (idx !== -1 && idx < state.objects.length - 1) {
          const temp = state.objects[idx];
          state.objects[idx] = state.objects[idx + 1];
          state.objects[idx + 1] = temp;
        }
      }),

    moveObjectBackward: (id) =>
      set((state) => {
        pushHistory(state);
        const idx = state.objects.findIndex((o) => o.id === id);
        if (idx > 0) {
          const temp = state.objects[idx];
          state.objects[idx] = state.objects[idx - 1];
          state.objects[idx - 1] = temp;
        }
      }),

    moveObjectToFront: (id) =>
      set((state) => {
        pushHistory(state);
        const idx = state.objects.findIndex((o) => o.id === id);
        if (idx !== -1 && idx < state.objects.length - 1) {
          const [obj] = state.objects.splice(idx, 1);
          state.objects.push(obj);
        }
      }),

    moveObjectToBack: (id) =>
      set((state) => {
        pushHistory(state);
        const idx = state.objects.findIndex((o) => o.id === id);
        if (idx > 0) {
          const [obj] = state.objects.splice(idx, 1);
          state.objects.unshift(obj);
        }
      }),

    reorderObject: (id, toObjIndex) =>
      set((state) => {
        const fromObjIndex = state.objects.findIndex((o) => o.id === id);
        if (fromObjIndex === -1 || fromObjIndex === toObjIndex) return;
        pushHistory(state);
        const [obj] = state.objects.splice(fromObjIndex, 1);
        state.objects.splice(toObjIndex, 0, obj);
      }),

    setIsRatioLocked: (locked) =>
      set((state) => {
        state.isRatioLocked = locked;
      }),

    toggleObjectLock: (id) =>
      set((state) => {
        const obj = state.objects.find((o) => o.id === id);
        if (obj) {
          obj.locked = !obj.locked;
          // 锁定时取消选中
          if (obj.locked) {
            state.selectedIds = state.selectedIds.filter((sid) => sid !== id);
          }
        }
      }),

    groupObjects: (ids) =>
      set((state) => {
        if (ids.length < 2) return;
        pushHistory(state);
        const groupId = crypto.randomUUID();
        state.objects = state.objects.map((o) =>
          ids.includes(o.id) ? { ...o, groupId } : o,
        );
      }),

    ungroupObjects: (groupId) =>
      set((state) => {
        pushHistory(state);
        state.objects = state.objects.map((o) =>
          o.groupId === groupId ? { ...o, groupId: undefined } : o,
        );
      }),

    selectSceneObjects: (ids) =>
      set((state) => {
        state.selectedIds = ids;
      }),

    triggerApplyAnimationFlash: (ids) =>
      set((state) => {
        state.applyAnimationFlashObjectIds = [...ids];
        state.applyAnimationFlashKey += 1;
      }),

    clearApplyAnimationFlash: () =>
      set((state) => {
        state.applyAnimationFlashObjectIds = [];
      }),

    addAnimationClip: (clip) =>
      set((state) => {
        pushHistory(state);
        state.animations.push(clip);
        const obj = state.objects.find((o) => o.id === clip.objectId);
        if (obj) {
          obj.animationIds = Array.from(new Set([...(obj.animationIds || []), clip.id]));
        }
      }),

    updateAnimationClip: (id, updates) =>
      set((state) => {
        pushHistory(state);
        const idx = state.animations.findIndex((a) => a.id === id);
        if (idx !== -1) {
          state.animations[idx] = { ...state.animations[idx], ...updates } as AnimationClip;
        }
      }),

    removeAnimationClip: (id) =>
      set((state) => {
        pushHistory(state);
        const clip = state.animations.find((a) => a.id === id);
        if (clip) {
          const obj = state.objects.find((o) => o.id === clip.objectId);
          if (obj) {
            obj.animationIds = (obj.animationIds || []).filter((cid) => cid !== id);
          }
        }
        state.animations = state.animations.filter((a) => a.id !== id);
      }),

    reorderAnimationClips: (orderedIds) =>
      set((state) => {
        if (orderedIds.length < 2) return;
        pushHistory(state);
        const idSet = new Set(orderedIds);
        const positions = state.animations
          .map((a, i) => (idSet.has(a.id) ? i : -1))
          .filter((i) => i !== -1)
          .sort((a, b) => a - b);
        const clips = orderedIds
          .map((id) => state.animations.find((a) => a.id === id))
          .filter((c): c is AnimationClip => c !== undefined);
        clips.forEach((clip, i) => {
          state.animations[positions[i]] = clip;
        });
      }),

    copyAnimationClipsToObjects: (sourceObjectId, targetObjectIds) =>
      set((state) => {
        if (targetObjectIds.length === 0) return;
        const sourceClips = state.animations.filter((a) => a.objectId === sourceObjectId);
        if (sourceClips.length === 0) return;
        pushHistory(state);
        for (const targetId of targetObjectIds) {
          const targetObj = state.objects.find((o) => o.id === targetId);
          if (!targetObj) continue;
          for (const clip of sourceClips) {
            const newClip: AnimationClip = {
              ...cloneDeep(clip),
              id: crypto.randomUUID(),
              objectId: targetId,
              // 不沿用源对象的 segmentId（目标对象的段集合不同）；若需要落入段内由调用方后续 clamp。
              segmentId: undefined,
            };
            state.animations.push(newClip);
            targetObj.animationIds = Array.from(
              new Set([...(targetObj.animationIds || []), newClip.id]),
            );
          }
        }
      }),

    applyAnimationClipsToObjects: ({ sourceObjectId, sourceSegmentId, targetObjectIds }) => {
      const result: ApplyAnimationResult = {
        appliedTargetCount: 0,
        skippedTargetCount: 0,
        copiedClipCount: 0,
        skippedReasons: {},
      };
      set((state) => {
        if (targetObjectIds.length === 0) return;
        const sourceObj = state.objects.find((o) => o.id === sourceObjectId);
        if (!sourceObj) return;
        const sourceSegment = getObjectSegment(sourceObj, sourceSegmentId, state.globalDurationMs);
        if (!sourceSegment) return;
        const sourceClips = state.animations.filter(
          (clip) => clip.objectId === sourceObjectId && clip.segmentId === sourceSegmentId,
        );
        if (sourceClips.length === 0) return;

        const targetIdsToApply: string[] = [];
        for (const targetId of targetObjectIds) {
          const targetObj = state.objects.find((o) => o.id === targetId);
          if (!targetObj) {
            result.skippedTargetCount += 1;
            result.skippedReasons[targetId] = 'missing-target';
            continue;
          }
          if (targetObj.locked) {
            result.skippedTargetCount += 1;
            result.skippedReasons[targetId] = 'locked-target';
            continue;
          }
          if (!canApplyToTargetSegment(targetObj, sourceSegment, state.globalDurationMs)) {
            result.skippedTargetCount += 1;
            result.skippedReasons[targetId] = 'segment-conflict';
            continue;
          }
          const reusableTargetSegment = getReusableTargetSegmentForApply(targetObj, sourceSegment, state.globalDurationMs);
          if (reusableTargetSegment && hasAnimationDomainConflict(targetObj, reusableTargetSegment, sourceClips, state.animations)) {
            result.skippedTargetCount += 1;
            result.skippedReasons[targetId] = 'animation-conflict';
            continue;
          }
          targetIdsToApply.push(targetId);
        }

        if (targetIdsToApply.length === 0) return;
        pushHistory(state);

        for (const targetId of targetIdsToApply) {
          const targetObj = state.objects.find((o) => o.id === targetId);
          if (!targetObj) continue;
          const resolved = resolveTargetSegmentForApply(targetObj, sourceSegment, state.globalDurationMs);
          if (resolved.skipped || !resolved.segment) continue;
          const newClipIds: string[] = [];
          for (const clip of sourceClips) {
            const newClip = buildAppliedClip(clip, sourceObj, targetObj, resolved.segment.id);
            state.animations.push(newClip);
            newClipIds.push(newClip.id);
            result.copiedClipCount += 1;
          }
          targetObj.animationIds = Array.from(
            new Set([...(targetObj.animationIds || []), ...newClipIds]),
          );
          result.appliedTargetCount += 1;
        }
      });
      return result;
    },

    addAppearSegment: (objectId, segment) =>
      set((state) => {
        const obj = state.objects.find((o) => o.id === objectId);
        if (!obj) return;
        pushHistory(state);
        const list = obj.appearSegments ? [...obj.appearSegments] : [];
        list.push({ ...segment });
        list.sort((a, b) => a.startMs - b.startMs);
        obj.appearSegments = list;
      }),

    removeAppearSegments: (objectId, segmentIds) =>
      set((state) => {
        if (segmentIds.length === 0) return;
        const obj = state.objects.find((o) => o.id === objectId);
        if (!obj || !obj.appearSegments) return;
        const idSet = new Set(segmentIds);
        pushHistory(state);
        obj.appearSegments = obj.appearSegments.filter((s) => !idSet.has(s.id));
        // 连带删除归属这些段的动画片段
        const removedClipIds = new Set(
          state.animations
            .filter((a) => a.objectId === objectId && a.segmentId !== undefined && idSet.has(a.segmentId))
            .map((a) => a.id),
        );
        if (removedClipIds.size > 0) {
          state.animations = state.animations.filter((a) => !removedClipIds.has(a.id));
          obj.animationIds = (obj.animationIds || []).filter((cid) => !removedClipIds.has(cid));
        }
      }),

    updateAppearSegment: (objectId, segmentId, updates, translateClipsBy) =>
      set((state) => {
        const obj = state.objects.find((o) => o.id === objectId);
        if (!obj || !obj.appearSegments) return;
        const idx = obj.appearSegments.findIndex((s) => s.id === segmentId);
        if (idx === -1) return;
        pushHistory(state);
        const next = { ...obj.appearSegments[idx] };
        if (updates.startMs !== undefined) next.startMs = updates.startMs;
        if (updates.endMs !== undefined) next.endMs = updates.endMs;
        obj.appearSegments[idx] = next;
        obj.appearSegments.sort((a, b) => a.startMs - b.startMs);
        for (let i = 0; i < state.animations.length; i += 1) {
          const c = state.animations[i];
          if (c.objectId !== objectId || c.segmentId !== segmentId) continue;
          if (translateClipsBy !== undefined && translateClipsBy !== 0) {
            // 整体移动段：clip 随段平移，保持段内相对位置
            const translated = c.startTimeMs + translateClipsBy;
            const newStart = Math.max(next.startMs, Math.min(next.endMs - c.durationMs, translated));
            if (newStart !== c.startTimeMs) {
              state.animations[i] = { ...c, startTimeMs: newStart };
            }
          } else {
            // 调整边缘大小：将 clip 夹入新范围，最小时长 1000ms
            const newStart = Math.max(next.startMs, Math.min(next.endMs - 1000, c.startTimeMs));
            const newEnd = Math.min(next.endMs, Math.max(newStart + 1000, c.startTimeMs + c.durationMs));
            const newDur = Math.max(1000, newEnd - newStart);
            if (newStart !== c.startTimeMs || newDur !== c.durationMs) {
              state.animations[i] = { ...c, startTimeMs: newStart, durationMs: newDur };
            }
          }
        }
      }),

    setGlobalDurationMs: (durationMs) =>
      set((state) => {
        pushHistory(state);
        state.globalDurationMs = Math.max(1000, Math.round(durationMs));
        state.currentTimeMs = clampTime(state.currentTimeMs, state.globalDurationMs);
      }),

    setCurrentTimeMs: (timeMs) =>
      set((state) => {
        state.previewClipId = null;
        state.currentTimeMs = clampTime(timeMs, state.globalDurationMs);
        if (state.currentTimeMs === 0 && state.playbackStatus === 'paused') {
          state.playbackStatus = 'stopped';
        }
        if (state.currentTimeMs > 0 && state.playbackStatus === 'stopped') {
          state.playbackStatus = 'paused';
        }
      }),

    play: () =>
      set((state) => {
        if (state.globalDurationMs <= 0) return;
        if (state.animations.length === 0) return;
        state.previewClipId = null;
        if (state.currentTimeMs >= state.globalDurationMs) {
          state.currentTimeMs = 0;
        }
        state.playbackStatus = 'playing';
      }),

    pause: () =>
      set((state) => {
        if (state.playbackStatus !== 'playing') return;
        state.playbackStatus = 'paused';
        state.previewClipId = null;
      }),

    stop: () =>
      set((state) => {
        state.playbackStatus = 'stopped';
        state.currentTimeMs = 0;
        state.previewClipId = null;
      }),

    startClipPreview: (clipId) =>
      set((state) => {
        const clip = state.animations.find((a) => a.id === clipId);
        if (!clip) return;
        state.previewClipId = clipId;
        state.currentTimeMs = clampTime(clip.startTimeMs, state.globalDurationMs);
        state.playbackStatus = 'playing';
      }),

    advancePlayback: (deltaMs) =>
      set((state) => {
        if (state.playbackStatus !== 'playing') return;
        const delta = Math.max(0, deltaMs) * clampPlaybackRate(state.playbackRate);
        if (delta <= 0) return;

        const nextTime = state.currentTimeMs + delta;

        if (state.previewClipId) {
          const clip = state.animations.find((a) => a.id === state.previewClipId);
          if (!clip) {
            state.previewClipId = null;
          } else {
            const endMs = clampTime(clip.startTimeMs + clip.durationMs, state.globalDurationMs);
            if (nextTime >= endMs) {
              state.currentTimeMs = endMs;
              state.playbackStatus = endMs <= 0 ? 'stopped' : 'paused';
              state.previewClipId = null;
              return;
            }
            state.currentTimeMs = nextTime;
            return;
          }
        }

        if (nextTime >= state.globalDurationMs) {
          if (state.playbackLoopEnabled) {
            const duration = Math.max(1, state.globalDurationMs);
            state.currentTimeMs = nextTime % duration;
          } else {
            state.currentTimeMs = state.globalDurationMs;
            state.playbackStatus = 'stopped';
          }
          return;
        }
        state.currentTimeMs = nextTime;
      }),

    setPlaybackRate: (rate) =>
      set((state) => {
        state.playbackRate = clampPlaybackRate(rate);
      }),

    setPlaybackLoopEnabled: (enabled) =>
      set((state) => {
        state.playbackLoopEnabled = enabled;
      }),

    stepPlaybackFrame: (direction) =>
      set((state) => {
        const frameMs = 1000 / 60;
        const delta = direction >= 0 ? frameMs : -frameMs;
        state.playbackStatus = 'paused';
        state.previewClipId = null;
        state.currentTimeMs = clampTime(state.currentTimeMs + delta, state.globalDurationMs);
        if (state.currentTimeMs === 0) {
          state.playbackStatus = 'stopped';
        }
      }),

    cancelExport: () =>
      set((state) => {
        state.exportCancelCount += 1;
      }),

    requestSingleFrameExport: () =>
      set((state) => {
        state.singleFrameExportId += 1;
      }),

    setPreviewMode: (v) =>
      set((state) => {
        state.isPreviewMode = v;
        state.previewClipId = null;
        if (v) {
          state.currentTimeMs = 0;
          state.playbackStatus = state.animations.length > 0 ? 'playing' : 'stopped';
        } else if (state.playbackStatus === 'playing') {
          state.playbackStatus = 'paused';
        }
      }),

    setFocusMode: (v) =>
      set((state) => {
        state.focusMode = v;
      }),

    requestFit: () =>
      set((state) => {
        state.fitVersion += 1;
      }),

    requestSequenceExport: (options) =>
      set((state) => {
        state.sequenceExportRequestId += 1;
        state.sequenceExportOptions = {
          ...options,
          width: Math.max(16, Math.round(options.width)),
          height: Math.max(16, Math.round(options.height)),
          fps: Math.max(1, Math.min(60, Math.round(options.fps))),
          startMs: clampTime(Math.round(options.startMs), state.globalDurationMs),
          endMs: clampTime(Math.round(options.endMs), state.globalDurationMs),
          prefix: (options.prefix || 'biodraw-frame').trim() || 'biodraw-frame',
        };
        state.sequenceExportStatus = 'idle';
        state.sequenceExportMessage = '';
      }),

    setSequenceExportStatus: (status, message = '') =>
      set((state) => {
        state.sequenceExportStatus = status;
        state.sequenceExportMessage = message;
      }),

    requestVideoExport: (options) =>
      set((state) => {
        state.videoExportRequestId += 1;
        state.videoExportOptions = {
          ...options,
          width: Math.max(16, Math.round(options.width)),
          height: Math.max(16, Math.round(options.height)),
          fps: Math.max(1, Math.min(60, Math.round(options.fps))),
          startMs: clampTime(Math.round(options.startMs), state.globalDurationMs),
          endMs: clampTime(Math.round(options.endMs), state.globalDurationMs),
          prefix: (options.prefix || 'biodraw-video').trim() || 'biodraw-video',
          format: options.format === 'webm' ? 'webm' : 'mp4',
        };
        state.videoExportStatus = 'idle';
        state.videoExportMessage = '';
      }),

    setVideoExportStatus: (status, message = '') =>
      set((state) => {
        state.videoExportStatus = status;
        state.videoExportMessage = message;
      }),

    selectObject: (id) =>
      set((state) => {
        if (id === null) {
          state.selectedIds = [];
        } else {
          const obj = state.objects.find((o) => o.id === id);
          if (obj?.groupId) {
            // 选中分组成员时，自动扩展选中整个分组
            state.selectedIds = state.objects
              .filter((o) => o.groupId === obj.groupId)
              .map((o) => o.id);
          } else {
            state.selectedIds = [id];
          }
        }
      }),

    toggleSelectObject: (id) =>
      set((state) => {
        const obj = state.objects.find((o) => o.id === id);
        if (obj?.groupId) {
          // Shift+点击分组成员：整组加入/移出选择
          const groupIds = state.objects
            .filter((o) => o.groupId === obj.groupId)
            .map((o) => o.id);
          const anySelected = groupIds.some((gid) => state.selectedIds.includes(gid));
          if (anySelected) {
            state.selectedIds = state.selectedIds.filter((sid) => !groupIds.includes(sid));
          } else {
            const toAdd = groupIds.filter((gid) => !state.selectedIds.includes(gid));
            state.selectedIds.push(...toAdd);
          }
        } else {
          const idx = state.selectedIds.indexOf(id);
          if (idx === -1) {
            state.selectedIds.push(id);
          } else {
            state.selectedIds.splice(idx, 1);
          }
        }
      }),

    selectAllObjects: () =>
      set((state) => {
        state.selectedIds = state.objects.map((o) => o.id);
      }),

    moveMultipleSceneObjects: (moves) =>
      set((state) => {
        if (moves.length === 0) return;
        // 过滤掉锁定对象
        const unlockedMoves = moves.filter((m) => {
          const obj = state.objects.find((o) => o.id === m.id);
          return obj && !obj.locked;
        });
        if (unlockedMoves.length === 0) return;
        pushHistory(state);
        const moveMap = new Map(unlockedMoves.map((m) => [m.id, m]));
        state.objects = state.objects.map((o) => {
          const m = moveMap.get(o.id);
          if (!m) return o;
          return { ...o, x: m.x, y: m.y };
        });
      }),

    duplicateObject: (id) =>
      set((state) => {
        pushHistory(state);
        const src = state.objects.find((o) => o.id === id);
        if (!src) return;
        const newObj: SceneObject = {
          ...cloneDeep(src),
          id: crypto.randomUUID(),
          x: src.x + 20,
          y: src.y + 20,
          animationIds: [],
          // 段集合需要重新分配 id（避免与源对象段 id 冲突，便于后续归属判断）
          appearSegments: (src.appearSegments ?? []).map((s) => ({
            ...s,
            id: crypto.randomUUID(),
          })),
        };
        state.objects.push(newObj);
        state.selectedIds = [newObj.id];
      }),

    setCanvasSize: (width, height) =>
      set((state) => {
        state.canvasWidth = Math.max(100, Math.round(width));
        state.canvasHeight = Math.max(100, Math.round(height));
      }),

    setCanvasBgColor: (color) =>
      set((state) => {
        state.canvasBgColor = color;
      }),

    loadSnapshot: (snapshot) =>
      set((state) => {
        state.objects = snapshot.objects;
        state.animations = snapshot.animations;
        state.globalDurationMs = snapshot.globalDurationMs;
        if (snapshot.canvasWidth !== undefined) state.canvasWidth = snapshot.canvasWidth;
        if (snapshot.canvasHeight !== undefined) state.canvasHeight = snapshot.canvasHeight;
        if (snapshot.canvasBgColor !== undefined) state.canvasBgColor = snapshot.canvasBgColor;
        state.selectedIds = [];
        state.applyAnimationFlashObjectIds = [];
        state.past = [];
        state.future = [];
        state.currentTimeMs = 0;
        state.playbackStatus = 'stopped';
        state.hasUnsavedChanges = false;
      }),

    markSaved: (fileName?: string) =>
      set((state) => {
        state.hasUnsavedChanges = false;
        if (fileName !== undefined) state.currentFileName = fileName;
      }),

    resetScene: () =>
      set((state) => {
        state.objects = [];
        state.animations = [];
        state.selectedIds = [];
        state.applyAnimationFlashObjectIds = [];
        state.currentTimeMs = 0;
        state.playbackStatus = 'stopped';
        state.past = [];
        state.future = [];
        state.hasUnsavedChanges = false;
        state.currentFileName = generateFileName();
      }),

    setCurrentFileName: (name) =>
      set((state) => {
        state.currentFileName = name;
      }),

    setExpandedAnimationClipIds: (ids) =>
      set((state) => {
        state.expandedAnimationClipIds = ids;
      }),

    setCanvasDrawingMode: (mode) =>
      set((state) => {
        state.canvasDrawingMode = mode;
      }),

    patchAnimationClipSilent: (id, updates) =>
      set((state) => {
        const idx = state.animations.findIndex((a) => a.id === id);
        if (idx !== -1) {
          state.animations[idx] = { ...state.animations[idx], ...updates } as AnimationClip;
        }
      }),

    materializeAppearSegmentsSilent: (objectId, fallbackEndMs) =>
      set((state) => {
        const obj = state.objects.find((o) => o.id === objectId);
        if (!obj) return;
        if (obj.appearSegments && obj.appearSegments.length > 0) return;
        // 兼容旧数据：根据 appearStartMs/appearEndMs 落地为单段；都缺省时用 [0, fallback]
        obj.appearSegments = [{
          id: crypto.randomUUID(),
          startMs: obj.appearStartMs ?? 0,
          endMs: obj.appearEndMs ?? fallbackEndMs,
        }];
      }),

    undo: () =>
      set((state) => {
        if (state.past.length === 0) return;
        state.future.push(toSnapshot(state));
        const snapshot = state.past.pop()!;
        state.objects = snapshot.objects;
        state.animations = snapshot.animations;
        state.globalDurationMs = snapshot.globalDurationMs;
        state.currentTimeMs = clampTime(state.currentTimeMs, state.globalDurationMs);
        state.playbackStatus = 'stopped';
        state.selectedIds = [];
        state.applyAnimationFlashObjectIds = [];
      }),

    redo: () =>
      set((state) => {
        if (state.future.length === 0) return;
        state.past.push(toSnapshot(state));
        const snapshot = state.future.pop()!;
        state.objects = snapshot.objects;
        state.animations = snapshot.animations;
        state.globalDurationMs = snapshot.globalDurationMs;
        state.currentTimeMs = clampTime(state.currentTimeMs, state.globalDurationMs);
        state.playbackStatus = 'stopped';
        state.selectedIds = [];
        state.applyAnimationFlashObjectIds = [];
      }),
  })),
);

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__store = useEditorStore;
}
