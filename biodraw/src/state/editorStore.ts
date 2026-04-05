import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { SceneObject } from '../types';

interface EditorState {
  objects: SceneObject[];
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
}

export const useEditorStore = create<EditorState>()(
  immer((set) => ({
    objects: [],
    selectedIds: [],
    isRatioLocked: true,
    
    addSceneObject: (obj) => set((state) => {
      state.objects.push(obj);
      // 新拖入的物体会被立即选中
      state.selectedIds = [obj.id];
    }),

    removeSceneObject: (id) => set((state) => {
      state.objects = state.objects.filter(o => o.id !== id);
      state.selectedIds = state.selectedIds.filter(sid => sid !== id);
    }),
    
    updateSceneObject: (id, updates) => set((state) => {
      const idx = state.objects.findIndex((o) => o.id === id);
      if (idx !== -1) {
        state.objects[idx] = { ...state.objects[idx], ...updates };
      }
    }),
    
    moveObjectForward: (id) => set((state) => {
      const idx = state.objects.findIndex((o) => o.id === id);
      if (idx !== -1 && idx < state.objects.length - 1) {
        const temp = state.objects[idx];
        state.objects[idx] = state.objects[idx + 1];
        state.objects[idx + 1] = temp;
      }
    }),
    
    moveObjectBackward: (id) => set((state) => {
      const idx = state.objects.findIndex((o) => o.id === id);
      if (idx > 0) {
        const temp = state.objects[idx];
        state.objects[idx] = state.objects[idx - 1];
        state.objects[idx - 1] = temp;
      }
    }),
    
    moveObjectToFront: (id) => set((state) => {
      const idx = state.objects.findIndex((o) => o.id === id);
      if (idx !== -1 && idx < state.objects.length - 1) {
        const [obj] = state.objects.splice(idx, 1);
        state.objects.push(obj);
      }
    }),
    
    moveObjectToBack: (id) => set((state) => {
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
  }))
);
