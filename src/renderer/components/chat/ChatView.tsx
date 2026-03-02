import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, Check, ChevronRight, Image as ImageIcon, Loader2, Undo2, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';

import type { ChipAction, TurnStep } from '../../../types/chat';
import { SNAPPY, heightVariants } from '../../lib/animation';
import { cn } from '../../lib/utils';
import { getUntask } from '../../lib/untask';
import { BirdMascot } from './BirdMascot';

const AvatarIcon = ({ size, className }: { size: number; className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 100 95.17"
    className={className}
    style={{ width: size, height: size }}
  >
    <path
      fill="currentColor"
      d="M50,0C22.39,0,0,22.39,0,50c0,15.54,7.09,29.43,18.22,38.6,3.07-15.42,6.13-30.85,9.19-46.27,2.25-8.16,1.31-18.45,9.04-23.77,8.03-5.46,21.14-.23,21.87,9.69,8.68,2.4,17.39,4.93,25.88,7.91-.52.35-.79.44-1.39.56h0c-7.51,1.46-14.97,3.24-22.52,4.47,3.47,17.2,6.96,34.38,10.48,51.57.26.86.49,1.66.67,2.42,16.88-8.03,28.55-25.24,28.55-45.17C100,22.39,77.61,0,50,0Z"
    />
    <path
      fill="currentColor"
      d="M48.65,29.27c.03-4.38-6.63-4.89-7.49-.69-1.13,5.42,7.48,6.22,7.49.69Z"
    />
  </svg>
);
import {
  selectChatActiveConversationId,
  selectChatError,
  selectChatIsSending,
  selectChatLastStreamError,
  selectChatMessages,
  selectChatSelectedModelId,
  selectFocusMessageId,
  selectNoteHintDismissedForConversationId,
  selectPendingNoteContext,
  useChatStore,
} from '../../stores/chat';
import { selectActiveView, useAppStore } from '../../stores/appStore';
import { useNotesStore } from '../../stores/notesStore';
import { getDisplayTitle as getNoteDisplayTitle } from '../../lib/noteUtils';
import { Button } from '../ui/button';

const formatTimestamp = (createdAt: string | null): string => {
  if (!createdAt) {
    return '';
  }

  const parsed = new Date(createdAt);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed);
};

const toolStatusIcon = (status: string) => {
  switch (status) {
    case 'running':
      return <Loader2 className="size-3 animate-spin text-muted-foreground" aria-hidden="true" />;
    case 'success':
      return <Check className="size-3 text-emerald-400" aria-hidden="true" />;
    case 'error':
      return <X className="size-3 text-destructive" aria-hidden="true" />;
    case 'confirmation_required':
      return <AlertTriangle className="size-3 text-amber-400" aria-hidden="true" />;
    default:
      return <Loader2 className="size-3 animate-spin text-muted-foreground" aria-hidden="true" />;
  }
};

type ThinkingStepProps = {
  content: string;
};

const ThinkingStep = ({ content }: ThinkingStepProps) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-muted-foreground/30 hover:text-muted-foreground/50 transition-colors"
      >
        <ChevronRight
          aria-hidden="true"
          className={cn(
            'size-2.5 transition-transform duration-150',
            expanded && 'rotate-90',
          )}
        />
        <span className="font-mono text-[10px] uppercase tracking-[0.08em]">
          Reasoning
        </span>
      </button>
      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="mt-1.5 ml-1.5 border-l border-border/30 pl-3 whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground/40">
              {content}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};

// Only show tool steps for mutation tools — read-only tools (list_tasks, get_task, etc.) are hidden
const VISIBLE_TOOL_NAMES = new Set([
  'create_task',
  'update_task',
  'complete_task',
  'delete_task',
  'edit_note',
  'update_memory',
  'undo_last_action',
]);

const isVisibleToolStep = (step: Extract<TurnStep, { kind: 'tool' }>): boolean => {
  // Always show steps that need user action
  if (step.status === 'confirmation_required') return true;
  if (step.actionCard?.lifecycle === 'pending') return true;
  // Always show errors
  if (step.status === 'error') return true;
  // Show mutation tools, hide read-only
  return VISIBLE_TOOL_NAMES.has(step.toolName);
};

type ToolStepProps = {
  step: Extract<TurnStep, { kind: 'tool' }>;
  onUndo: (taskEventId?: string) => void;
  onApprove: (actionId: string) => void;
  onReject: (actionId: string) => void;
};

const ToolStep = ({ step, onUndo, onApprove, onReject }: ToolStepProps) => {
  const card = step.actionCard;
  const [resolving, setResolving] = useState<'approved' | 'rejected' | null>(null);

  // Optimistic lifecycle: local click state takes priority over store
  const isPending = card?.lifecycle === 'pending' && !resolving;
  const isExecuted =
    resolving === 'approved' ||
    card?.lifecycle === 'executed' ||
    (!card?.lifecycle && step.status === 'success');
  const isUndone = card?.lifecycle === 'undone';

  // Show approval/rejection badge for cards that were user-resolved
  const showApprovedBadge = resolving === 'approved' || (card?.lifecycle === 'executed' && Boolean(card?.actionId));
  const showRejectedBadge = resolving === 'rejected' || card?.lifecycle === 'rejected';

  return (
    <div className={cn(
      'flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-xs',
      step.status === 'error' ? 'border-destructive/30 bg-destructive/5' :
        (step.status === 'confirmation_required' && !resolving) ? 'border-border/60 bg-card/40' :
          isUndone ? 'border-muted-foreground/20 bg-muted/10 opacity-60' :
            'border-border/60 bg-card/40',
    )}>
      <div className="mt-0.5 shrink-0">
        {toolStatusIcon(isUndone ? 'success' : resolving ? 'success' : step.status)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-foreground/90">
          {step.summary && step.status !== 'running' ? step.summary : step.description}
        </p>
        {isPending && card?.riskLevel && card.riskLevel !== 'low' ? (
          <p className="mt-0.5 text-[10px] text-muted-foreground/60">
            Requires confirmation
          </p>
        ) : null}
        {isUndone ? (
          <p className="mt-0.5 text-muted-foreground/60 italic">Undone</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {isPending && card?.actionId ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => {
                if (card.actionId) {
                  setResolving('approved');
                  onApprove(card.actionId);
                }
              }}
            >
              <Check className="size-3" aria-hidden="true" />
              Approve
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => {
                if (card.actionId) {
                  setResolving('rejected');
                  onReject(card.actionId);
                }
              }}
            >
              <X className="size-3" aria-hidden="true" />
            </Button>
          </>
        ) : null}

        {showApprovedBadge ? (
          <span className="flex items-center gap-1 text-[10px] text-emerald-400/70">
            <Check className="size-2.5" aria-hidden="true" />
            Approved
          </span>
        ) : null}

        {showRejectedBadge ? (
          <span className="text-[10px] text-muted-foreground/50">
            Rejected
          </span>
        ) : null}

        {isExecuted && card?.undoable && card?.taskEventId ? (
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => onUndo(card.taskEventId)}
            className="shrink-0"
          >
            <Undo2 className="size-3" aria-hidden="true" />
            Undo
          </Button>
        ) : null}
      </div>
    </div>
  );
};

type StreamingIndicatorProps = {
  prefersReducedMotion: boolean;
  phase?: 'sending' | 'thinking';
  isOllama?: boolean;
};

const StreamingIndicator = ({ prefersReducedMotion, phase, isOllama }: StreamingIndicatorProps) => {
  const [showLoadingModel, setShowLoadingModel] = useState(false);

  useEffect(() => {
    if (phase !== 'sending' || !isOllama) {
      setShowLoadingModel(false);
      return;
    }

    const timer = setTimeout(() => setShowLoadingModel(true), 2000);
    return () => clearTimeout(timer);
  }, [phase, isOllama]);

  let label: string;
  let ariaLabel: string;
  if (phase === 'sending' && showLoadingModel) {
    label = 'Loading model\u2026';
    ariaLabel = 'Loading model';
  } else if (phase === 'sending') {
    label = 'Sending\u2026';
    ariaLabel = 'Sending message';
  } else {
    label = 'Thinking\u2026';
    ariaLabel = 'Untask is thinking';
  }

  return (
    <div className="py-0.5 pl-1" role="status" aria-label={ariaLabel}>
      <span
        className={cn(
          'font-mono text-[11px] tracking-normal',
          prefersReducedMotion ? 'text-muted-foreground/40' : 'thinking-shimmer',
        )}
      >
        {label}
      </span>
      <span className="sr-only">{ariaLabel}</span>
    </div>
  );
};

type ChipBarProps = {
  chips: ChipAction[];
  disabled: boolean;
  onChipClick: (chip: ChipAction) => void;
};

const ChipBar = ({ chips, disabled, onChipClick }: ChipBarProps) => {
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 pt-1">
      {chips.map((chip, index) => (
        <button
          key={`${chip.label}-${index}`}
          type="button"
          disabled={disabled}
          onClick={() => onChipClick(chip)}
          className={cn(
            'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors duration-150',
            disabled
              ? 'cursor-default border-border/30 text-muted-foreground/40'
              : 'border-border/60 text-muted-foreground hover:border-foreground/40 hover:text-foreground active:bg-foreground/5',
          )}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
};

const ProactiveBadge = () => (
  <span className="self-start rounded-full border border-border/60 bg-card/70 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/70">
    Proactive reminder
  </span>
);

export const SUGGESTIONS = [
  { label: 'Create a task', prefill: 'Create a task: ' },
  { label: "What's due today?", prefill: "What's due today?" },
  { label: 'Summarize my week', prefill: 'Summarize my week' },
] as const;

type EmptyStateProps = {
  onSend: (message: string) => void;
};

const EmptyState = ({ onSend }: EmptyStateProps) => (
  <div className="flex h-full flex-col items-center justify-center gap-4 px-4">
    <BirdMascot size={36} className="text-muted-foreground" />
    <p className="max-w-[260px] text-center text-xs leading-relaxed text-muted-foreground/50">
      Your personal assistant. Asks before acting,
      double-checks risky changes, and remembers
      what matters — even after chats are cleared.
    </p>
    <div className="flex flex-wrap items-center justify-center gap-2">
      {SUGGESTIONS.map((suggestion) => (
        <button
          key={suggestion.label}
          type="button"
          onClick={() => onSend(suggestion.prefill)}
          className="rounded-full border border-border/60 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground"
        >
          {suggestion.label}
        </button>
      ))}
    </div>
  </div>
);

type ChatViewProps = {
  onSuggestionClick?: (prefill: string) => void;
};

export const ChatView = ({ onSuggestionClick }: ChatViewProps) => {
  const messages = useChatStore(selectChatMessages);
  const isSending = useChatStore(selectChatIsSending);
  const error = useChatStore(selectChatError);
  const lastStreamError = useChatStore(selectChatLastStreamError);
  const focusMessageId = useChatStore(selectFocusMessageId);
  const pendingNoteContext = useChatStore(selectPendingNoteContext);
  const selectedModelId = useChatStore(selectChatSelectedModelId);

  const activeConversationId = useChatStore(selectChatActiveConversationId);
  const noteHintDismissedForConversationId = useChatStore(selectNoteHintDismissedForConversationId);
  const dismissNoteHint = useChatStore((state) => state.dismissNoteHint);

  const activeView = useAppStore(selectActiveView);
  const activeNoteId = useNotesStore((state) => state.activeNoteId);
  const activeNotes = useNotesStore((state) => state.activeNotes);
  const stageCurrentNoteForChat = useNotesStore((state) => state.stageCurrentNoteForChat);

  const activeNoteTitle = useMemo(() => {
    if (!activeNoteId) return null;
    const note = activeNotes.find((n) => n.id === activeNoteId);
    if (!note) return null;
    const title = getNoteDisplayTitle(note.title, note.content);
    return title === 'Empty note' ? null : title;
  }, [activeNoteId, activeNotes]);

  const showNoteHint =
    activeView === 'notes' &&
    Boolean(activeNoteId) &&
    !pendingNoteContext &&
    noteHintDismissedForConversationId !== activeConversationId;

  const undoAction = useChatStore((state) => state.undoAction);
  const approvePendingAction = useChatStore((state) => state.approvePendingAction);
  const rejectPendingAction = useChatStore((state) => state.rejectPendingAction);
  const retryLastFailedMessage = useChatStore((state) => state.retryLastFailedMessage);
  const clearFocusMessageId = useChatStore((state) => state.clearFocusMessageId);
  const detachPendingNoteContext = useChatStore((state) => state.detachPendingNoteContext);

  const prefersReducedMotion = useReducedMotion();
  const lastAnimatedIdRef = useRef<string | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  const SCROLL_THRESHOLD = 80;

  const scrollToBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (el) {
      isNearBottomRef.current =
        el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_THRESHOLD;
    }
  }, []);

  // Scroll to bottom on mount (when chat view opens)
  useLayoutEffect(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  const [isOllama, setIsOllama] = useState(false);

  // Refresh selected model when provider changes (handles switching from OpenRouter to Ollama)
  useEffect(() => {
    let cancelled = false;

    const refreshModel = async () => {
      try {
        const selected = await getUntask().chat.getSelectedModel();
        if (cancelled) return;
        if (selected?.modelId) {
          useChatStore.setState({ selectedModelId: selected.modelId });
        }
      } catch {
        // Best-effort refresh
      }
    };

    void refreshModel();

    return () => {
      cancelled = true;
    };
  }, []);

  // Preload Ollama model when chat view opens (eliminates cold-start latency)
  useEffect(() => {
    if (!selectedModelId) return;

    let cancelled = false;

    const maybeWarmup = async () => {
      try {
        const provider = await getUntask().settings.get('ai_provider');
        if (cancelled) return;
        const ollamaProvider = provider === 'ollama';
        setIsOllama(ollamaProvider);
        if (!ollamaProvider) return;

        // Validate model exists in Ollama before warming up
        const ollamaStatus = await getUntask().chat.getOllamaStatus();
        if (cancelled) return;

        const availableModels = ollamaStatus.models.map((m) => m.name);
        const modelExists = availableModels.some(
          (name) => name === selectedModelId || name.startsWith(`${selectedModelId}:`),
        );

        if (!modelExists) {
          console.log(`[ollama-warmup] skip: model=${selectedModelId} not found in Ollama`);
          return;
        }

        void getUntask().chat.warmupOllama({ modelId: selectedModelId });
      } catch {
        // Warmup is best-effort — don't surface errors
      }
    };

    void maybeWarmup();

    return () => {
      cancelled = true;
    };
  }, [selectedModelId]);

  // Auto-scroll when messages change (new messages or streaming tokens)
  useEffect(() => {
    if (isNearBottomRef.current) {
      scrollToBottom();
    }
  }, [messages, isSending, scrollToBottom]);

  useEffect(() => {
    if (!focusMessageId) {
      return;
    }

    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    const target = container.querySelector<HTMLElement>(
      `[data-chat-message-id="${focusMessageId}"]`,
    );

    if (!target) {
      return;
    }

    target.scrollIntoView({
      block: 'center',
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    });
    clearFocusMessageId();
  }, [focusMessageId, messages, prefersReducedMotion, clearFocusMessageId]);

  const handleApprove = useCallback(
    (actionId: string) => {
      void approvePendingAction(actionId);
    },
    [approvePendingAction],
  );

  const sendMessage = useChatStore((state) => state.sendMessage);
  const triggerNotePrompt = useCallback(
    (prompt: string) => {
      if (onSuggestionClick) {
        onSuggestionClick(prompt);
        return;
      }

      void sendMessage(prompt);
    },
    [onSuggestionClick, sendMessage],
  );

  const handleChipClick = useCallback(
    (_messageId: string, chip: ChipAction) => {
      const text = (chip.responseText ?? chip.label).trim();
      if (text.length === 0) return;
      void sendMessage(text);
    },
    [sendMessage],
  );

  const renderedMessages = useMemo(
    () => {
      const lastMessageId = messages.length > 0 ? messages[messages.length - 1].id : null;
      const lastAssistantMessageId = [...messages].reverse().find((m) => m.role === 'assistant')?.id ?? null;

      return messages.map((message) => {
        const isAssistant = message.role === 'assistant';
        const timestamp = formatTimestamp(message.createdAt);
        const hasSteps = isAssistant && message.steps.length > 0;
        const isPendingAssistantPlaceholder =
          isAssistant &&
          Boolean(message.isStreaming) &&
          !hasSteps &&
          message.content.trim().length === 0;

        const isLatest = message.id === lastMessageId;
        const shouldAnimate = isLatest && message.id !== lastAnimatedIdRef.current;

        if (shouldAnimate) {
          lastAnimatedIdRef.current = message.id;
        }

        return (
          <motion.article
            key={message.id}
            data-chat-message-id={message.id}
            initial={shouldAnimate ? { opacity: 0, y: 8 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: prefersReducedMotion ? 0.05 : 0.15,
              ease: 'easeOut',
            }}
            className={cn(
              'flex w-full flex-col gap-1.5',
              isAssistant ? 'items-start' : 'items-end',
            )}
          >
            {isAssistant && hasSteps ? (
              <div className="flex w-full max-w-[88%] items-start gap-2">
                <AvatarIcon size={16} className="mt-0.5 shrink-0 text-muted-foreground/40" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  {message.origin === 'proactive' ? <ProactiveBadge /> : null}
                  {message.steps.map((step, index) => {
                    if (step.kind === 'thinking') {
                      // Only show reasoning disclosure after streaming is done
                      if (message.isStreaming) return null;
                      return (
                        <ThinkingStep
                          key={`thinking-${index}`}
                          content={step.content}
                        />
                      );
                    }

                    if (step.kind === 'text') {
                      return (
                        <div
                          key={`text-${index}`}
                          className="rounded-xl border border-border bg-card/80 px-3 py-2 text-sm"
                        >
                          <div className="prose prose-invert max-w-none text-sm text-foreground prose-p:my-1 prose-ul:my-1 prose-li:my-0.5 [&_p]:whitespace-pre-wrap">
                            <ReactMarkdown remarkPlugins={[remarkBreaks]}>{step.content}</ReactMarkdown>
                          </div>
                        </div>
                      );
                    }

                    if (step.kind === 'tool') {
                      // Hide emit_chips and read-only tool steps
                      if (step.toolName === 'emit_chips') return null;
                      if (!isVisibleToolStep(step)) return null;

                      return (
                        <ToolStep
                          key={step.toolCallId || `tool-${index}`}
                          step={step}
                          onUndo={(taskEventId) => {
                            void undoAction(taskEventId);
                          }}
                          onApprove={handleApprove}
                          onReject={(actionId) => {
                            void rejectPendingAction(actionId);
                          }}
                        />
                      );
                    }

                    return null;
                  })}

                  {Boolean(message.isStreaming) && (
                    <StreamingIndicator prefersReducedMotion={Boolean(prefersReducedMotion)} phase={message.streamPhase} isOllama={isOllama} />
                  )}

                  {message.chips && message.chips.length > 0 ? (
                    <ChipBar
                      chips={message.chips}
                      disabled={message.id !== lastAssistantMessageId || isSending}
                      onChipClick={(chip) => handleChipClick(message.id, chip)}
                    />
                  ) : null}
                </div>
              </div>
            ) : isAssistant && isPendingAssistantPlaceholder ? (
              <div className="flex w-full max-w-[88%] items-center gap-2">
                <AvatarIcon size={16} className="shrink-0 text-muted-foreground/40" />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  {message.origin === 'proactive' ? <ProactiveBadge /> : null}
                  <StreamingIndicator prefersReducedMotion={Boolean(prefersReducedMotion)} phase={message.streamPhase} isOllama={isOllama} />
                </div>
              </div>
            ) : isAssistant ? (
              <div className="flex w-full max-w-[88%] items-start gap-2">
                <AvatarIcon size={16} className="mt-0.5 shrink-0 text-muted-foreground/40" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  {message.origin === 'proactive' ? <ProactiveBadge /> : null}
                  <div
                    className={cn(
                      'rounded-xl border px-3 py-2 text-sm',
                      'border-border bg-card/80 text-foreground',
                    )}
                  >
                    <div className="prose prose-invert max-w-none text-sm text-foreground prose-p:my-1 prose-ul:my-1 prose-li:my-0.5 [&_p]:whitespace-pre-wrap">
                      <ReactMarkdown remarkPlugins={[remarkBreaks]}>{message.content}</ReactMarkdown>
                    </div>
                  </div>
                  {message.chips && message.chips.length > 0 ? (
                    <ChipBar
                      chips={message.chips}
                      disabled={message.id !== lastAssistantMessageId || isSending}
                      onChipClick={(chip) => handleChipClick(message.id, chip)}
                    />
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="max-w-[88%] rounded-xl border border-border/70 bg-secondary px-3 py-2 text-sm text-secondary-foreground">
                <p className="whitespace-pre-wrap">{message.content}</p>
              </div>
            )}

            {/* Image attachment indicator for history messages */}
            {!isAssistant && message.imageCount && message.imageCount > 0 && (
              <span className="flex items-center gap-1 px-1 text-[10px] text-muted-foreground/60">
                <ImageIcon className="size-2.5" aria-hidden="true" />
                {message.imageCount} image{message.imageCount > 1 ? 's' : ''} attached
              </span>
            )}

            {timestamp ? (
              <time className={cn(
                "px-1 font-mono text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground/80",
                isAssistant && "ml-6",
              )}>
                {timestamp}
              </time>
            ) : null}
          </motion.article>
        );
      });
    },
    [messages, isSending, undoAction, handleApprove, rejectPendingAction, handleChipClick, prefersReducedMotion, isOllama],
  );

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-3">
      <AnimatePresence>
        {error ? (
          <motion.div
            key="chat-error"
            variants={heightVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={SNAPPY}
            style={{ overflow: 'hidden' }}
          >
            <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <div className="min-w-0">
                <p className="whitespace-pre-wrap break-words">{error}</p>
                {lastStreamError ? (
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.06em] text-destructive/80">
                    {lastStreamError.code.replaceAll('_', ' ')}
                  </p>
                ) : null}
              </div>
              {lastStreamError?.retryable ? (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => {
                    void retryLastFailedMessage();
                  }}
                  className="shrink-0"
                >
                  Retry last message
                </Button>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {pendingNoteContext ? (
          <motion.div
            key="note-context"
            variants={heightVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={SNAPPY}
            style={{ overflow: 'hidden' }}
          >
            <div className="rounded-lg border border-border/60 bg-card/60 px-3 py-2">
              <p className="truncate text-[11px] text-muted-foreground">
                Note attached: <span className="text-foreground">{pendingNoteContext.title}</span>
              </p>
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
                <button
                  type="button"
                  className="rounded-full border border-border/60 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-border hover:text-foreground"
                  onClick={detachPendingNoteContext}
                >
                  Detach
                </button>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {showNoteHint ? (
          <motion.div
            key="note-hint"
            variants={heightVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={SNAPPY}
            style={{ overflow: 'hidden' }}
          >
            <div className="flex items-center justify-between gap-2 rounded-lg border border-border/40 bg-card/40 px-3 py-2">
              <p className="min-w-0 truncate text-[11px] text-muted-foreground">
                Attach {activeNoteTitle ? <span className="text-foreground">&ldquo;{activeNoteTitle}&rdquo;</span> : 'this note'}?
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
                  className="rounded-full border border-transparent px-2 py-1 text-[11px] text-muted-foreground/60 transition-colors hover:text-muted-foreground"
                  onClick={dismissNoteHint}
                >
                  Dismiss
                </button>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div ref={scrollContainerRef} onScroll={handleScroll} role="log" aria-live="polite" aria-relevant="additions" className="flex-1 space-y-4 overflow-y-auto pr-1 py-3">
        {renderedMessages.length > 0 ? (
          renderedMessages
        ) : (
          <EmptyState
            onSend={(msg) => void sendMessage(msg)}
          />
        )}

      </div>


    </div>
  );
};
