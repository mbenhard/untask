import { create } from 'zustand';

export const APP_VIEW_ORDER = ['today', 'projects', 'inbox'] as const;

export type AppView = (typeof APP_VIEW_ORDER)[number];

type AppStore = {
  activeView: AppView;
  previousViewIndex: number;
  isChatMode: boolean;
  setView: (view: AppView) => void;
  enterChatMode: () => void;
  exitChatMode: () => void;
};

const getViewIndex = (view: AppView): number => APP_VIEW_ORDER.indexOf(view);

export const useAppStore = create<AppStore>((set) => ({
  activeView: 'today',
  previousViewIndex: getViewIndex('today'),
  isChatMode: false,
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
}));

export const selectActiveView = (state: AppStore) => state.activeView;
export const selectPreviousViewIndex = (state: AppStore) =>
  state.previousViewIndex;
export const selectIsChatMode = (state: AppStore) => state.isChatMode;
