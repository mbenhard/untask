import { useCallback, useEffect, useState } from 'react';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Sparkles, X } from 'lucide-react';

import type { ChatLiveThoughtResult } from '../../../types/ipc';
import { useAppStore } from '../../stores/appStore';
import { useChatStore } from '../../stores/chatStore';

type LiveThoughtProps = {
  refreshKey?: string;
};

export const LiveThought = ({ refreshKey }: LiveThoughtProps) => {
  const [isVisible, setIsVisible] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [thought, setThought] = useState<ChatLiveThoughtResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sendMessage = useChatStore((state) => state.sendMessage);
  const openChatOverlay = useAppStore((state) => state.openChatOverlay);
  const prefersReducedMotion = useReducedMotion();

  const loadLiveThought = useCallback(async () => {
    if (!window.flusk) {
      setError('Flusk API is unavailable.');
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const next = await window.flusk.chat.getLiveThought();
      setThought(next);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load live thought.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    setIsVisible(true);
    void loadLiveThought();
  }, [loadLiveThought, refreshKey]);

  if (!isVisible || isLoading || error || !thought) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: prefersReducedMotion ? 0.05 : 0.15, ease: 'easeOut' }}
        className="flex items-center gap-1"
        aria-live="polite"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <button
          type="button"
          onClick={() => {
            if (!thought.suggestedPrompt) {
              return;
            }

            openChatOverlay();
            void sendMessage(thought.suggestedPrompt);
          }}
          className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-muted-foreground/60 transition-colors hover:bg-accent/50 hover:text-foreground"
        >
          <Sparkles className="size-3 shrink-0" />
          <AnimatePresence mode="wait" initial={false}>
            {isHovered ? (
              <motion.span
                key="expanded"
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: prefersReducedMotion ? 0.05 : 0.2, ease: 'easeOut' }}
                className="overflow-hidden whitespace-nowrap text-[11px] text-muted-foreground/50"
              >
                {thought.thought}
                <span className="mx-1.5 text-border">·</span>
              </motion.span>
            ) : null}
          </AnimatePresence>
          <span className="shrink-0 text-[11px]">{thought.actionLabel}</span>
        </button>

        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => setIsVisible(false)}
          className="flex h-8 w-6 items-center justify-center text-muted-foreground/30 transition-colors hover:text-muted-foreground"
        >
          <X className="size-2.5" />
        </button>
      </motion.div>
    </AnimatePresence>
  );
};
