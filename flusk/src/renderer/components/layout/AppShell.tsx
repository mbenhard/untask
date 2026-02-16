import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Settings } from 'lucide-react';

import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { useQuickAddListener } from '../../hooks/useQuickAddListener';
import { cn } from '../../lib/utils';
import {
  selectActiveView,
  selectChatOverlayState,
  selectIsChatOverlayVisible,
  useAppStore,
} from '../../stores/appStore';
import {
  selectError,
  selectIsLoading,
  selectTasks,
  useTaskStore,
} from '../../stores/taskStore';
import { useChatStore } from '../../stores/chatStore';
import { ChatView } from '../chat/ChatView';
import { ScratchpadView } from '../scratchpad/ScratchpadView';
import { SearchModal } from '../search/SearchModal';
import { SettingsMemory } from '../settings/SettingsMemory';
import { InboxView } from '../views/InboxView';
import { TasksView } from '../views/TasksView';
import { TodayView } from '../views/TodayView';
import { ChatInput } from './ChatInput';
import { TitleBar } from './TitleBar';

export const AppShell = () => {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const openPanelRef = useRef<HTMLElement>(null);
  const [chatInputValue, setChatInputValue] = useState('');

  const activeView = useAppStore(selectActiveView);
  const chatOverlayState = useAppStore(selectChatOverlayState);
  const isChatOverlayVisible = useAppStore(selectIsChatOverlayVisible);
  const setView = useAppStore((state) => state.setView);
  const openChatOverlay = useAppStore((state) => state.openChatOverlay);
  const peekChatOverlay = useAppStore((state) => state.peekChatOverlay);
  const hideChatOverlay = useAppStore((state) => state.hideChatOverlay);

  const fetchTasks = useTaskStore((state) => state.fetchTasks);
  const tasks = useTaskStore(selectTasks);
  const isLoading = useTaskStore(selectIsLoading);
  const error = useTaskStore(selectError);
  const initializeChat = useChatStore((state) => state.initialize);
  const sendMessage = useChatStore((state) => state.sendMessage);

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

  useKeyboardShortcuts({
    inputRef,
    inputValue: chatInputValue,
    clearInput,
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

  const prefersReducedMotion = useReducedMotion();

  const transition = { duration: prefersReducedMotion ? 0.1 : 0.2, ease: 'easeOut' as const };
  const overlayTransition = {
    duration: prefersReducedMotion ? 0.1 : 0.2,
    ease: 'easeOut' as const,
  };

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

    if (activeView === 'scratchpad') {
      return <ScratchpadView />;
    }

    if (activeView === 'settings') {
      return <SettingsMemory />;
    }

    return <InboxView allTasks={tasks} isLoading={isLoading} error={error} />;
  }, [activeView, error, isLoading, setView, tasks]);

  const openChatFromOverlay = useCallback(() => {
    openChatOverlay();
  }, [openChatOverlay]);

  const collapseChatOverlay = useCallback(() => {
    peekChatOverlay();
    inputRef.current?.blur();
  }, [peekChatOverlay]);

  const hideChatPanel = useCallback(() => {
    hideChatOverlay();
    inputRef.current?.blur();
  }, [hideChatOverlay]);

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

        <AnimatePresence initial={false}>
          {isChatOverlayVisible ? (
            <motion.div
              key="chat-overlay-layer"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={overlayTransition}
              className="pointer-events-none absolute inset-0 z-20"
            >
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
                      <header className="flex h-9 items-center justify-between border-b border-border/60 px-2">
                        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                          Chat
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={collapseChatOverlay}
                            className="rounded px-1.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                          >
                            Collapse
                          </button>
                          <button
                            type="button"
                            onClick={hideChatPanel}
                            className="rounded px-1.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                          >
                            Hide
                          </button>
                        </div>
                      </header>

                      <div className="min-h-0 flex-1 overflow-hidden p-4">
                        <ChatView />
                      </div>
                      <div className="border-t border-border/60">
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
            </motion.div>
          ) : null}
        </AnimatePresence>

        <button
          type="button"
          onClick={() => setView(isSettingsActive ? 'today' : 'settings')}
          className={cn(
            'no-drag absolute bottom-3 left-3 z-10 flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
            isSettingsActive
              ? 'bg-accent text-foreground'
              : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
          )}
          aria-label="Settings"
        >
          <Settings className="size-[15px]" />
        </button>
      </div>

      <SearchModal />
    </div>
  );
};
