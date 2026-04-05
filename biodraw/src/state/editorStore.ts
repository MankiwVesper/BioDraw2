import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { SceneObject } from '../types';

const MAX_HISTORY = 50;

interface EditorState {
  objects: SceneObject[];
  past: SceneObject[][];    // 历史快照栈（undo）
  future: SceneObject[][];  // 前进快照栈（redo）
  selectedIds: string[];
  isRatioLocked: boolean;
  
  // Actions
  addSceneObject: (obj: SceneObject) => void;
  updateSceneObject: (id: string, updates: Partial<SceneObject>) => void;
  removeSceneObject: (id: string) => void;
  selectObject: (id: string | null) => void;
  moveObjectForward: (id: string) => void;
  moveObjectBackward: (id: string) => void;
  moveObjectToFront: (id: string) => void;
  moveObjectToBack: (id: string) => void;
  setIsRatioLocked: (locked: boolean) => void;
  undo: () => void;
  redo: () => void;
}

// 将当前 objects 压入历史栈，并清空 future（封装复用）
function pushHistory(state: EditorState) {
  state.past.push(JSON.parse(JSON.stringify(state.objects)));
  if (state.past.length > MAX_HISTORY) state.past.shift();
  state.future = [];
}

export const useEditorStore = create<EditorState>()(
  immer((set) => ({
    objects: [],
    past: [],
    future: [],
    selectedIds: [],
    isRatioLocked: true,
    
    addSceneObject: (obj) => set((state) => {
      pushHistory(state);
      state.objects.push(obj);
      state.selectedIds = [obj.id];
    }),

    removeSceneObject: (id) => set((state) => {
      pushHistory(state);
      state.objects = state.objects.filter(o => o.id !== id);
      state.selectedIds = state.selectedIds.filter(sid => sid !== id);
    }),
    
    updateSceneObject: (id, updates) => set((state) => {
      pushHistory(state);
      const idx = state.objects.findIndex((o) => o.id === id);
      if (idx !== -1) {
        state.objects[idx] = { ...state.objects[idx], ...updates };
      }
    }),
    
    moveObjectForward: (id) => set((state) => {
      pushHistory(state);
      const idx = state.objects.findIndex((o) => o.id === id);
      if (idx !== -1 && idx < state.objects.length - 1) {
        const temp = state.objects[idx];
        state.objects[idx] = state.objects[idx + 1];
        state.objects[idx + 1] = temp;
      }
    }),
    
    moveObjectBackward: (id) => set((state) => {
      pushHistory(state);
      const idx = state.objects.findIndex((o) => o.id === id);
      if (idx > 0) {
        const temp = state.objects[idx];
        state.objects[idx] = state.objects[idx - 1];
        state.objects[idx - 1] = temp;
      }
    }),
    
    moveObjectToFront: (id) => set((state) => {
      pushHistory(state);
      const idx = state.objects.findIndex((o) => o.id === id);
      if (idx !== -1 && idx < state.objects.length - 1) {
        const [obj] = state.objects.splice(idx, 1);
        state.objects.push(obj);
      }
    }),
    
    moveObjectToBack: (id) => set((state) => {
      pushHistory(state);
      const idx = state.objects.findIndex((o) => o.id === id);
      if (idx > 0) {
        const [obj] = state.objects.splice(idx, 1);
        state.objects.unshift(obj);
      }
    }),
    
    setIsRatioLocked: (locked) => set((state) => {
      state.isRatioLocked = locked;
    }),
    
    selectObject: (id) => set((state) => {
      if (id === null) {
        state.selectedIds = [];
      } else {
        state.selectedIds = [id];
      }
    }),

    undo: () => set((state) => {
      if (state.past.length === 0) return;
      state.future.push(JSON.parse(JSON.stringify(state.objects)));
      state.objects = state.past.pop()!;
      state.selectedIds = [];
    }),

    redo: () => set((state) => {
      if (state.future.length === 0) return;
      state.past.push(JSON.parse(JSON.stringify(state.objects)));
      state.objects = state.future.pop()!;
      state.selectedIds = [];
    }),
  }))
);
