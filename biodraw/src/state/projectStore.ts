import { create } from 'zustand';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface ProjectState {
  currentProjectId: string | null;
  saveStatus: SaveStatus;
  lastSavedAt: Date | null;
  setCurrentProjectId: (id: string | null) => void;
  setSaveStatus: (status: SaveStatus) => void;
  setLastSavedAt: (date: Date) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  currentProjectId: null,
  saveStatus: 'idle',
  lastSavedAt: null,
  setCurrentProjectId: (id) => set({ currentProjectId: id }),
  setSaveStatus: (status) => set({ saveStatus: status }),
  setLastSavedAt: (date) => set({ lastSavedAt: date }),
}));
