import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown, LampDesk, Settings } from 'lucide-react';

import { useTheme } from '../providers/ThemeProvider';

import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { useQuickAddListener } from '../../hooks/useQuickAddListener';
import { cn } from '../../lib/utils';
import {
  selectActiveView,
  selectChatOverlayState,
  selectUnreadProactive,
  useAppStore,
} from '../../stores/appStore';
import {
  selectError,
  selectIsLoading,
  selectTasks,
  useTaskStore,
} from '../../stores/taskStore';
import {
  selectChatActiveConversationId,
  selectChatConversations,
  selectChatIsLoadingConversations,
  useChatStore,
} from '../../stores/chatStore';
import { ChatView } from '../chat/ChatView';
import { ThreadDropdown } from '../chat/ThreadDropdown';
import { NotesView } from '../notes/NotesView';
import { SearchModal } from '../search/SearchModal';
import { SettingsView } from '../settings/SettingsView';
import { InboxView } from '../views/InboxView';
import { TasksView } from '../views/TasksView';
import { TodayView } from '../views/TodayView';
import { ChatInput } from './ChatInput';

import { TitleBar } from './TitleBar';

export const AppShell = () => {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const openPanelRef = useRef<HTMLElement>(null);
  const [chatInputValue, setChatInputValue] = useState('');
  const [threadDropdownOpen, setThreadDropdownOpen] = useState(false);

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
  const chatOverlayState = useAppStore(selectChatOverlayState);
  const unreadProactive = useAppStore(selectUnreadProactive);
  const setView = useAppStore((state) => state.setView);
  const openChatOverlay = useAppStore((state) => state.openChatOverlay);
  const peekChatOverlay = useAppStore((state) => state.peekChatOverlay);

  const fetchTasks = useTaskStore((state) => state.fetchTasks);
  const tasks = useTaskStore(selectTasks);
  const isLoading = useTaskStore(selectIsLoading);
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

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    void initializeChat();
  }, [initializeChat]);

  useEffect(() => {
    const unsubscribe = window.flusk?.app.onBackupRestored(() => {
      window.location.reload();
    });

    return () => {
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

  useQuickAddListener({
    inputRef,
    onPrefill: setChatInputValue,
  });

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
      return <TodayView allTasks={tasks} isLoading={isLoading} error={error} />;
    }

    if (activeView === 'tasks') {
      return <TasksView allTasks={tasks} isLoading={isLoading} error={error} />;
    }

    if (activeView === 'notes') {
      return <NotesView />;
    }

    if (activeView === 'settings') {
      return <SettingsView />;
    }

    return <InboxView allTasks={tasks} isLoading={isLoading} error={error} />;
  }, [activeView, error, isLoading, setView, tasks]);

  const openChatFromOverlay = useCallback(() => {
    openChatOverlay();
  }, [openChatOverlay]);

  const collapseChatOverlay = useCallback(() => {
    setThreadDropdownOpen(false);
    peekChatOverlay();
    clearPendingNoteContext();
    inputRef.current?.blur();
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

  useEffect(() => {
    if (chatOverlayState !== 'open') {
      return;
    }

    const onPointerDown = (event: PointerEvent): void => {
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

  useEffect(() => {
    if (chatOverlayState !== 'open') {
      setThreadDropdownOpen(false);
    }
  }, [chatOverlayState]);

  const isSettingsActive = activeView === 'settings';


  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-background">
      <TitleBar />

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
                    width: 'min(clamp(340px, 30vw, 460px), calc(100vw - 24px))',
                  }}
                  className="pointer-events-auto absolute inset-y-3 right-3 flex min-h-0 flex-col overflow-hidden rounded-xl border border-border/70 bg-card/90 shadow-[0_8px_20px_-14px_rgba(0,0,0,0.6)] backdrop-blur-sm"
                >
                  <header className="relative flex h-9 items-center justify-between border-b border-dashed border-border/50 px-2">
                    <button
                      type="button"
                      className="group flex max-w-[70%] items-center gap-1 rounded px-1.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      onClick={() => setThreadDropdownOpen((open) => !open)}
                    >
                      <span className="truncate font-mono font-medium uppercase tracking-[0.06em]">
                        {activeConversationTitle}
                      </span>
                      <ChevronDown
                        className={cn(
                          'size-3 transition-transform',
                          threadDropdownOpen ? 'rotate-180' : '',
                        )}
                      />
                    </button>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={collapseChatOverlay}
                        className="rounded px-1.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      >
                        Collapse
                      </button>
                    </div>
                    <ThreadDropdown
                      open={threadDropdownOpen}
                      conversations={conversations}
                      activeConversationId={activeConversationId}
                      isLoading={isLoadingConversations}
                      onClose={() => setThreadDropdownOpen(false)}
                      onSelect={(conversationId) => {
                        void setActiveConversation(conversationId);
                      }}
                      onCreate={() => {
                        void createConversation();
                      }}
                      onArchive={(conversationId) => {
                        void archiveConversation(conversationId);
                      }}
                      onDelete={(conversationId) => {
                        void deleteConversation(conversationId);
                      }}
                    />
                  </header>

                  <div className="min-h-0 flex-1 overflow-hidden px-4 py-0">
                    <ChatView onSuggestionClick={handleSuggestionClick} />
                  </div>
                  <div className="border-t border-dashed border-border/50">
                    <ChatInput
                      inputRef={inputRef}
                      value={chatInputValue}
                      onChange={setChatInputValue}
                      onSubmit={handleSubmit}
                    />
                  </div>
                </motion.aside>
              ) : null}
            </AnimatePresence>
          </div>
        </div>

        <div className="no-drag absolute inset-x-3 bottom-3 z-10 flex items-center gap-2">
          <div className="flex shrink-0 items-center gap-1">
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
              <Settings className="size-[15px]" />
            </button>

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
              <LampDesk className="size-[15px]" />
            </button>
          </div>

        </div>
      </div>

      <SearchModal />
    </div>
  );
};
