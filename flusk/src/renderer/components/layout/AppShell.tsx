import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { useQuickAddListener } from '../../hooks/useQuickAddListener';
import {
  selectActiveView,
  selectIsChatMode,
  selectIsMemorySettingsOpen,
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
  const [chatInputValue, setChatInputValue] = useState('');

  const activeView = useAppStore(selectActiveView);
  const isChatMode = useAppStore(selectIsChatMode);
  const isMemorySettingsOpen = useAppStore(selectIsMemorySettingsOpen);
  const closeMemorySettings = useAppStore((state) => state.closeMemorySettings);

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

  const transition = { duration: prefersReducedMotion ? 0.05 : 0.1, ease: 'easeOut' as const };

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

    return <InboxView allTasks={tasks} isLoading={isLoading} error={error} />;
  }, [activeView, error, isLoading, tasks]);

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-background">
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

      {isMemorySettingsOpen ? <SettingsMemory onClose={closeMemorySettings} /> : null}
      <SearchModal />
    </div>
  );
};
