import { create } from 'zustand';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface ProjectState {
  currentProjectId: string | null;
  projectVersion: number;
  saveStatus: SaveStatus;
  lastSavedAt: Date | null;
  setCurrentProjectId: (id: string | null) => void;
  setProjectVersion: (v: number) => void;
  setSaveStatus: (status: SaveStatus) => void;
  setLastSavedAt: (date: Date) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  currentProjectId: null,
  projectVersion: 0,
  saveStatus: 'idle',
  lastSavedAt: null,
  setCurrentProjectId: (id) => set({ currentProjectId: id }),
  setProjectVersion: (v) => set({ projectVersion: v }),
  setSaveStatus: (status) => set({ saveStatus: status }),
  setLastSavedAt: (date) => set({ lastSavedAt: date }),
}));
