import { create } from 'zustand';

import { useChatStore } from './chatStore';

export const APP_VIEW_ORDER = ['today', 'tasks', 'inbox', 'notes'] as const;

export type AppView = (typeof APP_VIEW_ORDER)[number] | 'settings';
export type ChatOverlayState = 'peek' | 'open';
export type ChatView = 'threads' | 'conversation';

type AppStore = {
  activeView: AppView;
  manualNavigationVersion: number;
  chatOverlayState: ChatOverlayState;
  chatView: ChatView;
  unreadProactive: boolean;
  newTaskTrigger: number;
  aiEnabled: boolean;
  setView: (view: AppView) => void;
  setViewFromAssistant: (view: AppView) => void;
  openChatOverlay: () => void;
  peekChatOverlay: () => void;
  toggleChatOverlay: () => void;
  closeChatOverlayLayer: () => void;
  setChatView: (view: ChatView) => void;
  setUnreadProactive: (value: boolean) => void;
  triggerNewTask: () => void;
  setAiEnabled: (enabled: boolean) => void;
};

export const useAppStore = create<AppStore>((set) => ({
  activeView: 'today',
  manualNavigationVersion: 0,
  chatOverlayState: 'peek',
  chatView: 'threads',
  unreadProactive: false,
  newTaskTrigger: 0,
  aiEnabled: true,
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
  openChatOverlay: () => {
    const hasActiveConversation = useChatStore.getState().activeConversationId !== null;
    set({
      chatOverlayState: 'open',
      unreadProactive: false,
      chatView: hasActiveConversation ? 'conversation' : 'threads',
    });
  },
  peekChatOverlay: () => set({ chatOverlayState: 'peek' }),
  toggleChatOverlay: () =>
    set((state) => {
      if (state.chatOverlayState === 'open') {
        return { chatOverlayState: 'peek' as const, unreadProactive: state.unreadProactive };
      }
      const hasActiveConversation = useChatStore.getState().activeConversationId !== null;
      return {
        chatOverlayState: 'open' as const,
        unreadProactive: false,
        chatView: hasActiveConversation ? 'conversation' : 'threads',
      };
    }),
  closeChatOverlayLayer: () =>
    set((state) => {
      if (state.chatOverlayState === 'open') {
        return { chatOverlayState: 'peek' as const };
      }

      return state;
    }),
  setChatView: (view) => set({ chatView: view }),
  setUnreadProactive: (value) => set({ unreadProactive: value }),
  triggerNewTask: () =>
    set((state) => ({ newTaskTrigger: state.newTaskTrigger + 1 })),
  setAiEnabled: (enabled) => set({ aiEnabled: enabled }),
}));

export const selectActiveView = (state: AppStore) => state.activeView;
export const selectManualNavigationVersion = (state: AppStore) =>
  state.manualNavigationVersion;
export const selectChatOverlayState = (state: AppStore) => state.chatOverlayState;
export const selectIsChatOverlayOpen = (state: AppStore) =>
  state.chatOverlayState === 'open';
export const selectChatView = (state: AppStore) => state.chatView;
export const selectUnreadProactive = (state: AppStore) =>
  state.unreadProactive;
export const selectNewTaskTrigger = (state: AppStore) =>
  state.newTaskTrigger;
export const selectAiEnabled = (state: AppStore) => state.aiEnabled;
