import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { AnimationClip, SceneObject } from '../types';

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

interface EditorState {
  objects: SceneObject[];
  animations: AnimationClip[];
  globalDurationMs: number;
  playbackStatus: PlaybackStatus;
  currentTimeMs: number;
  playbackRate: number;
  playbackLoopEnabled: boolean;
  playbackRegionLoopEnabled: boolean;
  playbackLoopInMs: number | null;
  playbackLoopOutMs: number | null;
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
  setIsRatioLocked: (locked: boolean) => void;
  toggleObjectLock: (id: string) => void;
  groupObjects: (ids: string[]) => void;
  ungroupObjects: (groupId: string) => void;
  selectSceneObjects: (ids: string[]) => void;

  addAnimationClip: (clip: AnimationClip) => void;
  updateAnimationClip: (id: string, updates: Partial<AnimationClip>) => void;
  removeAnimationClip: (id: string) => void;
  copyAnimationClipsToObjects: (sourceObjectId: string, targetObjectIds: string[]) => void;
  setGlobalDurationMs: (durationMs: number) => void;
  setCurrentTimeMs: (timeMs: number) => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
  advancePlayback: (deltaMs: number) => void;
  setPlaybackRate: (rate: number) => void;
  setPlaybackLoopEnabled: (enabled: boolean) => void;
  setPlaybackRegionLoopEnabled: (enabled: boolean) => void;
  setPlaybackLoopInMs: (timeMs: number | null) => void;
  setPlaybackLoopOutMs: (timeMs: number | null) => void;
  clearPlaybackLoopRegion: () => void;
  stepPlaybackFrame: (direction: 1 | -1) => void;
  exportCancelCount: number;
  singleFrameExportId: number;
  cancelExport: () => void;
  requestSingleFrameExport: () => void;

  requestSequenceExport: (options: SequenceExportOptions) => void;
  setSequenceExportStatus: (status: SequenceExportStatus, message?: string) => void;
  requestVideoExport: (options: VideoExportOptions) => void;
  setVideoExportStatus: (status: VideoExportStatus, message?: string) => void;

  undo: () => void;
  redo: () => void;

  expandedAnimationClipId: string | null;
  setExpandedAnimationClipId: (id: string | null) => void;
  patchAnimationClipSilent: (id: string, updates: Partial<AnimationClip>) => void;

  hasUnsavedChanges: boolean;
  currentFileName: string | null;
  markSaved: (fileName?: string) => void;
  resetScene: () => void;
  setCurrentFileName: (name: string | null) => void;
}

const cloneDeep = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const toSnapshot = (state: EditorState): EditorSnapshot => ({
  objects: cloneDeep(state.objects),
  animations: cloneDeep(state.animations),
  globalDurationMs: state.globalDurationMs,
});

const clampTime = (timeMs: number, durationMs: number) =>
  Math.max(0, Math.min(durationMs, timeMs));

const clampPlaybackRate = (rate: number) => Math.max(0.25, Math.min(2, rate));

const resolveLoopRegion = (state: {
  playbackRegionLoopEnabled: boolean;
  playbackLoopInMs: number | null;
  playbackLoopOutMs: number | null;
  globalDurationMs: number;
}) => {
  if (!state.playbackRegionLoopEnabled) return null;
  if (state.playbackLoopInMs === null || state.playbackLoopOutMs === null) return null;
  const start = clampTime(state.playbackLoopInMs, state.globalDurationMs);
  const end = clampTime(state.playbackLoopOutMs, state.globalDurationMs);
  if (end <= start) return null;
  return { start, end };
};

function pushHistory(state: EditorState) {
  state.past.push(toSnapshot(state));
  if (state.past.length > MAX_HISTORY) state.past.shift();
  state.future = [];
  state.hasUnsavedChanges = true;
}

export const useEditorStore = create<EditorState>()(
  immer((set) => ({
    objects: [],
    animations: [],
    globalDurationMs: 10000,
    playbackStatus: 'stopped',
    currentTimeMs: 0,
    playbackRate: 1,
    playbackLoopEnabled: false,
    playbackRegionLoopEnabled: false,
    playbackLoopInMs: null,
    playbackLoopOutMs: null,
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
    isRatioLocked: true,
    canvasWidth: 1280,
    canvasHeight: 720,
    canvasBgColor: '#ffffff',
    expandedAnimationClipId: null,
    hasUnsavedChanges: false,
    currentFileName: null,

    addSceneObject: (obj) =>
      set((state) => {
        pushHistory(state);
        state.objects.push(obj);
        state.selectedIds = [obj.id];
      }),

    removeSceneObject: (id) =>
      set((state) => {
        pushHistory(state);
        state.objects = state.objects.filter((o) => o.id !== id);
        state.selectedIds = state.selectedIds.filter((sid) => sid !== id);
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
            };
            state.animations.push(newClip);
            targetObj.animationIds = Array.from(
              new Set([...(targetObj.animationIds || []), newClip.id]),
            );
          }
        }
      }),

    setGlobalDurationMs: (durationMs) =>
      set((state) => {
        pushHistory(state);
        state.globalDurationMs = Math.max(1000, Math.round(durationMs));
        state.currentTimeMs = clampTime(state.currentTimeMs, state.globalDurationMs);
        if (state.playbackLoopInMs !== null) {
          state.playbackLoopInMs = clampTime(state.playbackLoopInMs, state.globalDurationMs);
        }
        if (state.playbackLoopOutMs !== null) {
          state.playbackLoopOutMs = clampTime(state.playbackLoopOutMs, state.globalDurationMs);
        }
      }),

    setCurrentTimeMs: (timeMs) =>
      set((state) => {
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
        const loopRegion = resolveLoopRegion(state);
        if (loopRegion) {
          if (state.currentTimeMs < loopRegion.start || state.currentTimeMs >= loopRegion.end) {
            state.currentTimeMs = loopRegion.start;
          }
          state.playbackStatus = 'playing';
          return;
        }
        if (state.currentTimeMs >= state.globalDurationMs) {
          state.currentTimeMs = 0;
        }
        state.playbackStatus = 'playing';
      }),

    pause: () =>
      set((state) => {
        if (state.playbackStatus !== 'playing') return;
        state.playbackStatus = 'paused';
      }),

    stop: () =>
      set((state) => {
        state.playbackStatus = 'stopped';
        state.currentTimeMs = 0;
      }),

    advancePlayback: (deltaMs) =>
      set((state) => {
        if (state.playbackStatus !== 'playing') return;
        const delta = Math.max(0, deltaMs) * clampPlaybackRate(state.playbackRate);
        if (delta <= 0) return;

        const loopRegion = resolveLoopRegion(state);
        if (loopRegion) {
          const range = Math.max(1, loopRegion.end - loopRegion.start);
          const baseTime =
            state.currentTimeMs < loopRegion.start || state.currentTimeMs > loopRegion.end
              ? loopRegion.start
              : state.currentTimeMs;
          const nextTime = baseTime + delta;
          if (nextTime > loopRegion.end) {
            state.currentTimeMs = loopRegion.start + ((nextTime - loopRegion.start) % range);
          } else {
            state.currentTimeMs = nextTime;
          }
          return;
        }

        const nextTime = state.currentTimeMs + delta;
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

    setPlaybackRegionLoopEnabled: (enabled) =>
      set((state) => {
        state.playbackRegionLoopEnabled = enabled;
      }),

    setPlaybackLoopInMs: (timeMs) =>
      set((state) => {
        state.playbackLoopInMs =
          timeMs === null ? null : clampTime(Math.round(timeMs), state.globalDurationMs);
      }),

    setPlaybackLoopOutMs: (timeMs) =>
      set((state) => {
        state.playbackLoopOutMs =
          timeMs === null ? null : clampTime(Math.round(timeMs), state.globalDurationMs);
      }),

    clearPlaybackLoopRegion: () =>
      set((state) => {
        state.playbackLoopInMs = null;
        state.playbackLoopOutMs = null;
      }),

    stepPlaybackFrame: (direction) =>
      set((state) => {
        const frameMs = 1000 / 60;
        const delta = direction >= 0 ? frameMs : -frameMs;
        const loopRegion = resolveLoopRegion(state);
        state.playbackStatus = 'paused';
        if (loopRegion) {
          const nextTime = clampTime(state.currentTimeMs + delta, state.globalDurationMs);
          state.currentTimeMs = Math.max(loopRegion.start, Math.min(loopRegion.end, nextTime));
          if (state.currentTimeMs === 0) {
            state.playbackStatus = 'stopped';
          }
          return;
        }
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
        state.currentTimeMs = 0;
        state.playbackStatus = 'stopped';
        state.past = [];
        state.future = [];
        state.hasUnsavedChanges = false;
        state.currentFileName = null;
      }),

    setCurrentFileName: (name) =>
      set((state) => {
        state.currentFileName = name;
      }),

    setExpandedAnimationClipId: (id) =>
      set((state) => {
        state.expandedAnimationClipId = id;
      }),

    patchAnimationClipSilent: (id, updates) =>
      set((state) => {
        const idx = state.animations.findIndex((a) => a.id === id);
        if (idx !== -1) {
          state.animations[idx] = { ...state.animations[idx], ...updates } as AnimationClip;
        }
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
      }),
  })),
);
