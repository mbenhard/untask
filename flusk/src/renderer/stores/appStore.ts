import { create } from 'zustand';

export const APP_VIEW_ORDER = ['today', 'tasks', 'inbox', 'scratchpad'] as const;

export type AppView = (typeof APP_VIEW_ORDER)[number] | 'settings';
export type ChatOverlayState = 'peek' | 'open';

type AppStore = {
  activeView: AppView;
  manualNavigationVersion: number;
  chatOverlayState: ChatOverlayState;
  unreadProactive: boolean;
  newTaskTrigger: number;
  setView: (view: AppView) => void;
  setViewFromAssistant: (view: AppView) => void;
  openChatOverlay: () => void;
  peekChatOverlay: () => void;
  toggleChatOverlay: () => void;
  closeChatOverlayLayer: () => void;
  setUnreadProactive: (value: boolean) => void;
  triggerNewTask: () => void;
};

export const useAppStore = create<AppStore>((set) => ({
  activeView: 'today',
  manualNavigationVersion: 0,
  chatOverlayState: 'peek',
  unreadProactive: false,
  newTaskTrigger: 0,
  setView: (view) =>
    set((state) => {
      if (state.activeView === view) {
        return state;
      }

      return {
        activeView: view,
        manualNavigationVersion: state.manualNavigationVersion + 1,
      };
    }),
  setViewFromAssistant: (view) =>
    set((state) => {
      if (state.activeView === view) {
        return state;
      }

      return {
        activeView: view,
      };
    }),
  openChatOverlay: () => set({ chatOverlayState: 'open', unreadProactive: false }),
  peekChatOverlay: () => set({ chatOverlayState: 'peek' }),
  toggleChatOverlay: () =>
    set((state) => ({
      chatOverlayState: state.chatOverlayState === 'open' ? 'peek' : 'open',
      unreadProactive: state.chatOverlayState === 'open' ? state.unreadProactive : false,
    })),
  closeChatOverlayLayer: () =>
    set((state) => {
      if (state.chatOverlayState === 'open') {
        return { chatOverlayState: 'peek' as const };
      }

      return state;
    }),
  setUnreadProactive: (value) => set({ unreadProactive: value }),
  triggerNewTask: () =>
    set((state) => ({ newTaskTrigger: state.newTaskTrigger + 1 })),
}));

export const selectActiveView = (state: AppStore) => state.activeView;
export const selectManualNavigationVersion = (state: AppStore) =>
  state.manualNavigationVersion;
export const selectChatOverlayState = (state: AppStore) => state.chatOverlayState;
export const selectIsChatOverlayOpen = (state: AppStore) =>
  state.chatOverlayState === 'open';
export const selectUnreadProactive = (state: AppStore) =>
  state.unreadProactive;
export const selectNewTaskTrigger = (state: AppStore) =>
  state.newTaskTrigger;
