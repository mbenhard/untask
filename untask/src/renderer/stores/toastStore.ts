import { create } from 'zustand';

export type ToastState = {
  id: number;
  label: string;
  onUndo?: () => void | Promise<void>;
};

type ToastStore = {
  toast: ToastState | null;
  showToast: (label: string, onUndo?: () => void | Promise<void>) => void;
  clearToast: () => void;
};

let toastIdCounter = 0;

export const useToastStore = create<ToastStore>((set) => ({
  toast: null,
  showToast: (label, onUndo) => {
    toastIdCounter += 1;
    set({
      toast: {
        id: toastIdCounter,
        label,
        onUndo,
      },
    });
  },
  clearToast: () => {
    set({ toast: null });
  },
}));
