import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, LampDesk, Settings, X } from 'lucide-react';

import { Tooltip, TooltipContent, TooltipTrigger } from '../ui';
import { ChatPanelSkeleton } from '../ui/loadingShells';
import { useTheme } from '../providers/ThemeProvider';

import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { useMenuActions } from '../../hooks/useMenuActions';
import { useResizablePanel } from '../../hooks/useResizablePanel';
import { isTaskRefreshSuppressed } from '../../lib/editorSaveGuard';
import { createTaskRefreshCoalescer } from '../../lib/taskRefreshCoalescer';
import { cn } from '../../lib/utils';
import {
  selectActiveView,
  selectAiEnabled,
  selectChatOverlayState,
  selectChatView,
  selectUnreadProactive,
  useAppStore,
} from '../../stores/appStore';
import {
  selectError,
  selectTasks,
  useTaskStore,
} from '../../stores/taskStore';
import { useTaskStatusConfigStore } from '../../stores/taskStatusConfigStore';
import {
  selectChatActiveConversationId,
  selectChatConversations,
  selectChatIsLoadingConversations,
  useChatStore,
} from '../../stores/chatStore';
import { selectSearchIsOpen, useSearchStore } from '../../stores/searchStore';
import { findTaskForNavigation, resolveTaskNavigationView } from './taskNavigation';
import { ToastContainer } from '../ui/Toast';
import { TitleBar } from './TitleBar';
import { UpdateBanner } from './UpdateBanner';

import { NotesView } from '../notes/NotesView';
import { SearchModal } from '../search/SearchModal';
import { SettingsView } from '../settings/SettingsView';
import { TodayView } from '../views/TodayView';
import { TasksView } from '../views/TasksView';
import { InboxView } from '../views/InboxView';

const LazyChatView = lazy(async () => {
  const module = await import('../chat/ChatView');
  return { default: module.ChatView };
});

const LazyThreadListView = lazy(async () => {
  const module = await import('../chat/ThreadListView');
  return { default: module.ThreadListView };
});

const LazyChatInput = lazy(async () => {
  const module = await import('./ChatInput');
  return { default: module.ChatInput };
});

export const AppShell = () => {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const openPanelRef = useRef<HTMLElement>(null);
  const { width: chatPanelWidth, isResizing, isResizingRef, handleProps: resizeHandleProps } =
    useResizablePanel({
      panelRef: openPanelRef,
      storageKey: 'untask-chat-width',
      minWidth: 320,
      maxWidth: 680,
      viewportPadding: 80,
    });
  const taskRefreshStatsRef = useRef({ notifications: 0, refreshes: 0 });
  const [chatInputValue, setChatInputValue] = useState('');

  const { resolvedTheme, setTheme } = useTheme();
  const prefersReducedMotion = useReducedMotion();

  const toggleTheme = useCallback(() => {
    const next = resolvedTheme === 'dark' ? 'light' : 'dark';

    // Use View Transitions API for a radial clip-path reveal.
    // The browser snapshots the old UI, we swap the theme, then
    // the new UI is revealed via an expanding circle from the lamp icon.
    const doc = document as Document & {
      startViewTransition?: (cb: () => void) => void;
    };

    if (!doc.startViewTransition || prefersReducedMotion) {
      setTheme(next);
      return;
    }

    doc.startViewTransition(() => {
      flushSync(() => setTheme(next));
    });
  }, [resolvedTheme, setTheme, prefersReducedMotion]);

  const activeView = useAppStore(selectActiveView);
  const aiEnabled = useAppStore(selectAiEnabled);
  const chatOverlayState = useAppStore(selectChatOverlayState);
  const chatView = useAppStore(selectChatView);
  const unreadProactive = useAppStore(selectUnreadProactive);
  const setView = useAppStore((state) => state.setView);
  const openChatOverlay = useAppStore((state) => state.openChatOverlay);
  const peekChatOverlay = useAppStore((state) => state.peekChatOverlay);
  const setChatView = useAppStore((state) => state.setChatView);
  const isSearchOpen = useSearchStore(selectSearchIsOpen);

  const fetchStatusConfig = useTaskStatusConfigStore((s) => s.fetchConfig);
  const tasks = useTaskStore(selectTasks);
  const error = useTaskStore(selectError);
  const initializeChat = useChatStore((state) => state.initialize);
  const sendMessage = useChatStore((state) => state.sendMessage);
  const conversations = useChatStore(selectChatConversations);
  const activeConversationId = useChatStore(selectChatActiveConversationId);
  const isLoadingConversations = useChatStore(selectChatIsLoadingConversations);
  const createConversation = useChatStore((state) => state.createConversation);
  const setActiveConversation = useChatStore((state) => state.setActiveConversation);
  const archiveConversation = useChatStore((state) => state.archiveConversation);
  const deleteConversation = useChatStore((state) => state.deleteConversation);
  const clearPendingNoteContext = useChatStore((state) => state.clearPendingNoteContext);

  useFocusTrap(openPanelRef, chatOverlayState === 'open');

  // Store focus target before chat overlay opens, restore when it closes
  const preChatFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (chatOverlayState === 'open') {
      preChatFocusRef.current = document.activeElement as HTMLElement | null;
    }
  }, [chatOverlayState]);

  useEffect(() => {
    void fetchStatusConfig();
  }, [fetchStatusConfig]);

  useEffect(() => {
    void initializeChat();
  }, [initializeChat]);

  useEffect(() => {
    const unsubscribe = window.untask?.app.onBackupRestored(() => {
      window.location.reload();
    });

    return () => {
      unsubscribe?.();
    };
  }, []);

  // Listen for notification-driven task navigation (also used by quick-add)
  useEffect(() => {
    const unsubscribe = window.untask?.tasks.onTaskNavigate(async (payload) => {
      if (!payload?.taskId) return;

      const task = await findTaskForNavigation(
        payload.taskId,
        () => useTaskStore.getState().tasks,
        () => useTaskStore.getState().refreshTasks(),
      );
      const resolvedView = resolveTaskNavigationView(task);

      setView(resolvedView);
      useTaskStore.getState().selectTask(task ? payload.taskId : null);
    });

    return () => {
      unsubscribe?.();
    };
  }, [setView]);

  // Refresh task list when tasks are changed from another window (e.g. quick add)
  useEffect(() => {
    const metricCollector = import.meta.env.DEV
      ? (event: 'notify' | 'refresh') => {
        const stats = taskRefreshStatsRef.current;
        if (event === 'notify') {
          stats.notifications += 1;
          if (stats.notifications % 25 === 0) {
            const saved = stats.notifications - stats.refreshes;
            console.debug(
              `[task-refresh] notifications=${stats.notifications} refreshes=${stats.refreshes} coalesced=${saved}`,
            );
          }
          return;
        }
        stats.refreshes += 1;
      }
      : undefined;

    const coalescer = createTaskRefreshCoalescer(
      async () => {
        await useTaskStore.getState().refreshTasks();
      },
      {
        cooldownMs: 120,
        onMetric: metricCollector,
      },
    );

    const unsubscribe = window.untask?.tasks.onTaskDataChanged(() => {
      // Skip refresh when the change originated from an editor body auto-save
      // in this window — the editor already has the correct content and a
      // full store refresh would steal focus from the BlockNote editor.
      if (!isTaskRefreshSuppressed()) {
        coalescer.notifyChange();
      }
    });

    return () => {
      coalescer.dispose();
      unsubscribe?.();
    };
  }, []);

  const clearInput = useCallback(() => {
    setChatInputValue('');
  }, []);

  const handleSuggestionClick = useCallback((prefill: string) => {
    setChatInputValue(prefill);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, []);

  useKeyboardShortcuts({
    inputRef,
    inputValue: chatInputValue,
    clearInput,
    onToggleTheme: toggleTheme,
  });

  useMenuActions();

  useEffect(() => {
    if (activeView !== 'notes') {
      clearPendingNoteContext();
    }
  }, [activeView, clearPendingNoteContext]);

  // F-4: Place focus on primary element when view changes
  useEffect(() => {
    const frameId = requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('[data-primary-focusable]')?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frameId);
  }, [activeView]);

  const handleSubmit = useCallback(() => {
    const content = chatInputValue.trim();

    if (content.length === 0) {
      return;
    }

    setChatInputValue('');
    void sendMessage(content);
  }, [chatInputValue, sendMessage]);

  const transition = { duration: 0, ease: 'easeOut' as const };
  const overlayTransition = { duration: 0, ease: 'easeOut' as const };

  const viewVariants = {
    enter: { opacity: 0 },
    center: { opacity: 1 },
    exit: { opacity: 0 },
  };

  const activeViewComponent = useMemo(() => {
    if (activeView === 'today') {
      return <TodayView allTasks={tasks} error={error} />;
    }

    if (activeView === 'tasks') {
      return <TasksView allTasks={tasks} error={error} />;
    }

    if (activeView === 'notes') {
      return <NotesView />;
    }

    if (activeView === 'settings') {
      return <SettingsView />;
    }

    return <InboxView allTasks={tasks} error={error} />;
  }, [activeView, error, tasks]);

  const openChatFromOverlay = useCallback(() => {
    openChatOverlay();
  }, [openChatOverlay]);

  const collapseChatOverlay = useCallback(() => {
    peekChatOverlay();
    clearPendingNoteContext();
    inputRef.current?.blur();
    requestAnimationFrame(() => {
      const saved = preChatFocusRef.current;
      if (saved && document.contains(saved)) {
        saved.focus();
      } else {
        document.querySelector<HTMLElement>('[data-primary-focusable]')?.focus();
      }
      preChatFocusRef.current = null;
    });
  }, [clearPendingNoteContext, peekChatOverlay]);

  const activeConversationTitle = useMemo(() => {
    if (!activeConversationId) {
      return 'New Thread';
    }

    return (
      conversations.find((conversation) => conversation.id === activeConversationId)?.title ??
      'New Thread'
    );
  }, [activeConversationId, conversations]);

  // Focus chat input when panel opens
  useEffect(() => {
    if (chatOverlayState !== 'open') {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    const timeoutId = window.setTimeout(
      () => {
        inputRef.current?.focus();
      },
      prefersReducedMotion ? 90 : 230,
    );

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timeoutId);
    };
  }, [chatOverlayState, prefersReducedMotion]);

  // Focus chat input when switching to conversation view while panel is already open
  useEffect(() => {
    if (chatOverlayState === 'open' && chatView === 'conversation') {
      const frameId = window.requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
      return () => window.cancelAnimationFrame(frameId);
    }
  }, [chatView, chatOverlayState]);

  useEffect(() => {
    if (chatOverlayState !== 'open') {
      return;
    }

    const onPointerDown = (event: PointerEvent): void => {
      if (isResizingRef.current) return;

      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (openPanelRef.current?.contains(target)) {
        return;
      }

      collapseChatOverlay();
    };

    window.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [chatOverlayState, collapseChatOverlay]);

  const handleThreadSelect = useCallback(
    (conversationId: string) => {
      void setActiveConversation(conversationId);
      setChatView('conversation');
    },
    [setActiveConversation, setChatView],
  );

  const handleThreadCreate = useCallback(async () => {
    await createConversation();
    setChatView('conversation');
  }, [createConversation, setChatView]);

  const isSettingsActive = activeView === 'settings';


  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-background">
      <TitleBar />
      <UpdateBanner />

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <motion.section
          initial={false}
          animate={{ width: '100%' }}
          transition={transition}
          className="h-full min-h-0 min-w-0"
        >
          <AnimatePresence initial={false} mode="wait">
            <motion.section
              key={activeView}
              variants={viewVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={transition}
              className="h-full"
            >
              {activeViewComponent}
            </motion.section>
          </AnimatePresence>
        </motion.section>

        {aiEnabled ? (
          <div className="pointer-events-none absolute inset-0 z-20">
            <div className="absolute inset-0">
              <AnimatePresence initial={false} mode="wait">
                {chatOverlayState === 'peek' ? (
                  <motion.button
                    key="chat-overlay-peek"
                    type="button"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={overlayTransition}
                    className="pointer-events-auto absolute bottom-3 right-3 flex h-8 w-14 items-center justify-center rounded-lg border border-border/60 bg-card/90 text-[10px] font-medium tracking-wide text-muted-foreground shadow-lg backdrop-blur-sm transition-colors hover:text-foreground"
                    aria-label="Open chat"
                    onClick={openChatFromOverlay}
                  >
                    Chat
                    {unreadProactive ? (
                      <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-destructive" />
                    ) : null}
                  </motion.button>
                ) : null}

                {chatOverlayState === 'open' ? (
                  <motion.aside
                    ref={openPanelRef}
                    key="chat-overlay-open"
                    initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: 10 }}
                    transition={overlayTransition}
                    style={{
                      width:
                        chatPanelWidth !== null
                          ? `${chatPanelWidth}px`
                          : 'min(clamp(340px, 30vw, 460px), calc(100vw - 24px))',
                    }}
                    className={cn(
                      'pointer-events-auto absolute inset-y-3 right-3 flex min-h-0 flex-col overflow-hidden rounded-xl border border-border/70 bg-card/90 shadow-[0_8px_20px_-14px_rgba(0,0,0,0.6)] backdrop-blur-sm',
                      isResizing && 'select-none',
                    )}
                  >
                    {/* Resize handle — left edge */}
                    <div
                      {...resizeHandleProps}
                      className={cn(
                        'absolute inset-y-0 -left-0.5 z-10 w-2 cursor-resize-horizontal',
                        'before:absolute before:inset-y-2 before:left-[3px] before:w-px before:rounded-full',
                        'before:bg-border/0 before:transition-colors before:duration-150',
                        isResizing ? 'before:bg-border/70' : 'hover:before:bg-border/40',
                      )}
                    />

                    {/* Header: adapts based on chatView */}
                    <header className="flex h-9 items-center justify-between border-b border-dashed border-border/50 px-2">
                      <AnimatePresence mode="wait" initial={false}>
                        {chatView === 'threads' ? (
                          <motion.span
                            key="threads-label"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.1 }}
                            className="truncate px-1.5 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground"
                          >
                            Threads
                          </motion.span>
                        ) : (
                          <motion.button
                            key="back-button"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.1 }}
                            type="button"
                            aria-label="Back to threads"
                            className="group flex max-w-[70%] items-center gap-1 rounded px-1.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                            onClick={() => setChatView('threads')}
                          >
                            <ArrowLeft className="size-3" aria-hidden="true" />
                            <span className="truncate font-mono font-medium uppercase tracking-[0.06em]">
                              {activeConversationTitle}
                            </span>
                          </motion.button>
                        )}
                      </AnimatePresence>
                      <button
                        type="button"
                        onClick={collapseChatOverlay}
                        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        aria-label="Close chat"
                      >
                        <X className="size-4" aria-hidden="true" />
                      </button>
                    </header>

                    {/* Body: switches between thread list and conversation */}
                    <AnimatePresence mode="wait">
                      {chatView === 'threads' ? (
                        <motion.div
                          key="threads"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0 }}
                          className="flex min-h-0 flex-1 flex-col overflow-hidden"
                        >
                          <Suspense fallback={<ChatPanelSkeleton variant="threads" className="min-h-0 flex-1" />}>
                            <LazyThreadListView
                              conversations={conversations}
                              activeConversationId={activeConversationId}
                              isLoading={isLoadingConversations}
                              onCollapse={collapseChatOverlay}
                              onSelect={handleThreadSelect}
                              onCreate={() => {
                                void handleThreadCreate();
                              }}
                              onArchive={(conversationId) => {
                                void archiveConversation(conversationId);
                              }}
                              onDelete={(conversationId) => {
                                void deleteConversation(conversationId);
                              }}
                            />
                          </Suspense>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="conversation"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0 }}
                          className="flex min-h-0 flex-1 flex-col overflow-hidden"
                        >
                          <div className="min-h-0 flex-1 overflow-hidden px-4 py-0">
                            <Suspense fallback={<ChatPanelSkeleton variant="conversation" className="h-full w-full" />}>
                              <LazyChatView onSuggestionClick={handleSuggestionClick} />
                            </Suspense>
                          </div>
                          <div className="border-t border-dashed border-border/50">
                            <Suspense fallback={<ChatPanelSkeleton variant="input" className="h-[84px]" />}>
                              <LazyChatInput
                                inputRef={inputRef}
                                value={chatInputValue}
                                onChange={setChatInputValue}
                                onSubmit={handleSubmit}
                              />
                            </Suspense>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.aside>
                ) : null}
              </AnimatePresence>
            </div>
          </div>
        ) : null}

        <div className="no-drag pointer-events-none absolute inset-x-3 bottom-3 z-10 flex items-center gap-2">
          <div className="pointer-events-auto flex shrink-0 items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setView(isSettingsActive ? 'today' : 'settings')}
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
                    isSettingsActive
                      ? 'bg-accent text-foreground'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                  )}
                  aria-label="Settings"
                >
                  <Settings className="size-[15px]" aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Settings</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={toggleTheme}
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
                    resolvedTheme === 'light'
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                  )}
                  aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
                >
                  <LampDesk className="size-[15px]" aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {resolvedTheme === 'dark' ? 'Light mode' : 'Dark mode'}
              </TooltipContent>
            </Tooltip>
          </div>

        </div>
      </div>

      <AnimatePresence>
        {isSearchOpen ? <SearchModal key="search-modal" /> : null}
      </AnimatePresence>
      <ToastContainer />
    </div>
  );
};
