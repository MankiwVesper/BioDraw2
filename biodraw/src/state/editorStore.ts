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
  canvasWidth: number;
  canvasHeight: number;
  canvasBgColor: string;
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
  groupEditingId: string | null;
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
  moveMultipleSceneObjectsSilent: (moves: Array<{ id: string; x: number; y: number }>) => void;
  batchUpdateSceneObjects: (updates: Array<{ id: string; patch: Partial<SceneObject> }>) => void;
  updateSceneObjectSilent: (id: string, updates: Partial<SceneObject>) => void;
  batchUpdateSceneObjectsSilent: (updates: Array<{ id: string; patch: Partial<SceneObject> }>) => void;
  setCanvasSize: (width: number, height: number) => void;
  setCanvasBgColor: (color: string) => void;
  setCanvasBgColorSilent: (color: string) => void;
  moveObjectForward: (id: string) => void;
  moveObjectBackward: (id: string) => void;
  moveObjectToFront: (id: string) => void;
  moveObjectToBack: (id: string) => void;
  moveMultipleObjectsForward: (ids: string[]) => void;
  moveMultipleObjectsBackward: (ids: string[]) => void;
  moveMultipleObjectsToFront: (ids: string[]) => void;
  moveMultipleObjectsToBack: (ids: string[]) => void;
  flipSceneObject: (id: string, axis: 'x' | 'y') => void;
  flipMultipleSceneObjects: (ids: string[], axis: 'x' | 'y') => void;
  axisFlipSceneObject: (id: string, axis: 'x' | 'y') => void;
  axisFlipMultipleSceneObjects: (ids: string[], axis: 'x' | 'y') => void;
  centerFlipSceneObject: (id: string) => void;
  centerFlipMultipleSceneObjects: (ids: string[]) => void;
  reorderObject: (id: string, toObjIndex: number) => void;
  setIsRatioLocked: (locked: boolean) => void;
  toggleObjectLock: (id: string) => void;
  groupObjects: (ids: string[]) => void;
  ungroupObjects: (groupId: string) => void;
  enterGroupEditing: (id: string) => void;
  exitGroupEditing: () => void;
  selectSceneObjects: (ids: string[]) => void;
  triggerApplyAnimationFlash: (ids: string[]) => void;
  clearApplyAnimationFlash: () => void;

  addAnimationClip: (clip: AnimationClip) => void;
  updateAnimationClip: (id: string, updates: Partial<AnimationClip>) => void;
  batchUpdateAnimationClips: (updates: Array<{ id: string; patch: Partial<AnimationClip> }>) => void;
  removeAnimationClip: (id: string) => void;
  removeAnimationClips: (ids: string[]) => void;
  reorderAnimationClips: (orderedIds: string[]) => void;
  copyAnimationClipsToObjects: (sourceObjectId: string, targetObjectIds: string[]) => void;
  applyAnimationClipsToObjects: (options: ApplyAnimationOptions) => ApplyAnimationResult;

  addAppearSegment: (objectId: string, segment: AppearSegment) => void;
  removeAppearSegments: (objectId: string, segmentIds: string[]) => void;
  updateAppearSegment: (objectId: string, segmentId: string, updates: { startMs?: number; endMs?: number }, translateClipsBy?: number) => void;
  updateAppearSegmentSilent: (objectId: string, segmentId: string, updates: { startMs?: number; endMs?: number }) => void;
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
  singleFrameExportWidth: number;
  cancelExport: () => void;
  requestSingleFrameExport: (width: number) => void;
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
  canvasWidth: state.canvasWidth,
  canvasHeight: state.canvasHeight,
  canvasBgColor: state.canvasBgColor,
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

// 计算线/曲线点集的局部坐标中心（用于单元素原地轴对称/中心对称）
const getLineLocalCenter = (points: number[]) => {
  const xs = points.filter((_, i) => i % 2 === 0);
  const ys = points.filter((_, i) => i % 2 === 1);
  if (xs.length === 0) return { cx: 0, cy: 0 };
  return {
    cx: (Math.min(...xs) + Math.max(...xs)) / 2,
    cy: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
};

// 计算元素在画布上的实际包围盒（忽略旋转，用于组合整体变换的基准计算）
const getElementBounds = (obj: SceneObject) => {
  if (['line', 'arrow', 'curve'].includes(obj.type)) {
    const pts = (obj.data?.points as number[]) || [];
    const sx = obj.scaleX ?? 1, sy = obj.scaleY ?? 1;
    const xs = pts.filter((_, i) => i % 2 === 0).map((px) => obj.x + sx * px);
    const ys = pts.filter((_, i) => i % 2 === 1).map((py) => obj.y + sy * py);
    if (xs.length === 0) return { minX: obj.x, maxX: obj.x, minY: obj.y, maxY: obj.y };
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  }
  const hw = Math.abs(obj.scaleX ?? 1) * obj.width / 2;
  const hh = Math.abs(obj.scaleY ?? 1) * obj.height / 2;
  return { minX: obj.x - hw, maxX: obj.x + hw, minY: obj.y - hh, maxY: obj.y + hh };
};

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
    case 'move':
    case 'moveAlongPath':
    case 'polylineMove':
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
    singleFrameExportWidth: 1280,
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
    groupEditingId: null,
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
        const obj = state.objects.find((o) => o.id === id);
        if (!obj || obj.locked) return;
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
        const lockedIds = new Set(state.objects.filter((o) => o.locked).map((o) => o.id));
        const idSet = new Set(ids.filter((id) => !lockedIds.has(id)));
        if (idSet.size === 0) return;
        pushHistory(state);
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
        const idx = state.objects.findIndex((o) => o.id === id);
        if (idx !== -1) {
          pushHistory(state);
          state.objects[idx] = { ...state.objects[idx], ...updates };
        }
      }),

    updateSceneObjectSilent: (id, updates) =>
      set((state) => {
        const idx = state.objects.findIndex((o) => o.id === id);
        if (idx !== -1) {
          state.objects[idx] = { ...state.objects[idx], ...updates };
        }
      }),

    moveObjectForward: (id) =>
      set((state) => {
        const idx = state.objects.findIndex((o) => o.id === id);
        if (idx !== -1 && idx < state.objects.length - 1) {
          pushHistory(state);
          const temp = state.objects[idx];
          state.objects[idx] = state.objects[idx + 1];
          state.objects[idx + 1] = temp;
        }
      }),

    moveObjectBackward: (id) =>
      set((state) => {
        const idx = state.objects.findIndex((o) => o.id === id);
        if (idx > 0) {
          pushHistory(state);
          const temp = state.objects[idx];
          state.objects[idx] = state.objects[idx - 1];
          state.objects[idx - 1] = temp;
        }
      }),

    moveObjectToFront: (id) =>
      set((state) => {
        const idx = state.objects.findIndex((o) => o.id === id);
        if (idx !== -1 && idx < state.objects.length - 1) {
          pushHistory(state);
          const [obj] = state.objects.splice(idx, 1);
          state.objects.push(obj);
        }
      }),

    moveObjectToBack: (id) =>
      set((state) => {
        const idx = state.objects.findIndex((o) => o.id === id);
        if (idx > 0) {
          pushHistory(state);
          const [obj] = state.objects.splice(idx, 1);
          state.objects.unshift(obj);
        }
      }),

    moveMultipleObjectsToFront: (ids) =>
      set((state) => {
        if (ids.length === 0) return;
        pushHistory(state);
        const idSet = new Set(ids);
        // 从高 index 向低 index 移除，保留原始相对顺序
        const toMove: SceneObject[] = [];
        for (let i = state.objects.length - 1; i >= 0; i--) {
          if (idSet.has(state.objects[i].id)) {
            toMove.unshift(state.objects.splice(i, 1)[0]);
          }
        }
        toMove.forEach((obj) => state.objects.push(obj));
      }),

    moveMultipleObjectsToBack: (ids) =>
      set((state) => {
        if (ids.length === 0) return;
        pushHistory(state);
        const idSet = new Set(ids);
        // 从高 index 向低 index 移除，保留原始相对顺序
        const toMove: SceneObject[] = [];
        for (let i = state.objects.length - 1; i >= 0; i--) {
          if (idSet.has(state.objects[i].id)) {
            toMove.unshift(state.objects.splice(i, 1)[0]);
          }
        }
        // 按原始相对顺序插入到头部
        toMove.forEach((obj, idx) => state.objects.splice(idx, 0, obj));
      }),

    flipSceneObject: (id, axis) =>
      set((state) => {
        const obj = state.objects.find((o) => o.id === id);
        if (!obj || obj.locked) return;
        pushHistory(state);
        if (axis === 'x') {
          obj.x = state.canvasWidth - obj.x;
          obj.scaleX = -(obj.scaleX ?? 1);
        } else {
          obj.y = state.canvasHeight - obj.y;
          obj.scaleY = -(obj.scaleY ?? 1);
        }
      }),

    flipMultipleSceneObjects: (ids, axis) =>
      set((state) => {
        if (ids.length === 0) return;
        pushHistory(state);
        const idSet = new Set(ids);
        state.objects.forEach((obj) => {
          if (!idSet.has(obj.id) || obj.locked) return;
          if (axis === 'x') {
            obj.x = state.canvasWidth - obj.x;
            obj.scaleX = -(obj.scaleX ?? 1);
          } else {
            obj.y = state.canvasHeight - obj.y;
            obj.scaleY = -(obj.scaleY ?? 1);
          }
        });
      }),

    // 以元素自身轴原地翻转（位置不变，视觉内容镜像）
    axisFlipSceneObject: (id, axis) =>
      set((state) => {
        const obj = state.objects.find((o) => o.id === id);
        if (!obj || obj.locked) return;
        pushHistory(state);
        const isLine = ['line', 'arrow', 'curve'].includes(obj.type);
        if (isLine) {
          const { cx, cy } = getLineLocalCenter((obj.data?.points as number[]) || []);
          if (axis === 'x') {
            obj.x += 2 * (obj.scaleX ?? 1) * cx;
            obj.scaleX = -(obj.scaleX ?? 1);
          } else {
            obj.y += 2 * (obj.scaleY ?? 1) * cy;
            obj.scaleY = -(obj.scaleY ?? 1);
          }
        } else {
          if (axis === 'x') obj.scaleX = -(obj.scaleX ?? 1);
          else obj.scaleY = -(obj.scaleY ?? 1);
        }
      }),

    axisFlipMultipleSceneObjects: (ids, axis) =>
      set((state) => {
        if (ids.length === 0) return;
        pushHistory(state);
        const idSet = new Set(ids);
        // 第一遍：计算组合包围盒
        let gMinX = Infinity, gMaxX = -Infinity;
        let gMinY = Infinity, gMaxY = -Infinity;
        state.objects.forEach((obj) => {
          if (!idSet.has(obj.id) || obj.locked) return;
          const { minX, maxX, minY, maxY } = getElementBounds(obj);
          gMinX = Math.min(gMinX, minX); gMaxX = Math.max(gMaxX, maxX);
          gMinY = Math.min(gMinY, minY); gMaxY = Math.max(gMaxY, maxY);
        });
        const cx = (gMinX + gMaxX) / 2;
        const cy = (gMinY + gMaxY) / 2;
        // 第二遍：以包围盒中心为轴镜像每个元素的位置 + 翻转视觉内容
        state.objects.forEach((obj) => {
          if (!idSet.has(obj.id) || obj.locked) return;
          if (axis === 'x') {
            obj.x = 2 * cx - obj.x;
            obj.scaleX = -(obj.scaleX ?? 1);
          } else {
            obj.y = 2 * cy - obj.y;
            obj.scaleY = -(obj.scaleY ?? 1);
          }
        });
      }),

    // 以元素自身几何中心原地旋转180°（中心对称）
    centerFlipSceneObject: (id) =>
      set((state) => {
        const obj = state.objects.find((o) => o.id === id);
        if (!obj || obj.locked) return;
        pushHistory(state);
        const isLine = ['line', 'arrow', 'curve'].includes(obj.type);
        if (isLine) {
          const { cx, cy } = getLineLocalCenter((obj.data?.points as number[]) || []);
          obj.x += 2 * (obj.scaleX ?? 1) * cx;
          obj.y += 2 * (obj.scaleY ?? 1) * cy;
          obj.scaleX = -(obj.scaleX ?? 1);
          obj.scaleY = -(obj.scaleY ?? 1);
        } else {
          obj.rotation = ((obj.rotation ?? 0) + 180) % 360;
        }
      }),

    centerFlipMultipleSceneObjects: (ids) =>
      set((state) => {
        if (ids.length === 0) return;
        pushHistory(state);
        const idSet = new Set(ids);
        // 第一遍：计算组合包围盒中心
        let gMinX = Infinity, gMaxX = -Infinity;
        let gMinY = Infinity, gMaxY = -Infinity;
        state.objects.forEach((obj) => {
          if (!idSet.has(obj.id) || obj.locked) return;
          const { minX, maxX, minY, maxY } = getElementBounds(obj);
          gMinX = Math.min(gMinX, minX); gMaxX = Math.max(gMaxX, maxX);
          gMinY = Math.min(gMinY, minY); gMaxY = Math.max(gMaxY, maxY);
        });
        const cx = (gMinX + gMaxX) / 2;
        const cy = (gMinY + gMaxY) / 2;
        // 第二遍：以包围盒中心为对称中心，镜像每个元素的位置 + 翻转两轴视觉内容
        state.objects.forEach((obj) => {
          if (!idSet.has(obj.id) || obj.locked) return;
          obj.x = 2 * cx - obj.x;
          obj.y = 2 * cy - obj.y;
          obj.scaleX = -(obj.scaleX ?? 1);
          obj.scaleY = -(obj.scaleY ?? 1);
        });
      }),

    moveMultipleObjectsForward: (ids) =>
      set((state) => {
        if (ids.length === 0) return;
        const idSet = new Set(ids);
        const indices = state.objects
          .map((o, i) => (idSet.has(o.id) ? i : -1))
          .filter((i) => i >= 0)
          .sort((a, b) => b - a);
        if (indices.length === 0) return;
        const canMove = indices.some(
          (idx) => idx < state.objects.length - 1 && !idSet.has(state.objects[idx + 1].id),
        );
        if (!canMove) return;
        pushHistory(state);
        for (const idx of indices) {
          if (idx < state.objects.length - 1 && !idSet.has(state.objects[idx + 1].id)) {
            const temp = state.objects[idx];
            state.objects[idx] = state.objects[idx + 1];
            state.objects[idx + 1] = temp;
          }
        }
      }),

    moveMultipleObjectsBackward: (ids) =>
      set((state) => {
        if (ids.length === 0) return;
        const idSet = new Set(ids);
        const indices = state.objects
          .map((o, i) => (idSet.has(o.id) ? i : -1))
          .filter((i) => i >= 0)
          .sort((a, b) => a - b);
        if (indices.length === 0) return;
        const canMove = indices.some(
          (idx) => idx > 0 && !idSet.has(state.objects[idx - 1].id),
        );
        if (!canMove) return;
        pushHistory(state);
        for (const idx of indices) {
          if (idx > 0 && !idSet.has(state.objects[idx - 1].id)) {
            const temp = state.objects[idx];
            state.objects[idx] = state.objects[idx - 1];
            state.objects[idx - 1] = temp;
          }
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
        // 有意不调用 pushHistory：锁定/解锁属于元操作，不应被 Undo 撤销
        const obj = state.objects.find((o) => o.id === id);
        if (obj) {
          obj.locked = !obj.locked;
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
        state.selectedIds = [];
        state.groupEditingId = null;
      }),

    enterGroupEditing: (id) =>
      set((state) => {
        state.groupEditingId = id;
        state.selectedIds = [id];
      }),

    exitGroupEditing: () =>
      set((state) => {
        const id = state.groupEditingId;
        state.groupEditingId = null;
        if (id) {
          const obj = state.objects.find((o) => o.id === id);
          state.selectedIds = obj?.groupId
            ? state.objects.filter((o) => o.groupId === obj.groupId).map((o) => o.id)
            : [];
        }
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

    batchUpdateAnimationClips: (updates) =>
      set((state) => {
        if (updates.length === 0) return;
        pushHistory(state);
        for (const { id, patch } of updates) {
          const idx = state.animations.findIndex((a) => a.id === id);
          if (idx !== -1) {
            state.animations[idx] = { ...state.animations[idx], ...patch } as AnimationClip;
          }
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

    removeAnimationClips: (ids) =>
      set((state) => {
        if (ids.length === 0) return;
        pushHistory(state);
        const idSet = new Set(ids);
        for (const id of ids) {
          const clip = state.animations.find((a) => a.id === id);
          if (clip) {
            const obj = state.objects.find((o) => o.id === clip.objectId);
            if (obj) obj.animationIds = (obj.animationIds || []).filter((cid) => !idSet.has(cid));
          }
        }
        state.animations = state.animations.filter((a) => !idSet.has(a.id));
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
        const removedSegments = obj.appearSegments.filter((s) => idSet.has(s.id));
        const remainingSegments = obj.appearSegments.filter((s) => !idSet.has(s.id));
        obj.appearSegments = remainingSegments;
        const remainingSegmentIds = new Set(remainingSegments.map((s) => s.id));
        // 连带删除归属这些段的动画片段；兼容旧数据中没有 segmentId 的动画。
        const removedClipIds = new Set(
          state.animations
            .filter((a) => {
              if (a.objectId !== objectId) return false;
              if (remainingSegments.length === 0) return true;
              if (a.segmentId !== undefined) return idSet.has(a.segmentId) || !remainingSegmentIds.has(a.segmentId);
              return removedSegments.some((seg) => a.startTimeMs >= seg.startMs && a.startTimeMs <= seg.endMs);
            })
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

    updateAppearSegmentSilent: (objectId, segmentId, updates) =>
      set((state) => {
        const obj = state.objects.find((o) => o.id === objectId);
        if (!obj || !obj.appearSegments) return;
        const idx = obj.appearSegments.findIndex((s) => s.id === segmentId);
        if (idx === -1) return;
        const next = { ...obj.appearSegments[idx] };
        if (updates.startMs !== undefined) next.startMs = updates.startMs;
        if (updates.endMs !== undefined) next.endMs = updates.endMs;
        obj.appearSegments[idx] = next;
        obj.appearSegments.sort((a, b) => a.startMs - b.startMs);
        for (let i = 0; i < state.animations.length; i += 1) {
          const c = state.animations[i];
          if (c.objectId !== objectId || c.segmentId !== segmentId) continue;
          const newStart = Math.max(next.startMs, Math.min(next.endMs - 1000, c.startTimeMs));
          const newEnd = Math.min(next.endMs, Math.max(newStart + 1000, c.startTimeMs + c.durationMs));
          const newDur = Math.max(1000, newEnd - newStart);
          if (newStart !== c.startTimeMs || newDur !== c.durationMs) {
            state.animations[i] = { ...c, startTimeMs: newStart, durationMs: newDur };
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

    requestSingleFrameExport: (width) =>
      set((state) => {
        state.singleFrameExportId += 1;
        state.singleFrameExportWidth = width;
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
        state.groupEditingId = null;
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

    moveMultipleSceneObjectsSilent: (moves) =>
      set((state) => {
        if (moves.length === 0) return;
        const unlockedMoves = moves.filter((m) => {
          const obj = state.objects.find((o) => o.id === m.id);
          return obj && !obj.locked;
        });
        if (unlockedMoves.length === 0) return;
        const moveMap = new Map(unlockedMoves.map((m) => [m.id, m]));
        state.objects = state.objects.map((o) => {
          const m = moveMap.get(o.id);
          if (!m) return o;
          return { ...o, x: m.x, y: m.y };
        });
      }),

    batchUpdateSceneObjects: (updates) =>
      set((state) => {
        if (updates.length === 0) return;
        const patchMap = new Map(updates.map((u) => [u.id, u.patch]));
        const hasChanges = state.objects.some((o) => patchMap.has(o.id) && !o.locked);
        if (!hasChanges) return;
        pushHistory(state);
        state.objects = state.objects.map((o) => {
          const patch = patchMap.get(o.id);
          if (!patch || o.locked) return o;
          return { ...o, ...patch };
        });
      }),

    batchUpdateSceneObjectsSilent: (updates) =>
      set((state) => {
        if (updates.length === 0) return;
        const patchMap = new Map(updates.map((u) => [u.id, u.patch]));
        state.objects = state.objects.map((o) => {
          const patch = patchMap.get(o.id);
          if (!patch || o.locked) return o;
          return { ...o, ...patch };
        });
      }),

    duplicateObject: (id) =>
      set((state) => {
        const src = state.objects.find((o) => o.id === id);
        if (!src) return;
        pushHistory(state);
        const newObj: SceneObject = {
          ...cloneDeep(src),
          id: crypto.randomUUID(),
          x: src.x + 20,
          y: src.y + 20,
          animationIds: [],
          groupId: undefined,
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
        pushHistory(state);
        state.canvasWidth = Math.max(100, Math.round(width));
        state.canvasHeight = Math.max(100, Math.round(height));
      }),

    setCanvasBgColor: (color) =>
      set((state) => {
        pushHistory(state);
        state.canvasBgColor = color;
      }),

    setCanvasBgColorSilent: (color) =>
      set((state) => {
        state.canvasBgColor = color;
      }),

    loadSnapshot: (snapshot) =>
      set((state) => {
        state.objects = snapshot.objects;
        // Migrate legacy stateChange clips: { toStateKey } → { steps: [{ atMs, toStateKey }] }
        state.animations = snapshot.animations.map((clip) => {
          if (clip.type !== 'stateChange') return clip;
          const p = clip.payload as Record<string, unknown>;
          if (Array.isArray(p.steps)) return clip;
          return { ...clip, payload: { steps: [{ atMs: clip.startTimeMs, toStateKey: (p.toStateKey as string) ?? '' }] } };
        }) as AnimationClip[];
        state.globalDurationMs = snapshot.globalDurationMs;
        state.canvasWidth = snapshot.canvasWidth ?? 1280;
        state.canvasHeight = snapshot.canvasHeight ?? 720;
        state.canvasBgColor = snapshot.canvasBgColor ?? '#ffffff';
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
        state.canvasWidth = snapshot.canvasWidth;
        state.canvasHeight = snapshot.canvasHeight;
        state.canvasBgColor = snapshot.canvasBgColor;
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
        state.canvasWidth = snapshot.canvasWidth;
        state.canvasHeight = snapshot.canvasHeight;
        state.canvasBgColor = snapshot.canvasBgColor;
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
