import { useEffect, useMemo, useRef, useState } from 'react';

import { Archive, Plus, Search, Trash2 } from 'lucide-react';

import type { ChatConversationSummary } from '../../../types/chat';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';


type ThreadListViewProps = {
  conversations: ChatConversationSummary[];
  activeConversationId: string | null;
  isLoading: boolean;
  onCollapse: () => void;
  onSelect: (conversationId: string) => void;
  onCreate: () => void;
  onArchive: (conversationId: string) => void;
  onDelete: (conversationId: string) => void;
};

type ConversationGroup = {
  label: string;
  items: ChatConversationSummary[];
};

const formatRelativeTimestamp = (iso: string | null): string => {
  if (!iso) {
    return '';
  }

  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  const diffMs = Date.now() - parsed.getTime();
  const diffMinutes = Math.round(diffMs / (60 * 1000));

  if (Math.abs(diffMinutes) < 60) {
    if (diffMinutes <= 0) {
      return 'just now';
    }
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 7) {
    return `${diffDays}d ago`;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(parsed);
};

const resolveGroupLabel = (iso: string | null): string => {
  if (!iso) {
    return 'Older';
  }

  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) {
    return 'Older';
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
  const startOfWeek = startOfToday - 7 * 24 * 60 * 60 * 1000;
  const startOfMonth = startOfToday - 31 * 24 * 60 * 60 * 1000;

  if (timestamp >= startOfToday) {
    return 'Today';
  }

  if (timestamp >= startOfYesterday) {
    return 'Yesterday';
  }

  if (timestamp >= startOfWeek) {
    return 'This Week';
  }

  if (timestamp >= startOfMonth) {
    return 'This Month';
  }

  return 'Older';
};

const groupConversations = (
  conversations: ChatConversationSummary[],
): ConversationGroup[] => {
  const order = ['Today', 'Yesterday', 'This Week', 'This Month', 'Older'];
  const map = new Map<string, ChatConversationSummary[]>();

  conversations.forEach((conversation) => {
    const label = resolveGroupLabel(conversation.updatedAt ?? conversation.createdAt);
    const existing = map.get(label) ?? [];
    existing.push(conversation);
    map.set(label, existing);
  });

  return order
    .filter((label) => map.has(label))
    .map((label) => ({
      label,
      items: map.get(label) ?? [],
    }));
};

export const ThreadListView = ({
  conversations,
  activeConversationId,
  isLoading,
  onCollapse,
  onSelect,
  onCreate,
  onArchive,
  onDelete,
}: ThreadListViewProps) => {
  const [query, setQuery] = useState('');
  const [cursorIndex, setCursorIndex] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setQuery('');
    setCursorIndex(0);

    const frame = window.requestAnimationFrame(() => {
      searchRef.current?.focus();
      searchRef.current?.select();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (normalized.length === 0) {
      return conversations;
    }

    return conversations.filter((conversation) =>
      conversation.title.toLowerCase().includes(normalized),
    );
  }, [conversations, query]);

  const grouped = useMemo(() => groupConversations(filtered), [filtered]);

  const flatIds = useMemo(
    () => grouped.flatMap((group) => group.items.map((conversation) => conversation.id)),
    [grouped],
  );

  useEffect(() => {
    if (cursorIndex >= flatIds.length) {
      setCursorIndex(flatIds.length > 0 ? flatIds.length - 1 : 0);
    }
  }, [cursorIndex, flatIds.length]);

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      aria-busy={isLoading}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onCollapse();
          return;
        }

        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setCursorIndex((prev) => {
            if (flatIds.length === 0) return 0;
            return Math.min(prev + 1, flatIds.length - 1);
          });
          return;
        }

        if (event.key === 'ArrowUp') {
          event.preventDefault();
          setCursorIndex((prev) => Math.max(prev - 1, 0));
          return;
        }

        if (event.key === 'Enter') {
          const targetId = flatIds[cursorIndex];
          if (targetId) {
            event.preventDefault();
            onSelect(targetId);
          }
        }
      }}
    >
      <div className="border-b border-border/60 p-2">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/70" aria-hidden="true" />
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search threads"
            className="h-8 w-full rounded-md border border-border/60 bg-background/70 pl-7 pr-2 text-xs text-foreground outline-none ring-0 placeholder:text-muted-foreground/70 focus:border-border"
          />
        </label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2 w-full justify-start"
          onClick={() => {
            onCreate();
          }}
        >
          <Plus className="size-3.5" aria-hidden="true" />
          New Thread
        </Button>
      </div>

      <div role="listbox" aria-label="Threads" className="flex-1 overflow-y-auto p-1.5">
        {isLoading ? null : grouped.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">No matching threads.</p>
        ) : (
          grouped.map((group) => (
            <section key={group.label} className="mb-2">
              <h4 className="px-2 pb-1 text-[10px] uppercase tracking-[0.08em] text-muted-foreground/70">
                {group.label}
              </h4>
              <div className="space-y-0.5">
                {group.items.map((conversation) => {
                  const flatIndex = flatIds.indexOf(conversation.id);
                  const isActive = conversation.id === activeConversationId;
                  const isCursor = flatIndex === cursorIndex;
                  const showArchived = Boolean(conversation.archivedAt);

                  return (
                    <div
                      key={conversation.id}
                      role="option"
                      aria-selected={isActive}
                      className={cn(
                        'group flex items-center gap-2 rounded-md px-2 py-1.5',
                        isActive ? 'bg-accent/70' : 'hover:bg-accent/40',
                        isCursor ? 'ring-1 ring-border/70' : '',
                        showArchived ? 'opacity-70' : '',
                      )}
                    >
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => {
                          onSelect(conversation.id);
                        }}
                      >
                        <p className="truncate text-xs text-foreground">{conversation.title}</p>
                        <p className="text-[10px] text-muted-foreground/80">
                          {formatRelativeTimestamp(conversation.updatedAt ?? conversation.createdAt)}
                          {showArchived ? ' \u2022 archived' : ''}
                        </p>
                      </button>

                      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        {!showArchived ? (
                          <button
                            type="button"
                            className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                            onClick={(event) => {
                              event.stopPropagation();
                              onArchive(conversation.id);
                            }}
                            aria-label="Archive thread"
                          >
                            <Archive className="size-3.5" aria-hidden="true" />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          onClick={(event) => {
                            event.stopPropagation();
                            onDelete(conversation.id);
                          }}
                          aria-label="Delete thread"
                        >
                          <Trash2 className="size-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
};
