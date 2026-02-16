import { useCallback, useEffect, useState } from 'react';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Sparkles, X } from 'lucide-react';

import type { ChatLiveThoughtResult } from '../../../types/ipc';
import { useChatStore } from '../../stores/chatStore';
import { Button } from '../ui/button';

type LiveThoughtProps = {
  refreshKey?: string;
};

export const LiveThought = ({ refreshKey }: LiveThoughtProps) => {
  const [isVisible, setIsVisible] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [thought, setThought] = useState<ChatLiveThoughtResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sendMessage = useChatStore((state) => state.sendMessage);
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

  return (
    <AnimatePresence>
      {isVisible ? (
        <motion.section
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
          transition={{ duration: prefersReducedMotion ? 0.05 : 0.15, ease: 'easeOut' }}
          className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2"
          aria-live="polite"
        >
          <Sparkles className="size-4 text-muted-foreground" />

          <p className="flex-1 text-[13px] text-muted-foreground">
            {isLoading
              ? 'Loading live thought...'
              : error
                ? 'Live thought unavailable. Use chat to get a quick focus recommendation.'
                : thought?.thought ?? 'Live thought unavailable.'}
          </p>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11px] text-muted-foreground"
            disabled={!thought || isLoading}
            onClick={() => {
              if (!thought?.suggestedPrompt) {
                return;
              }

              void sendMessage(thought.suggestedPrompt);
            }}
          >
            {thought?.actionLabel ?? 'Act'}
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground"
            aria-label="Dismiss live thought"
            onClick={() => setIsVisible(false)}
          >
            <X />
          </Button>
        </motion.section>
      ) : null}
    </AnimatePresence>
  );
};
