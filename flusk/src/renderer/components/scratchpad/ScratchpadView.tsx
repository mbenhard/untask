import { useCallback, useEffect, useRef, useState } from 'react';

import type { BlockNoteEditor } from '@blocknote/core';
import {
  type DefaultReactSuggestionItem,
  getDefaultReactSlashMenuItems,
} from '@blocknote/react';
import { CheckSquare, Sparkles } from 'lucide-react';

import {
  selectScratchpadContent,
  selectScratchpadError,
  selectScratchpadIsDirty,
  selectScratchpadIsLoading,
  selectScratchpadIsSaving,
  selectScratchpadIsSendingToAI,
  useScratchpadStore,
} from '../../stores/scratchpadStore';
import { useTaskStore } from '../../stores/taskStore';
import { BlockEditor } from '../editor/BlockEditor';
import { Button } from '../ui/button';

const createTaskFromCursor = async (editor: BlockNoteEditor): Promise<void> => {
  const block = editor.getTextCursorPosition().block;
  const rawTitle = editor.blocksToMarkdownLossy([block]).trim();
  const title = rawTitle.replace(/^(#+\s+|[-*]\s+|\d+\.\s+)/, '').trim();

  if (!title) {
    return;
  }

  await useTaskStore.getState().createTask({ title, status: 'inbox' });
};

const createSendToAiItem = (editor: BlockNoteEditor): DefaultReactSuggestionItem => ({
  title: 'Send to AI',
  onItemClick: () => {
    const markdown = editor.blocksToMarkdownLossy(editor.document).trim();

    if (!markdown) {
      return;
    }

    void useScratchpadStore.getState().sendToAI(markdown);
  },
  aliases: ['send', 'ai'],
  group: 'Flusk',
  icon: <Sparkles size={18} />,
  subtext: 'Send all notes to AI chat',
});

const createTaskItem = (editor: BlockNoteEditor): DefaultReactSuggestionItem => ({
  title: 'Create Task',
  onItemClick: () => {
    void createTaskFromCursor(editor);
  },
  aliases: ['task', 'todo'],
  group: 'Flusk',
  icon: <CheckSquare size={18} />,
  subtext: 'Create a task from this block',
});

const getSlashMenuItems = (editor: BlockNoteEditor): DefaultReactSuggestionItem[] => [
  ...getDefaultReactSlashMenuItems(editor),
  createTaskItem(editor),
  createSendToAiItem(editor),
];

export const ScratchpadView = () => {
  const content = useScratchpadStore(selectScratchpadContent);
  const isDirty = useScratchpadStore(selectScratchpadIsDirty);
  const isLoading = useScratchpadStore(selectScratchpadIsLoading);
  const isSaving = useScratchpadStore(selectScratchpadIsSaving);
  const isSendingToAI = useScratchpadStore(selectScratchpadIsSendingToAI);
  const error = useScratchpadStore(selectScratchpadError);
  const load = useScratchpadStore((state) => state.load);
  const setContent = useScratchpadStore((state) => state.setContent);
  const sendToAI = useScratchpadStore((state) => state.sendToAI);

  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let isActive = true;

    const runLoad = async () => {
      await load();
      if (isActive) {
        setInitialLoadComplete(true);
      }
    };

    void runLoad();

    return () => {
      isActive = false;
    };
  }, [load]);

  const handleChange = useCallback(
    (json: string) => {
      setContent(json);

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

      saveTimerRef.current = setTimeout(() => {
        void useScratchpadStore.getState().save();
      }, 2000);
    },
    [setContent],
  );

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

      const state = useScratchpadStore.getState();
      if (state.isDirty) {
        void state.save();
      }
    };
  }, []);

  const handleSendToAI = useCallback(async () => {
    // We can't easily extract markdown from shared BlockEditor here,
    // so just delegate to the store which uses its content.
    await sendToAI();
  }, [sendToAI]);

  if (isLoading && !initialLoadComplete) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading notes...</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center justify-end px-3 py-2">
        <span className="mr-auto text-[10px] tracking-[0.01em] text-muted-foreground">
          {isDirty ? 'unsaved' : isSaving ? 'saving' : ''}
        </span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => {
              void handleSendToAI();
            }}
            disabled={isSendingToAI}
          >
            <Sparkles size={12} />
            {isSendingToAI ? 'sending' : 'send'}
          </Button>
        </div>
      </header>

      {error ? (
        <p className="mx-3 mt-1 text-[11px] text-destructive">
          {error}
        </p>
      ) : null}

      {initialLoadComplete ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <BlockEditor
            content={content}
            onChange={handleChange}
            className="flusk-notes-editor"
            getSlashMenuItems={getSlashMenuItems}
          />
        </div>
      ) : null}
    </div>
  );
};
