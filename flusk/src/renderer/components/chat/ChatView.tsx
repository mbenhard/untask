import { useCallback, useMemo, useState } from 'react';

import { Check, Loader2, ShieldAlert, Trash2, Undo2, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

import type { ChatActionCard, ChatRetentionMode } from '../../../types/chat';
import { cn } from '../../lib/utils';
import {
  selectChatError,
  selectChatIsSending,
  selectChatMessages,
  selectChatModels,
  selectChatRetentionMode,
  selectChatSelectedModelId,
  useChatStore,
} from '../../stores/chatStore';
import { Button } from '../ui/button';

type ActionCardProps = {
  card: ChatActionCard;
  onUndo: (taskEventId?: string) => void;
  onApprove: (actionId: string) => void;
  onReject: (actionId: string) => void;
};

const statusBadgeClass = (status: ChatActionCard['status']): string => {
  if (status === 'success') {
    return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200';
  }

  if (status === 'confirmation_required') {
    return 'border-amber-500/40 bg-amber-500/10 text-amber-200';
  }

  return 'border-destructive/40 bg-destructive/10 text-destructive';
};

const lifecycleBadgeClass = (lifecycle: ChatActionCard['lifecycle']): string => {
  switch (lifecycle) {
    case 'pending':
      return 'border-amber-500/40 bg-amber-500/10 text-amber-200';
    case 'executed':
      return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200';
    case 'rejected':
      return 'border-destructive/40 bg-destructive/10 text-destructive';
    case 'undone':
      return 'border-muted-foreground/40 bg-muted/20 text-muted-foreground';
    default:
      return '';
  }
};

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

const ActionCard = ({ card, onUndo, onApprove, onReject }: ActionCardProps): JSX.Element => {
  const isPending = card.lifecycle === 'pending';
  const isExecuted = card.lifecycle === 'executed' || (!card.lifecycle && card.status === 'success');

  const badgeLabel = card.lifecycle ?? card.status.replace('_', ' ');
  const badgeStyle = card.lifecycle
    ? lifecycleBadgeClass(card.lifecycle)
    : statusBadgeClass(card.status);

  return (
    <div className="rounded-lg border border-border/80 bg-card/70 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]',
                badgeStyle,
              )}
            >
              {badgeLabel}
            </div>
            {card.riskLevel ? (
              <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                {card.riskLevel} risk
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm font-medium text-foreground">{card.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{card.detail}</p>
          {card.rationale && card.rationale !== card.detail ? (
            <p className="mt-1 text-xs text-muted-foreground/70 italic">{card.rationale}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {isPending && card.actionId ? (
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

          {isExecuted && card.undoable && card.taskEventId ? (
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
    </div>
  );
};

type ConfirmationTarget = {
  actionId: string;
  rationale: string;
  riskLevel: string;
} | null;

const ConfirmationDialog = ({
  target,
  onConfirm,
  onCancel,
}: {
  target: ConfirmationTarget;
  onConfirm: () => void;
  onCancel: () => void;
}): JSX.Element | null => {
  if (!target) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-4 shadow-lg">
        <div className="flex items-center gap-2 text-amber-300">
          <ShieldAlert className="size-4" />
          <h3 className="text-sm font-semibold">Confirm {target.riskLevel}-risk action</h3>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">{target.rationale}</p>
        <p className="mt-2 text-xs text-muted-foreground/70">
          This action has elevated risk and requires explicit confirmation.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" variant="default" size="sm" onClick={onConfirm}>
            Confirm &amp; Execute
          </Button>
        </div>
      </div>
    </div>
  );
};

export const ChatView = (): JSX.Element => {
  const messages = useChatStore(selectChatMessages);
  const isSending = useChatStore(selectChatIsSending);
  const error = useChatStore(selectChatError);
  const models = useChatStore(selectChatModels);
  const selectedModelId = useChatStore(selectChatSelectedModelId);
  const retentionMode = useChatStore(selectChatRetentionMode);

  const clearHistory = useChatStore((state) => state.clearHistory);
  const undoAction = useChatStore((state) => state.undoAction);
  const setSelectedModel = useChatStore((state) => state.setSelectedModel);
  const setRetentionMode = useChatStore((state) => state.setRetentionMode);
  const approvePendingAction = useChatStore((state) => state.approvePendingAction);
  const rejectPendingAction = useChatStore((state) => state.rejectPendingAction);

  const [confirmationTarget, setConfirmationTarget] = useState<ConfirmationTarget>(null);

  const handleApprove = useCallback(
    (actionId: string) => {
      // Find the card to check risk level
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

  const renderedMessages = useMemo(
    () =>
      messages.map((message) => {
        const isAssistant = message.role === 'assistant';
        const timestamp = formatTimestamp(message.createdAt);

        return (
          <article
            key={message.id}
            className={cn(
              'flex w-full flex-col gap-2',
              isAssistant ? 'items-start' : 'items-end',
            )}
          >
            <div
              className={cn(
                'max-w-[88%] rounded-xl border px-3 py-2 text-sm shadow-sm',
                isAssistant
                  ? 'border-border bg-card/80 text-foreground'
                  : 'border-border/70 bg-secondary text-secondary-foreground',
              )}
            >
              {isAssistant ? (
                <div className="prose prose-invert max-w-none text-sm text-foreground prose-p:my-1 prose-ul:my-1 prose-li:my-0.5">
                  <ReactMarkdown>{message.content}</ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{message.content}</p>
              )}

              {message.isStreaming ? (
                <p className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  Streaming...
                </p>
              ) : null}
            </div>

            {(isAssistant && message.actionCards.length > 0) ? (
              <div className="flex w-full max-w-[88%] flex-col gap-2">
                {message.actionCards.map((card) => (
                  <ActionCard
                    key={card.id}
                    card={card}
                    onUndo={(taskEventId) => {
                      void undoAction(taskEventId);
                    }}
                    onApprove={handleApprove}
                    onReject={(actionId) => {
                      void rejectPendingAction(actionId);
                    }}
                  />
                ))}
              </div>
            ) : null}

            {timestamp ? (
              <time className="px-1 text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground/80">
                {timestamp}
              </time>
            ) : null}
          </article>
        );
      }),
    [messages, undoAction, handleApprove, rejectPendingAction],
  );

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-3">
      <header className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/80 bg-card/40 px-3 py-2">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
            Model
          </label>
          <select
            value={selectedModelId ?? ''}
            onChange={(event) => {
              const nextModelId = event.target.value;
              if (nextModelId.length === 0) {
                return;
              }
              void setSelectedModel(nextModelId);
            }}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
            aria-label="Model selector"
          >
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
            Retention
          </label>
          <select
            value={retentionMode}
            onChange={(event) => {
              const nextMode = event.target.value as ChatRetentionMode;
              if (nextMode === 'session' || nextMode === '30d' || nextMode === 'forever') {
                void setRetentionMode(nextMode);
              }
            }}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
            aria-label="Chat retention mode"
          >
            <option value="session">Session only</option>
            <option value="30d">30 days</option>
            <option value="forever">Forever</option>
          </select>

          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => {
              void clearHistory();
            }}
          >
            <Trash2 className="size-3" />
            Clear
          </Button>
        </div>
      </header>

      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      ) : null}

      <div className="flex-1 space-y-4 overflow-y-auto pr-1 pb-16">
        {renderedMessages.length > 0 ? (
          renderedMessages
        ) : (
          <div className="rounded-xl border border-dashed border-border/80 bg-card/20 p-4 text-sm text-muted-foreground">
            Start typing below to open chat mode and stream responses.
          </div>
        )}

        {isSending ? (
          <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            Waiting for assistant...
          </p>
        ) : null}
      </div>

      <ConfirmationDialog
        target={confirmationTarget}
        onConfirm={handleConfirmApprove}
        onCancel={() => setConfirmationTarget(null)}
      />
    </div>
  );
};
