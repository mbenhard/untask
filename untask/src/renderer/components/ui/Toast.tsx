import { useEffect, useRef } from 'react';

import { AnimatePresence, motion } from 'framer-motion';

import { cn } from '../../lib/utils';
import { useToastStore } from '../../stores/toastStore';

const DISMISS_MS = 3000;
const UNDONE_DISPLAY_MS = 1500;

export const ToastContainer = () => {
  const toast = useToastStore((s) => s.toast);
  const clearToast = useToastStore((s) => s.clearToast);
  const undoing = useToastStore((s) => s.isUndoing);
  const markUndoing = useToastStore((s) => s.markUndoing);
  const dismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!toast) {
      return;
    }

    if (dismissTimeoutRef.current) {
      clearTimeout(dismissTimeoutRef.current);
    }

    const delay = undoing ? UNDONE_DISPLAY_MS : DISMISS_MS;
    dismissTimeoutRef.current = setTimeout(() => {
      clearToast();
    }, delay);

    return () => {
      if (dismissTimeoutRef.current) {
        clearTimeout(dismissTimeoutRef.current);
      }
    };
  }, [toast?.id, undoing, clearToast]);

  if (!toast) return null;

  const handleUndo = () => {
    if (!toast.onUndo || undoing) return;
    markUndoing();
    void toast.onUndo();
  };

  const showUndo = toast.onUndo && !undoing;

  return (
    <AnimatePresence>
      <motion.div
        key={toast.id}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className={cn(
          'fixed bottom-3 left-1/2 z-50 -translate-x-1/2',
          'flex items-center gap-1.5',
          'rounded-lg border border-border/60 bg-card/90 backdrop-blur-sm shadow-md',
          'px-2.5 py-1.5',
        )}
      >
        <span className="text-[11px] text-muted-foreground">
          {undoing ? 'Undone' : toast.label}
        </span>
        {showUndo && (
          <>
            <span className="text-border">·</span>
            <button
              type="button"
              onClick={handleUndo}
              className="text-[11px] font-medium text-foreground hover:underline"
            >
              Undo
            </button>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
};
