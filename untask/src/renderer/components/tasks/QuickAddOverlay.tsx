import { useCallback, useEffect, useRef, useState } from 'react';

import { useTaskStore } from '../../stores/taskStore';
import { useAppStore } from '../../stores/appStore';

export const QuickAddOverlay = () => {
  const closeQuickAdd = useAppStore((state) => state.closeQuickAdd);
  const quickAddText = useAppStore((state) => state.quickAddText);
  const createTask = useTaskStore((state) => state.createTask);

  const inputRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState(quickAddText);
  const [isCreating, setIsCreating] = useState(false);

  // Auto-focus on mount
  useEffect(() => {
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      // Select pre-filled text so user can type over it
      if (quickAddText) {
        inputRef.current?.select();
      }
    });
  }, [quickAddText]);

  // Click outside to dismiss
  useEffect(() => {
    const onPointerDown = (event: PointerEvent): void => {
      if (!(event.target instanceof Node)) return;
      if (cardRef.current?.contains(event.target)) return;
      closeQuickAdd();
    };

    window.addEventListener('pointerdown', onPointerDown, true);
    return () => window.removeEventListener('pointerdown', onPointerDown, true);
  }, [closeQuickAdd]);

  const handleSubmit = useCallback(async () => {
    const normalized = title.trim();
    if (normalized.length === 0 || isCreating) return;

    setIsCreating(true);
    const created = await createTask({
      title: normalized,
      status: 'inbox',
      priority: 'none',
    });
    setIsCreating(false);

    if (!created) return;

    closeQuickAdd();
  }, [createTask, isCreating, title]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-background/40 pt-[18vh] backdrop-blur-[2px]">
      <div
        ref={cardRef}
        className="w-full max-w-sm rounded-xl border border-border/70 bg-card shadow-[0_16px_40px_-12px_rgba(0,0,0,0.4)]"
      >
        <div className="flex items-center px-3 py-2.5">
          <input
            ref={inputRef}
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void handleSubmit();
                return;
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                closeQuickAdd();
              }
            }}
            placeholder={isCreating ? 'Adding...' : 'Add to inbox...'}
            disabled={isCreating}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/40"
            aria-label="Quick add task"
          />
        </div>
        <div className="border-t border-border/30 px-3 py-1.5">
          <span className="text-[10px] text-muted-foreground/40">
            Enter to add &middot; Esc to close
          </span>
        </div>
      </div>
    </div>
  );
};
