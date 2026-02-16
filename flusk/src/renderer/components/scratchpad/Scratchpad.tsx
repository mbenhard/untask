import { useMemo } from 'react';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import MDEditor from '@uiw/react-md-editor';
import { Sparkles, X } from 'lucide-react';

import { useTheme } from '../providers/ThemeProvider';
import { Button } from '../ui/button';
import {
  selectScratchpadContent,
  selectScratchpadError,
  selectScratchpadIsDirty,
  selectScratchpadIsLoading,
  selectScratchpadIsOpen,
  selectScratchpadIsSaving,
  selectScratchpadIsSendingToAI,
  useScratchpadStore,
} from '../../stores/scratchpadStore';

import '@uiw/react-md-editor/markdown-editor.css';

export const Scratchpad = () => {
  const { resolvedTheme } = useTheme();
  const isOpen = useScratchpadStore(selectScratchpadIsOpen);
  const content = useScratchpadStore(selectScratchpadContent);
  const isDirty = useScratchpadStore(selectScratchpadIsDirty);
  const isLoading = useScratchpadStore(selectScratchpadIsLoading);
  const isSaving = useScratchpadStore(selectScratchpadIsSaving);
  const isSendingToAI = useScratchpadStore(selectScratchpadIsSendingToAI);
  const error = useScratchpadStore(selectScratchpadError);
  const setContent = useScratchpadStore((state) => state.setContent);
  const close = useScratchpadStore((state) => state.close);
  const save = useScratchpadStore((state) => state.save);
  const sendToAI = useScratchpadStore((state) => state.sendToAI);
  const prefersReducedMotion = useReducedMotion();

  const panelTransition = useMemo(
    () =>
      prefersReducedMotion
        ? { duration: 0.12, ease: 'easeOut' as const }
        : { duration: 0.2, ease: 'easeOut' as const },
    [prefersReducedMotion],
  );

  const panelVariants = prefersReducedMotion
    ? {
        hidden: { opacity: 0 },
        visible: { opacity: 1 },
        exit: { opacity: 0 },
      }
    : {
        hidden: { opacity: 0, y: '100%' },
        visible: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: '100%' },
      };

  return (
    <AnimatePresence>
      {isOpen ? (
        <section
          className="no-drag absolute inset-0 z-40 flex items-end"
          aria-label="Scratchpad panel"
          role="dialog"
          aria-modal="true"
        >
          <motion.button
            type="button"
            aria-label="Close scratchpad"
            className="absolute inset-0 bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={panelTransition}
            onClick={() => {
              void close();
            }}
          />

          <motion.div
            className="relative flex h-[65vh] w-full flex-col rounded-t-xl border-t border-border bg-card shadow-2xl"
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={panelVariants}
            transition={panelTransition}
          >
            <header className="flex items-center justify-between border-b border-border px-4 py-2">
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground">
                  Scratchpad
                </h2>
                <span className="text-[11px] text-muted-foreground">
                  {isDirty ? 'Unsaved' : isSaving ? 'Saving...' : 'Saved'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void sendToAI();
                  }}
                  disabled={!content.trim() || isSendingToAI}
                >
                  <Sparkles size={14} className="mr-1" />
                  {isSendingToAI ? 'Sending...' : 'Send to AI'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void save();
                  }}
                  disabled={!isDirty || isSaving}
                >
                  Save
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    void close();
                  }}
                  aria-label="Close scratchpad"
                >
                  <X size={16} />
                </Button>
              </div>
            </header>

            {error ? (
              <p className="mx-4 mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive-foreground">
                {error}
              </p>
            ) : null}

            <div className="min-h-0 flex-1 p-4" data-color-mode={resolvedTheme}>
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Loading scratchpad...</p>
              ) : (
                <MDEditor
                  value={content}
                  onChange={(value) => setContent(value ?? '')}
                  preview="edit"
                  height={Math.round(window.innerHeight * 0.65) - 90}
                  textareaProps={{
                    placeholder: 'Capture notes, ideas, and rough task drafts here...',
                    onBlur: () => {
                      void save();
                    },
                  }}
                />
              )}
            </div>
          </motion.div>
        </section>
      ) : null}
    </AnimatePresence>
  );
};
