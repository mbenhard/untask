import { create } from 'zustand';

export const APP_VIEW_ORDER = ['today', 'projects', 'inbox'] as const;

export type AppView = (typeof APP_VIEW_ORDER)[number];

type AppStore = {
  activeView: AppView;
  previousViewIndex: number;
  isChatMode: boolean;
  isMemorySettingsOpen: boolean;
  newTaskTrigger: number;
  setView: (view: AppView) => void;
  enterChatMode: () => void;
  exitChatMode: () => void;
  openMemorySettings: () => void;
  closeMemorySettings: () => void;
  toggleMemorySettings: () => void;
  triggerNewTask: () => void;
};

const getViewIndex = (view: AppView): number => APP_VIEW_ORDER.indexOf(view);

export const useAppStore = create<AppStore>((set) => ({
  activeView: 'today',
  previousViewIndex: getViewIndex('today'),
  isChatMode: false,
  isMemorySettingsOpen: false,
  newTaskTrigger: 0,
  setView: (view) =>
    set((state) => {
      if (state.activeView === view) {
        return state;
      }

      return {
        activeView: view,
        previousViewIndex: getViewIndex(state.activeView),
      };
    }),
  enterChatMode: () => set({ isChatMode: true }),
  exitChatMode: () => set({ isChatMode: false }),
  openMemorySettings: () => set({ isMemorySettingsOpen: true }),
  closeMemorySettings: () => set({ isMemorySettingsOpen: false }),
  toggleMemorySettings: () =>
    set((state) => ({ isMemorySettingsOpen: !state.isMemorySettingsOpen })),
  triggerNewTask: () =>
    set((state) => ({ newTaskTrigger: state.newTaskTrigger + 1 })),
}));

export const selectActiveView = (state: AppStore) => state.activeView;
export const selectPreviousViewIndex = (state: AppStore) =>
  state.previousViewIndex;
export const selectIsChatMode = (state: AppStore) => state.isChatMode;
export const selectIsMemorySettingsOpen = (state: AppStore) =>
  state.isMemorySettingsOpen;
export const selectNewTaskTrigger = (state: AppStore) =>
  state.newTaskTrigger;
