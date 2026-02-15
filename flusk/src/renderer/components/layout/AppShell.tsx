import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import {
  APP_VIEW_ORDER,
  type AppView,
  selectActiveView,
  selectIsChatMode,
  selectPreviousViewIndex,
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
import { InboxView } from '../views/InboxView';
import { ProjectsView } from '../views/ProjectsView';
import { TodayView } from '../views/TodayView';
import { ChatInput } from './ChatInput';
import { TitleBar } from './TitleBar';

const getViewIndex = (view: AppView): number => APP_VIEW_ORDER.indexOf(view);

const getDirection = (activeView: AppView, previousViewIndex: number): number => {
  const activeViewIndex = getViewIndex(activeView);

  if (activeViewIndex === previousViewIndex) {
    return 0;
  }

  return activeViewIndex > previousViewIndex ? 1 : -1;
};

export const AppShell = (): JSX.Element => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [chatInputValue, setChatInputValue] = useState('');

  const activeView = useAppStore(selectActiveView);
  const previousViewIndex = useAppStore(selectPreviousViewIndex);
  const isChatMode = useAppStore(selectIsChatMode);

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

  const clearInput = useCallback(() => {
    setChatInputValue('');
  }, []);

  useKeyboardShortcuts({
    inputRef,
    inputValue: chatInputValue,
    clearInput,
  });

  const handleSubmit = useCallback(() => {
    const content = chatInputValue.trim();

    if (content.length === 0) {
      return;
    }

    setChatInputValue('');
    void sendMessage(content);
  }, [chatInputValue, sendMessage]);

  const transitionDirection = useMemo(
    () => getDirection(activeView, previousViewIndex),
    [activeView, previousViewIndex],
  );

  const prefersReducedMotion = useReducedMotion();

  const transition = prefersReducedMotion
    ? { duration: 0.12, ease: 'easeOut' as const }
    : { duration: 0.2, ease: 'easeOut' as const };

  const viewVariants = prefersReducedMotion
    ? {
        enter: { opacity: 0 },
        center: { opacity: 1 },
        exit: { opacity: 0 },
      }
    : {
        enter: (direction: number) => ({ x: direction * 200, opacity: 0 }),
        center: { x: 0, opacity: 1 },
        exit: (direction: number) => ({ x: direction * -200, opacity: 0 }),
      };

  const activeViewComponent = useMemo((): JSX.Element => {
    if (activeView === 'today') {
      return <TodayView allTasks={tasks} isLoading={isLoading} error={error} />;
    }

    if (activeView === 'projects') {
      return <ProjectsView allTasks={tasks} isLoading={isLoading} error={error} />;
    }

    return <InboxView allTasks={tasks} isLoading={isLoading} error={error} />;
  }, [activeView, error, isLoading, tasks]);

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[var(--radius-window)] border border-border bg-background">
      <TitleBar />

      <div className="relative flex-1 overflow-hidden pb-14">
        <AnimatePresence initial={false} mode="wait">
          {isChatMode ? (
            <motion.section
              key="chat-mode"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={transition}
              className="h-full overflow-y-auto p-4"
            >
              <ChatView />
            </motion.section>
          ) : (
            <motion.section
              key={activeView}
              custom={transitionDirection}
              variants={viewVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={transition}
              className="h-full"
            >
              {activeViewComponent}
            </motion.section>
          )}
        </AnimatePresence>

        <ChatInput
          className="absolute inset-x-0 bottom-0"
          inputRef={inputRef}
          value={chatInputValue}
          onChange={setChatInputValue}
          onSubmit={handleSubmit}
        />
      </div>
    </div>
  );
};
