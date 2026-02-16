import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, Check, ChevronDown, ChevronRight, Image as ImageIcon, Loader2, Undo2, X, Zap } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';

import type { ChipAction, TurnStep } from '../../../types/chat';
import { cn } from '../../lib/utils';
import {
  selectChatError,
  selectChatIsSending,
  selectChatLastStreamError,
  selectChatMessages,
  selectFocusMessageId,
  useChatStore,
} from '../../stores/chatStore';
import { useTaskStore } from '../../stores/taskStore';
import { getFlusk } from '../../lib/flusk';
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
      return <Loader2 className="size-3 animate-spin text-muted-foreground" />;
    case 'success':
      return <Check className="size-3 text-emerald-400" />;
    case 'error':
      return <X className="size-3 text-destructive" />;
    case 'confirmation_required':
      return <AlertTriangle className="size-3 text-amber-400" />;
    default:
      return <Loader2 className="size-3 animate-spin text-muted-foreground" />;
  }
};

type ThinkingStepProps = {
  content: string;
  isStreaming: boolean;
};

const ThinkingStep = ({ content, isStreaming }: ThinkingStepProps) => {
  const [expanded, setExpanded] = useState(isStreaming);

  return (
    <div className="text-xs text-muted-foreground/70">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 hover:text-muted-foreground transition-colors"
      >
        {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        <span className="italic">Thinking{isStreaming ? '...' : ''}</span>
      </button>
      {expanded ? (
        <div className="mt-1 ml-4 whitespace-pre-wrap text-muted-foreground/60 leading-relaxed">
          {content}
        </div>
      ) : null}
    </div>
  );
};

type ToolStepProps = {
  step: Extract<TurnStep, { kind: 'tool' }>;
  onUndo: (taskEventId?: string) => void;
  onApprove: (actionId: string) => void;
  onReject: (actionId: string) => void;
};

const ToolStep = ({ step, onUndo, onApprove, onReject }: ToolStepProps) => {
  const card = step.actionCard;
  const isPending = card?.lifecycle === 'pending';
  const isExecuted = card?.lifecycle === 'executed' || (!card?.lifecycle && step.status === 'success');
  const isUndone = card?.lifecycle === 'undone';

  return (
    <div className={cn(
      'flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-xs',
      step.status === 'error' ? 'border-destructive/30 bg-destructive/5' :
      step.status === 'confirmation_required' ? 'border-amber-500/30 bg-amber-500/5' :
      isUndone ? 'border-muted-foreground/20 bg-muted/10 opacity-60' :
      'border-border/60 bg-card/40',
    )}>
      <div className="mt-0.5 shrink-0">
        {toolStatusIcon(isUndone ? 'success' : step.status)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-mono font-medium text-foreground/90">{step.description}</p>
        {step.summary && step.status !== 'running' ? (
          <p className="mt-0.5 text-muted-foreground">{step.summary}</p>
        ) : null}
        {card?.riskLevel && (card.riskLevel === 'high' || card.riskLevel === 'critical') ? (
          <p className="mt-0.5 font-mono text-amber-400/80 text-[10px] uppercase tracking-wide">
            {card.riskLevel} risk{card.rationale ? ` — ${card.rationale}` : ''}
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
              onClick={() => { if (card.actionId) onApprove(card.actionId); }}
            >
              <Check className="size-3" />
              Approve
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => { if (card.actionId) onReject(card.actionId); }}
            >
              <X className="size-3" />
              Reject
            </Button>
          </>
        ) : null}

        {isExecuted && card?.undoable && card?.taskEventId ? (
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => onUndo(card.taskEventId)}
            className="shrink-0"
          >
            <Undo2 className="size-3" />
            Undo
          </Button>
        ) : null}
      </div>
    </div>
  );
};

type StreamingIndicatorProps = {
  prefersReducedMotion: boolean;
};

const StreamingIndicator = ({ prefersReducedMotion }: StreamingIndicatorProps) => (
  <div className="flex items-center gap-1.5 py-0.5" role="status" aria-label="Flusk is thinking">
    {[0, 1, 2].map((dotIndex) => (
      prefersReducedMotion ? (
        <span
          key={dotIndex}
          className="size-1.5 rounded-full bg-muted-foreground/60"
          style={{ opacity: 0.45 + dotIndex * 0.15 }}
        />
      ) : (
        <motion.span
          key={dotIndex}
          className="size-1.5 rounded-full bg-muted-foreground/70"
          initial={false}
          animate={{ y: [0, -2, 0], opacity: [0.35, 0.9, 0.35] }}
          transition={{
            duration: 0.9,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: dotIndex * 0.12,
          }}
        />
      )
    ))}
    <span className="sr-only">Flusk is thinking</span>
  </div>
);

type ChipBarProps = {
  chips: ChipAction[];
  used: boolean;
  stale: boolean;
  onChipClick: (chip: ChipAction, index: number) => void;
};

const ChipBar = ({ chips, used, stale, onChipClick }: ChipBarProps) => {
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 pt-1">
      {chips.map((chip, index) => (
        <button
          key={`${chip.label}-${index}`}
          type="button"
          disabled={used}
          onClick={() => onChipClick(chip, index)}
          className={cn(
            'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors duration-150',
            used
              ? 'cursor-default border-border/30 text-muted-foreground/40'
              : stale
                ? 'border-border/40 text-muted-foreground/70 hover:border-foreground/40 hover:text-foreground active:bg-foreground/5'
                : 'border-border/60 text-muted-foreground hover:border-foreground/40 hover:text-foreground active:bg-foreground/5',
          )}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
};

export const SUGGESTIONS = [
  { label: 'Create a task', prefill: 'Create a task: ' },
  { label: "What's due today?", prefill: "What's due today?" },
  { label: 'Summarize my week', prefill: 'Summarize my week' },
] as const;

type EmptyStateProps = {
  onSuggestionClick: (prefill: string) => void;
};

const EmptyState = ({ onSuggestionClick }: EmptyStateProps) => (
  <div className="flex h-full flex-col items-center justify-center gap-4 px-4">
    <span className="font-mono text-sm font-medium tracking-[0.08em] text-muted-foreground/60">
      flusk
    </span>
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
          onClick={() => onSuggestionClick(suggestion.prefill)}
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

  const undoAction = useChatStore((state) => state.undoAction);
  const approvePendingAction = useChatStore((state) => state.approvePendingAction);
  const rejectPendingAction = useChatStore((state) => state.rejectPendingAction);
  const retryLastFailedMessage = useChatStore((state) => state.retryLastFailedMessage);
  const clearFocusMessageId = useChatStore((state) => state.clearFocusMessageId);

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

  const [confirmationTarget, setConfirmationTarget] = useState<{
    actionId: string;
    rationale: string;
    riskLevel: string;
  } | null>(null);

  const handleApprove = useCallback(
    (actionId: string) => {
      const card = messages
        .flatMap((m) => m.actionCards)
        .find((c) => c.actionId === actionId);

      if (card?.riskLevel === 'high' || card?.riskLevel === 'critical') {
        setConfirmationTarget({
          actionId,
          rationale: card.rationale ?? card.detail,
          riskLevel: card.riskLevel,
        });
        return;
      }

      void approvePendingAction(actionId);
    },
    [messages, approvePendingAction],
  );

  const handleConfirmApprove = useCallback(() => {
    if (confirmationTarget) {
      void approvePendingAction(confirmationTarget.actionId);
      setConfirmationTarget(null);
    }
  }, [confirmationTarget, approvePendingAction]);

  const sendMessage = useChatStore((state) => state.sendMessage);

  const handleChipClick = useCallback(
    (messageId: string, chip: ChipAction) => {
      const setChipUsed = (used: boolean) => {
        useChatStore.setState((state) => ({
          messages: state.messages.map((msg) =>
            msg.id === messageId ? { ...msg, chipsUsed: used } : msg,
          ),
        }));
      };

      if (chip.type === 'response') {
        const responseText = chip.responseText?.trim().length
          ? chip.responseText.trim()
          : chip.label.trim();

        if (responseText.length === 0) {
          return;
        }

        setChipUsed(true);
        void sendMessage(responseText);
        return;
      }

      if (chip.type === 'action' && chip.toolCall) {
        setChipUsed(true);
        const toolCall = chip.toolCall;
        void (async () => {
          try {
            const result = await getFlusk().chat.executeChipAction({
              toolName: toolCall.name,
              args: toolCall.args,
            });

            if (result.ok && result.status === 'success') {
              void useTaskStore.getState().fetchTasks();
            }

            if (result.status === 'confirmation_required') {
              void useChatStore.getState().refreshPendingActions();
            }

            if (!result.ok) {
              setChipUsed(false);
            }
          } catch {
            setChipUsed(false);
          }
        })();
      }
    },
    [sendMessage],
  );

  const renderedMessages = useMemo(
    () => {
      const lastMessageId = messages.length > 0 ? messages[messages.length - 1].id : null;

      return messages.map((message, messageIndex) => {
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

        // Tool-call indicator: check if next message is assistant with tool steps
        const nextMessage = messages[messageIndex + 1];
        const triggeredTools = !isAssistant
          && nextMessage?.role === 'assistant'
          && nextMessage.steps.some((s) => s.kind === 'tool');

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
              <div className="flex w-full max-w-[88%] flex-col gap-1.5">
                {message.steps.map((step, index) => {
                  if (step.kind === 'thinking') {
                    return (
                      <ThinkingStep
                        key={`thinking-${index}`}
                        content={step.content}
                        isStreaming={Boolean(message.isStreaming)}
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
                    // Hide emit_chips tool steps — chips are rendered separately
                    if (step.toolName === 'emit_chips') return null;

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

                {message.chips && message.chips.length > 0 ? (
                  <ChipBar
                    chips={message.chips}
                    used={Boolean(message.chipsUsed)}
                    stale={!isLatest}
                    onChipClick={(chip) => handleChipClick(message.id, chip)}
                  />
                ) : null}
              </div>
            ) : isAssistant ? (
              <div className="flex w-full max-w-[88%] flex-col gap-1.5">
                <div
                  className={cn(
                    'rounded-xl border px-3 py-2 text-sm',
                    'border-border bg-card/80 text-foreground',
                  )}
                >
                  {isPendingAssistantPlaceholder ? (
                    <StreamingIndicator prefersReducedMotion={Boolean(prefersReducedMotion)} />
                  ) : (
                    <div className="prose prose-invert max-w-none text-sm text-foreground prose-p:my-1 prose-ul:my-1 prose-li:my-0.5 [&_p]:whitespace-pre-wrap">
                      <ReactMarkdown remarkPlugins={[remarkBreaks]}>{message.content}</ReactMarkdown>
                    </div>
                  )}
                </div>
                {message.chips && message.chips.length > 0 ? (
                  <ChipBar
                    chips={message.chips}
                    used={Boolean(message.chipsUsed)}
                    stale={!isLatest}
                    onChipClick={(chip) => handleChipClick(message.id, chip)}
                  />
                ) : null}
              </div>
            ) : (
              <div className="relative max-w-[88%] rounded-xl border border-border/70 bg-secondary px-3 py-2 text-sm text-secondary-foreground">
                <p className="whitespace-pre-wrap">{message.content}</p>

                {triggeredTools && (
                  <Zap className="absolute bottom-1.5 right-2 size-3 text-muted-foreground/40" />
                )}
              </div>
            )}

            {/* Image attachment indicator for history messages */}
            {!isAssistant && message.imageCount && message.imageCount > 0 && (
              <span className="flex items-center gap-1 px-1 text-[10px] text-muted-foreground/60">
                <ImageIcon className="size-2.5" />
                {message.imageCount} image{message.imageCount > 1 ? 's' : ''} attached
              </span>
            )}

            {timestamp ? (
              <time className="px-1 font-mono text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground/80">
                {timestamp}
              </time>
            ) : null}
          </motion.article>
        );
      });
    },
    [messages, undoAction, handleApprove, rejectPendingAction, handleChipClick, prefersReducedMotion],
  );

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-3">
      {error ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <div className="min-w-0">
            <p className="truncate">{error}</p>
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
      ) : null}

      <div ref={scrollContainerRef} onScroll={handleScroll} role="log" aria-live="polite" aria-relevant="additions" className="flex-1 space-y-4 overflow-y-auto pr-1 pb-0">
        {renderedMessages.length > 0 ? (
          renderedMessages
        ) : (
          <EmptyState
            onSuggestionClick={onSuggestionClick ?? (() => undefined)}
          />
        )}

      </div>

      <AnimatePresence>
        {confirmationTarget ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0.05 : 0.15 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            aria-describedby="confirm-dialog-desc"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: prefersReducedMotion ? 0.05 : 0.15, ease: 'easeOut' }}
              className="w-full max-w-sm rounded-xl border border-border bg-card p-4 shadow-lg"
            >
              <div className="flex items-center gap-2 text-amber-300">
                <AlertTriangle className="size-4" />
                <h3 id="confirm-dialog-title" className="text-sm font-semibold">Confirm {confirmationTarget.riskLevel}-risk action</h3>
              </div>
              <p id="confirm-dialog-desc" className="mt-3 text-sm text-muted-foreground">{confirmationTarget.rationale}</p>
              <p className="mt-2 text-xs text-muted-foreground/70">
                This action has elevated risk and requires explicit confirmation.
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmationTarget(null)}>
                  Cancel
                </Button>
                <Button type="button" variant="default" size="sm" onClick={handleConfirmApprove}>
                  Confirm &amp; Execute
                </Button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};
