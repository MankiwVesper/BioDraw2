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
  selectObject: (id: string | null) => void;
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
    
    updateSceneObject: (id, updates) => set((state) => {
      const idx = state.objects.findIndex((o) => o.id === id);
      if (idx !== -1) {
        state.objects[idx] = { ...state.objects[idx], ...updates };
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
