import { create } from 'zustand';

export type ToastState = {
  id: number;
  label: string;
  onUndo?: () => void | Promise<void>;
};

type ToastStore = {
  toast: ToastState | null;
  isUndoing: boolean;
  showToast: (label: string, onUndo?: () => void | Promise<void>) => void;
  clearToast: () => void;
  markUndoing: () => void;
};

let toastIdCounter = 0;

export const useToastStore = create<ToastStore>((set) => ({
  toast: null,
  isUndoing: false,
  showToast: (label, onUndo) => {
    toastIdCounter += 1;
    set({
      toast: {
        id: toastIdCounter,
        label,
        onUndo,
      },
      isUndoing: false,
    });
  },
  clearToast: () => {
    set({ toast: null, isUndoing: false });
  },
  markUndoing: () => {
    set({ isUndoing: true });
  },
}));
