import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SelectedProject {
  projectId: string;
  projectName: string;
  tempoId?: string;
  jiraProjectKey?: string;
}

interface ActivePeriod {
  from: string;  // YYYY-MM-DD
  to: string;    // YYYY-MM-DD
}

interface AppState {
  selectedProject: SelectedProject | null;
  activePeriod: ActivePeriod;
  credentialsConfigured: boolean;
  activeTeamId: number | null;
  setSelectedProject: (p: SelectedProject | null) => void;
  setActivePeriod: (p: ActivePeriod) => void;
  setCredentialsConfigured: (v: boolean) => void;
  setActiveTeamId: (id: number | null) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      selectedProject: null,
      activePeriod: {
        from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
        to: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0],
      },
      credentialsConfigured: false,
      activeTeamId: null,
      setSelectedProject: (p) => set({ selectedProject: p }),
      setActivePeriod: (p) => set({ activePeriod: p }),
      setCredentialsConfigured: (v) => set({ credentialsConfigured: v }),
      setActiveTeamId: (id) => set({ activeTeamId: id }),
    }),
    { name: 'tempo-influencer-store' }
  )
);
