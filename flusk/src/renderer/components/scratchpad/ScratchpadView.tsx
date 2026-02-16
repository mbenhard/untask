import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';

import { type Block, type BlockNoteEditor, type PartialBlock } from '@blocknote/core';
import { filterSuggestionItems } from '@blocknote/core/extensions';
import '@blocknote/core/fonts/inter.css';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/mantine/style.css';
import {
  type DefaultReactSuggestionItem,
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
  useCreateBlockNote,
} from '@blocknote/react';
import { CheckSquare, Sparkles } from 'lucide-react';

import {
  selectScratchpadContent,
  selectScratchpadError,
  selectScratchpadIsDirty,
  selectScratchpadIsLegacyMarkdown,
  selectScratchpadIsLoading,
  selectScratchpadIsSaving,
  selectScratchpadIsSendingToAI,
  useScratchpadStore,
} from '../../stores/scratchpadStore';
import { useTaskStore } from '../../stores/taskStore';
import { useTheme } from '../providers/ThemeProvider';
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

const parseStoredBlocks = (content: string): PartialBlock[] | null => {
  if (!content.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(content) as Block[];
    if (!Array.isArray(parsed)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
};

export const ScratchpadView = () => {
  const { resolvedTheme } = useTheme();
  const content = useScratchpadStore(selectScratchpadContent);
  const isLegacyMarkdown = useScratchpadStore(selectScratchpadIsLegacyMarkdown);
  const isDirty = useScratchpadStore(selectScratchpadIsDirty);
  const isLoading = useScratchpadStore(selectScratchpadIsLoading);
  const isSaving = useScratchpadStore(selectScratchpadIsSaving);
  const isSendingToAI = useScratchpadStore(selectScratchpadIsSendingToAI);
  const error = useScratchpadStore(selectScratchpadError);
  const load = useScratchpadStore((state) => state.load);
  const setContent = useScratchpadStore((state) => state.setContent);
  const sendToAI = useScratchpadStore((state) => state.sendToAI);

  const editor = useCreateBlockNote();
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const hasHydratedEditorRef = useRef(false);
  const isHydratingEditorRef = useRef(false);
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

  useEffect(() => {
    if (!initialLoadComplete || hasHydratedEditorRef.current) {
      return;
    }

    hasHydratedEditorRef.current = true;

    if (!content.trim()) {
      return;
    }

    const applyBlocks = (blocks: PartialBlock[]): void => {
      isHydratingEditorRef.current = true;
      editor.replaceBlocks(editor.document, blocks);
      queueMicrotask(() => {
        isHydratingEditorRef.current = false;
      });
    };

    if (isLegacyMarkdown) {
      const blocks = editor.tryParseMarkdownToBlocks(content);
      applyBlocks(blocks);

      const convertedJson = JSON.stringify(editor.document);
      setContent(convertedJson);
      void useScratchpadStore.getState().save();
      return;
    }

    const blocks = parseStoredBlocks(content);
    if (!blocks) {
      return;
    }

    applyBlocks(blocks);
  }, [content, editor, initialLoadComplete, isLegacyMarkdown, setContent]);

  const handleEditorChange = useCallback(() => {
    if (isHydratingEditorRef.current) {
      return;
    }

    const json = JSON.stringify(editor.document);
    setContent(json);

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      void useScratchpadStore.getState().save();
    }, 2000);
  }, [editor, setContent]);

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
    const markdown = editor.blocksToMarkdownLossy(editor.document).trim();
    if (!markdown) {
      return;
    }

    await sendToAI(markdown);
  }, [editor, sendToAI]);

  const handleEditorSurfaceMouseDown = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const shouldFocusSurface =
      target === event.currentTarget ||
      target.classList.contains('bn-container') ||
      target.classList.contains('bn-editor');

    if (!shouldFocusSurface) {
      return;
    }

    event.preventDefault();
    editor.focus();
    const lastBlock = editor.document[editor.document.length - 1];
    if (lastBlock) {
      editor.setTextCursorPosition(lastBlock, 'end');
    }
  }, [editor]);

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

      <div
        className="flusk-notes-editor min-h-0 flex-1 overflow-y-auto"
        onMouseDown={handleEditorSurfaceMouseDown}
      >
        <BlockNoteView editor={editor} theme={resolvedTheme} onChange={handleEditorChange} slashMenu={false}>
          <SuggestionMenuController
            triggerCharacter="/"
            getItems={async (query) => filterSuggestionItems(getSlashMenuItems(editor), query)}
          />
        </BlockNoteView>
      </div>
    </div>
  );
};
