import { useEffect, useMemo } from 'react';

import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

import { SNAPPY, heightVariants } from '../../lib/animation';
import { getDisplayTitle as getNoteDisplayTitle } from '../../lib/noteUtils';
import {
  selectChatActiveConversationId,
  selectNoteHintDismissed,
  selectPendingNoteContext,
  useChatStore,
} from '../../stores/chat';
import { selectActiveView, useAppStore } from '../../stores/appStore';
import { useNotesStore } from '../../stores/notesStore';

type NoteContextBarProps = {
  onSuggestionClick?: (prefill: string) => void;
};

export const NoteContextBar = ({ onSuggestionClick }: NoteContextBarProps) => {
  const pendingNoteContext = useChatStore(selectPendingNoteContext);
  const noteHintDismissed = useChatStore(selectNoteHintDismissed);
  const activeConversationId = useChatStore(selectChatActiveConversationId);
  const dismissNoteHint = useChatStore((s) => s.dismissNoteHint);
  const detachPendingNoteContext = useChatStore((s) => s.detachPendingNoteContext);

  const activeView = useAppStore(selectActiveView);
  const activeNoteId = useNotesStore((s) => s.activeNoteId);
  const activeNotes = useNotesStore((s) => s.activeNotes);
  const stageCurrentNoteForChat = useNotesStore((s) => s.stageCurrentNoteForChat);

  const sendMessage = useChatStore((s) => s.sendMessage);

  const activeNoteTitle = useMemo(() => {
    if (!activeNoteId) return null;
    const note = activeNotes.find((n) => n.id === activeNoteId);
    if (!note) return null;
    const title = getNoteDisplayTitle(note.title, note.content);
    return title === 'Empty note' ? null : title;
  }, [activeNoteId, activeNotes]);

  // Auto-sync: when the user navigates to a different note while one is attached, update the attachment
  useEffect(() => {
    if (!pendingNoteContext || !activeNoteId || activeView !== 'notes') return;
    if (pendingNoteContext.noteId === activeNoteId) return;
    stageCurrentNoteForChat();
  }, [activeNoteId, activeView, pendingNoteContext, stageCurrentNoteForChat]);

  const isAttached = Boolean(pendingNoteContext);
  const showSuggestion =
    !isAttached &&
    activeView === 'notes' &&
    Boolean(activeNoteId) &&
    Boolean(activeNoteTitle) &&
    !(
      noteHintDismissed?.conversationId === activeConversationId &&
      noteHintDismissed?.noteId === activeNoteId
    );

  const triggerNotePrompt = (prompt: string) => {
    if (onSuggestionClick) {
      onSuggestionClick(prompt);
      return;
    }
    void sendMessage(prompt);
  };

  if (!isAttached && !showSuggestion) return null;

  return (
    <AnimatePresence mode="wait">
      {isAttached && pendingNoteContext ? (
        <motion.div
          key="note-attached"
          variants={heightVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={SNAPPY}
          style={{ overflow: 'hidden' }}
        >
          <div className="rounded-lg border border-border/60 bg-card/60 px-3 py-2">
            <div className="flex items-center gap-2">
              <p className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                Note attached: <span className="text-foreground">{pendingNoteContext.title}</span>
              </p>
              <button
                type="button"
                className="shrink-0 rounded-sm p-0.5 text-muted-foreground/60 transition-colors hover:text-foreground"
                onClick={detachPendingNoteContext}
                aria-label="Detach note"
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <button
                type="button"
                className="rounded-full border border-border/60 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-border hover:text-foreground"
                onClick={() => triggerNotePrompt('Extract the action items from this note and add or update tasks as needed.')}
              >
                Extract tasks
              </button>
              <button
                type="button"
                className="rounded-full border border-border/60 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-border hover:text-foreground"
                onClick={() => triggerNotePrompt('Summarize the key decisions from this note.')}
              >
                Summarize decisions
              </button>
              <button
                type="button"
                className="rounded-full border border-border/60 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-border hover:text-foreground"
                onClick={() => triggerNotePrompt('Clean up this note for clarity and brevity without losing important details.')}
              >
                Clean up note
              </button>
            </div>
          </div>
        </motion.div>
      ) : showSuggestion ? (
        <motion.div
          key="note-suggestion"
          variants={heightVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={SNAPPY}
          style={{ overflow: 'hidden' }}
        >
          <div className="flex items-center justify-between gap-2 rounded-lg border border-border/30 bg-card/30 px-3 py-2">
            <p className="min-w-0 truncate text-[11px] text-muted-foreground">
              Attach <span className="text-foreground">&ldquo;{activeNoteTitle}&rdquo;</span>?
            </p>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                className="rounded-full border border-border/60 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-border hover:text-foreground"
                onClick={() => stageCurrentNoteForChat()}
              >
                Attach
              </button>
              <button
                type="button"
                className="shrink-0 rounded-sm p-0.5 text-muted-foreground/40 transition-colors hover:text-muted-foreground"
                onClick={() => {
                  if (activeNoteId) dismissNoteHint(activeNoteId);
                }}
                aria-label="Dismiss"
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};
