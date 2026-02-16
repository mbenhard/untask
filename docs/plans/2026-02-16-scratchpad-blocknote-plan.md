# Scratchpad BlockNote Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace `@uiw/react-md-editor` with BlockNote for a Notion-like inline editing scratchpad, promoted from a slide-up panel to a full app view with custom `/task` and `/send` slash menu commands.

**Architecture:** The scratchpad stores BlockNote JSON blocks in the existing `scratchpad.content` TEXT column (no migration). Legacy markdown is auto-converted on first load. The component becomes a routable full view in `AppShell` alongside today/projects/inbox/chat. Custom slash menu items integrate with existing task and chat stores.

**Tech Stack:** BlockNote (`@blocknote/core`, `@blocknote/react`, `@blocknote/mantine`), Zustand, Electron IPC (unchanged)

---

## Task 1: Install BlockNote and remove old editor

**Files:**
- Modify: `flusk/package.json`

**Step 1: Install BlockNote packages**

Run:
```bash
cd flusk && npm install @blocknote/core @blocknote/react @blocknote/mantine
```

Expected: Clean install, packages added to `dependencies` in `package.json`.

**Step 2: Uninstall old markdown editor**

Run:
```bash
cd flusk && npm uninstall @uiw/react-md-editor
```

Expected: `@uiw/react-md-editor` removed from `package.json`.

**Step 3: Verify the app still builds**

Run:
```bash
cd flusk && npx tsc --noEmit -p tsconfig.renderer.json 2>&1 | head -30
```

Expected: Type errors in `Scratchpad.tsx` (references removed package). That's expected — we'll fix it in Task 3.

**Step 4: Commit**

```bash
git add flusk/package.json flusk/package-lock.json
git commit -m "chore: swap @uiw/react-md-editor for @blocknote/core, react, mantine"
```

---

## Task 2: Add `scratchpad` to app view state and navigation

**Files:**
- Modify: `flusk/src/renderer/stores/appStore.ts`
- Modify: `flusk/src/renderer/components/layout/TitleBar.tsx`
- Modify: `flusk/src/renderer/components/layout/AppShell.tsx`
- Modify: `flusk/src/renderer/hooks/useKeyboardShortcuts.ts`

### Step 1: Add `scratchpad` to `APP_VIEW_ORDER` and `AppView`

In `flusk/src/renderer/stores/appStore.ts`, add `'scratchpad'` to the view order array:

```typescript
export const APP_VIEW_ORDER = ['today', 'projects', 'inbox', 'scratchpad'] as const;
```

No other changes to the store — `setView` already accepts any `AppView`.

### Step 2: Add scratchpad tab to TitleBar

In `flusk/src/renderer/components/layout/TitleBar.tsx`:

1. Add `'scratchpad'` to `TAB_LABELS`:

```typescript
const TAB_LABELS: Record<AppView, string> = {
  today: 'Today',
  projects: 'Projects',
  inbox: 'Inbox',
  scratchpad: 'Notes',
};
```

2. Remove the standalone scratchpad icon button from the right side of the title bar (the `<button>` with `<NotebookPen>` icon, `toggleScratchpad`, and dirty dot). The scratchpad is now a tab, not a toggle. Remove the `useScratchpadStore` imports from this file.

### Step 3: Add ScratchpadView to AppShell

In `flusk/src/renderer/components/layout/AppShell.tsx`:

1. Remove the `<Scratchpad />` overlay component and its import.
2. Add a new `ScratchpadView` import (we'll create it in Task 3):

```typescript
import { ScratchpadView } from '../scratchpad/ScratchpadView';
```

3. In the `activeViewComponent` memo, add the scratchpad case:

```typescript
const activeViewComponent = useMemo(() => {
  if (activeView === 'today') {
    return <TodayView allTasks={tasks} isLoading={isLoading} error={error} />;
  }
  if (activeView === 'projects') {
    return <ProjectsView allTasks={tasks} isLoading={isLoading} error={error} />;
  }
  if (activeView === 'scratchpad') {
    return <ScratchpadView />;
  }
  return <InboxView allTasks={tasks} isLoading={isLoading} error={error} />;
}, [activeView, error, isLoading, tasks]);
```

### Step 4: Update keyboard shortcut Cmd+N

In `flusk/src/renderer/hooks/useKeyboardShortcuts.ts`:

1. Replace the `Cmd+N` handler. Instead of toggling the scratchpad panel, navigate to the scratchpad view:

```typescript
if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') {
  event.preventDefault();
  setView('scratchpad');
  return;
}
```

2. Remove `toggleScratchpad`, `closeScratchpad`, `isScratchpadOpen`, and `isScratchpadOpenRef` — no longer needed.

3. Remove the Escape layer for scratchpad (Layer 1 in the Escape handler).

4. Remove `useScratchpadStore` import.

5. The `n` shortcut for new task (lines 185-195): Update the guard to also exclude scratchpad view:

```typescript
if (
  event.key.toLowerCase() === 'n' &&
  (activeViewRef.current === 'today' || activeViewRef.current === 'inbox') &&
  !isChatModeRef.current &&
  !isMemorySettingsOpenRef.current &&
  !isSearchOpenRef.current
) {
```

(This already works since scratchpad view isn't `today` or `inbox`, but removing the `isScratchpadOpen` guard keeps it clean.)

### Step 5: Commit

```bash
git add flusk/src/renderer/stores/appStore.ts flusk/src/renderer/components/layout/TitleBar.tsx flusk/src/renderer/components/layout/AppShell.tsx flusk/src/renderer/hooks/useKeyboardShortcuts.ts
git commit -m "feat: add scratchpad as full app view with tab navigation"
```

---

## Task 3: Rewrite scratchpad store for BlockNote JSON

**Files:**
- Modify: `flusk/src/renderer/stores/scratchpadStore.ts`
- Modify: `flusk/src/renderer/stores/scratchpadStore.test.ts`

### Step 1: Update the store type and logic

The store changes:
- `content` becomes `string` — still a string, but now holds JSON-stringified BlockNote blocks (or legacy markdown on first load).
- Add `isLegacyMarkdown: boolean` flag to signal when content needs conversion.
- Remove `isOpen`/`open`/`close`/`toggleOpen` — scratchpad visibility is now controlled by `appStore.activeView`.
- Keep `save`, `sendToAI`, `isDirty`, `isSaving`, `isLoading`, `error`.
- Add `load()` method (replaces `open()` — fetches content without toggling visibility).

Replace the full store with:

```typescript
import { create } from 'zustand';

import { useChatStore } from './chatStore';
import { useAppStore } from './appStore';

type ScratchpadStore = {
  content: string;
  isLegacyMarkdown: boolean;
  isDirty: boolean;
  isLoading: boolean;
  isSaving: boolean;
  isSendingToAI: boolean;
  error: string | null;
  load: () => Promise<void>;
  setContent: (content: string) => void;
  save: () => Promise<void>;
  sendToAI: () => Promise<void>;
  clearError: () => void;
};

const flusk = () => {
  if (!window.flusk) {
    throw new Error('Flusk API not available');
  }
  return window.flusk;
};

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Scratchpad operation failed.';

const isBlockNoteJson = (content: string): boolean => {
  if (!content.trim()) return false;
  try {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) && (parsed.length === 0 || parsed[0]?.type !== undefined);
  } catch {
    return false;
  }
};

export const useScratchpadStore = create<ScratchpadStore>((set, get) => ({
  content: '',
  isLegacyMarkdown: false,
  isDirty: false,
  isLoading: false,
  isSaving: false,
  isSendingToAI: false,
  error: null,

  load: async () => {
    if (get().isLoading) return;

    set({ isLoading: true, error: null });

    try {
      const document = await flusk().scratchpad.get();
      const raw = document.content;
      const legacy = raw.length > 0 && !isBlockNoteJson(raw);

      set({
        content: raw,
        isLegacyMarkdown: legacy,
        isDirty: false,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      set({ isLoading: false, error: toErrorMessage(error) });
    }
  },

  setContent: (content) =>
    set((state) => {
      if (state.content === content) return state;
      return { content, isDirty: true, isLegacyMarkdown: false };
    }),

  save: async () => {
    const { isDirty, content, isSaving } = get();
    if (!isDirty || isSaving) return;

    set({ isSaving: true, error: null });

    try {
      const saved = await flusk().scratchpad.save(content);
      set((state) => {
        if (state.content !== content) {
          return { isSaving: false, error: null };
        }
        return { content: saved.content, isDirty: false, isSaving: false, error: null };
      });
    } catch (error) {
      set({ isSaving: false, error: toErrorMessage(error) });
    }
  },

  sendToAI: async () => {
    const { content, isDirty, isSendingToAI } = get();
    if (!content.trim() || isSendingToAI) return;

    if (isDirty) {
      await get().save();
      if (get().isDirty) return;
    }

    set({ isSendingToAI: true, error: null });

    try {
      // sendToAI receives markdown — the component serializes blocks before calling this
      const prompt = `Parse the following notes and extract any tasks:\n\n${content}`;
      await useChatStore.getState().sendMessage(prompt);
      useAppStore.getState().enterChatMode();
      set({ isSendingToAI: false });
    } catch (error) {
      set({
        isSendingToAI: false,
        error: error instanceof Error ? error.message : 'Failed to send to AI.',
      });
    }
  },

  clearError: () => set({ error: null }),
}));

export const selectScratchpadContent = (state: ScratchpadStore) => state.content;
export const selectScratchpadIsLegacyMarkdown = (state: ScratchpadStore) => state.isLegacyMarkdown;
export const selectScratchpadIsDirty = (state: ScratchpadStore) => state.isDirty;
export const selectScratchpadIsLoading = (state: ScratchpadStore) => state.isLoading;
export const selectScratchpadIsSaving = (state: ScratchpadStore) => state.isSaving;
export const selectScratchpadIsSendingToAI = (state: ScratchpadStore) => state.isSendingToAI;
export const selectScratchpadError = (state: ScratchpadStore) => state.error;
```

### Step 2: Update the test file

Replace `flusk/src/renderer/stores/scratchpadStore.test.ts` — update to remove open/close tests and match new store shape:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useScratchpadStore } from './scratchpadStore';

type MockScratchpadApi = {
  get: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
};

const createMockScratchpadApi = (): MockScratchpadApi => ({
  get: vi.fn(async () => ({
    id: 'main',
    content: '',
    updatedAt: new Date().toISOString(),
  })),
  save: vi.fn(async (content: string) => ({
    id: 'main',
    content,
    updatedAt: new Date().toISOString(),
  })),
});

describe('scratchpadStore', () => {
  beforeEach(() => {
    const scratchpad = createMockScratchpadApi();
    (globalThis as { window?: unknown }).window = { flusk: { scratchpad } };

    useScratchpadStore.setState({
      content: '',
      isLegacyMarkdown: false,
      isDirty: false,
      isLoading: false,
      isSaving: false,
      isSendingToAI: false,
      error: null,
    });
  });

  it('clears dirty state after saving when content is unchanged', async () => {
    useScratchpadStore.setState({ content: 'draft note', isDirty: true });

    await useScratchpadStore.getState().save();

    const state = useScratchpadStore.getState();
    expect(state.content).toBe('draft note');
    expect(state.isDirty).toBe(false);
    expect(state.isSaving).toBe(false);
  });

  it('does not overwrite newer edits when a save resolves late', async () => {
    const scratchpad = ((globalThis as { window?: unknown }).window as {
      flusk: { scratchpad: MockScratchpadApi };
    }).flusk.scratchpad;

    scratchpad.save.mockImplementation(
      async (content: string) =>
        await new Promise<{ id: string; content: string; updatedAt: string }>((resolve) => {
          setTimeout(() => {
            resolve({ id: 'main', content, updatedAt: new Date().toISOString() });
          }, 0);
        }),
    );

    useScratchpadStore.setState({ content: 'first draft', isDirty: true });

    const savePromise = useScratchpadStore.getState().save();
    useScratchpadStore.getState().setContent('first draft plus new text');
    await savePromise;

    const state = useScratchpadStore.getState();
    expect(state.content).toBe('first draft plus new text');
    expect(state.isDirty).toBe(true);
    expect(state.isSaving).toBe(false);
  });

  it('detects legacy markdown on load', async () => {
    const scratchpad = ((globalThis as { window?: unknown }).window as {
      flusk: { scratchpad: MockScratchpadApi };
    }).flusk.scratchpad;

    scratchpad.get.mockResolvedValue({
      id: 'main',
      content: '# Hello\n\n- item 1\n- item 2',
      updatedAt: new Date().toISOString(),
    });

    await useScratchpadStore.getState().load();

    const state = useScratchpadStore.getState();
    expect(state.isLegacyMarkdown).toBe(true);
    expect(state.content).toBe('# Hello\n\n- item 1\n- item 2');
  });

  it('detects blocknote JSON on load', async () => {
    const scratchpad = ((globalThis as { window?: unknown }).window as {
      flusk: { scratchpad: MockScratchpadApi };
    }).flusk.scratchpad;

    const blocks = JSON.stringify([{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }]);
    scratchpad.get.mockResolvedValue({
      id: 'main',
      content: blocks,
      updatedAt: new Date().toISOString(),
    });

    await useScratchpadStore.getState().load();

    const state = useScratchpadStore.getState();
    expect(state.isLegacyMarkdown).toBe(false);
    expect(state.content).toBe(blocks);
  });
});
```

### Step 3: Run tests

Run:
```bash
cd flusk && npx vitest run src/renderer/stores/scratchpadStore.test.ts
```

Expected: All 4 tests pass.

### Step 4: Commit

```bash
git add flusk/src/renderer/stores/scratchpadStore.ts flusk/src/renderer/stores/scratchpadStore.test.ts
git commit -m "refactor: update scratchpad store for BlockNote JSON storage"
```

---

## Task 4: Create the ScratchpadView component with BlockNote editor

**Files:**
- Create: `flusk/src/renderer/components/scratchpad/ScratchpadView.tsx`
- Delete: `flusk/src/renderer/components/scratchpad/Scratchpad.tsx` (old panel)

### Step 1: Create `ScratchpadView.tsx`

This is the main component. Key behaviors:
- Calls `load()` on mount to fetch content from SQLite
- Detects legacy markdown and converts via `tryParseMarkdownToBlocks()`
- Parses BlockNote JSON and passes to editor via `initialContent`
- On every change, serializes `editor.document` to JSON string and calls `setContent()`
- Auto-saves on a 2-second debounce (via `setTimeout` in onChange)

```typescript
import { useCallback, useEffect, useMemo, useRef } from 'react';

import {
  BlockNoteEditor,
  type Block,
  type PartialBlock,
} from '@blocknote/core';
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

import { useTheme } from '../providers/ThemeProvider';
import { Button } from '../ui/button';
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
import { useAppStore } from '../../stores/appStore';
import { useChatStore } from '../../stores/chatStore';
import { useTaskStore } from '../../stores/taskStore';

const insertTaskItem = (
  editor: BlockNoteEditor,
): DefaultReactSuggestionItem => ({
  title: 'Create Task',
  onItemClick: () => {
    const block = editor.getTextCursorPosition().block;
    const text = (block.content as Array<{ type: string; text?: string }>)
      ?.map((c) => c.text ?? '')
      .join('')
      .trim();

    if (text) {
      void window.flusk?.tasks.create({ title: text, status: 'inbox' });
      void useTaskStore.getState().fetchTasks();
    }
  },
  aliases: ['task', 'todo'],
  group: 'Flusk',
  icon: <CheckSquare size={18} />,
  subtext: 'Create a task from this block',
});

const insertSendItem = (
  editor: BlockNoteEditor,
): DefaultReactSuggestionItem => ({
  title: 'Send to AI',
  onItemClick: async () => {
    const markdown = await editor.blocksToMarkdownLossy(editor.document);
    const trimmed = markdown.trim();
    if (!trimmed) return;

    const prompt = `Parse the following notes and extract any tasks:\n\n${trimmed}`;
    await useChatStore.getState().sendMessage(prompt);
    useAppStore.getState().enterChatMode();
  },
  aliases: ['send', 'ai'],
  group: 'Flusk',
  icon: <Sparkles size={18} />,
  subtext: 'Send all notes to AI chat',
});

const getCustomSlashMenuItems = (
  editor: BlockNoteEditor,
): DefaultReactSuggestionItem[] => [
  ...getDefaultReactSlashMenuItems(editor),
  insertTaskItem(editor),
  insertSendItem(editor),
];

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
  const save = useScratchpadStore((state) => state.save);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      void load();
    }
  }, [load]);

  const initialContent = useMemo((): PartialBlock[] | undefined => {
    if (isLoading || !content) return undefined;

    if (isLegacyMarkdown) {
      // Legacy markdown — will be converted async in the editor via useEffect below
      return undefined;
    }

    try {
      const parsed = JSON.parse(content) as Block[];
      return parsed.length > 0 ? parsed : undefined;
    } catch {
      return undefined;
    }
  }, [content, isLegacyMarkdown, isLoading]);

  const editor = useCreateBlockNote({
    initialContent: initialContent ?? undefined,
  });

  // Convert legacy markdown after editor is ready
  useEffect(() => {
    if (!isLegacyMarkdown || !content || isLoading) return;

    const convert = async () => {
      const blocks = await editor.tryParseMarkdownToBlocks(content);
      editor.replaceBlocks(editor.document, blocks);
    };

    void convert();
  }, [editor, isLegacyMarkdown, content, isLoading]);

  const onChange = useCallback(() => {
    const json = JSON.stringify(editor.document);
    setContent(json);

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      void useScratchpadStore.getState().save();
    }, 2000);
  }, [editor, setContent]);

  // Cleanup timer on unmount and save if dirty
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      // Save on navigate away if dirty
      const state = useScratchpadStore.getState();
      if (state.isDirty) {
        void state.save();
      }
    };
  }, []);

  const handleSendToAI = useCallback(async () => {
    const markdown = await editor.blocksToMarkdownLossy(editor.document);
    const trimmed = markdown.trim();
    if (!trimmed) return;

    // Save first if dirty
    if (useScratchpadStore.getState().isDirty) {
      await useScratchpadStore.getState().save();
    }

    const prompt = `Parse the following notes and extract any tasks:\n\n${trimmed}`;
    await useChatStore.getState().sendMessage(prompt);
    useAppStore.getState().enterChatMode();
  }, [editor]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading notes...</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground">
            Notes
          </h2>
          <span className="text-[11px] text-muted-foreground">
            {isDirty ? 'Unsaved' : isSaving ? 'Saving...' : 'Saved'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => { void handleSendToAI(); }}
            disabled={isSendingToAI}
          >
            <Sparkles size={14} className="mr-1" />
            {isSendingToAI ? 'Sending...' : 'Send to AI'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => { void save(); }}
            disabled={!isDirty || isSaving}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </header>

      {error ? (
        <p className="mx-4 mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive-foreground">
          {error}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <BlockNoteView
          editor={editor}
          theme={resolvedTheme}
          onChange={onChange}
          slashMenu={false}
        >
          <SuggestionMenuController
            triggerCharacter="/"
            getItems={async (query) =>
              filterSuggestionItems(getCustomSlashMenuItems(editor), query)
            }
          />
        </BlockNoteView>
      </div>
    </div>
  );
};
```

### Step 2: Delete old `Scratchpad.tsx`

```bash
rm flusk/src/renderer/components/scratchpad/Scratchpad.tsx
```

### Step 3: Verify types compile

Run:
```bash
cd flusk && npx tsc --noEmit -p tsconfig.renderer.json 2>&1 | head -40
```

Expected: No errors (or only unrelated pre-existing ones). All imports of the old `Scratchpad` have been replaced in Task 2.

### Step 4: Commit

```bash
git add -A flusk/src/renderer/components/scratchpad/
git commit -m "feat: replace scratchpad panel with full BlockNote view"
```

---

## Task 5: Clean up dead imports and verify full build

**Files:**
- Modify: various files if stale imports remain

### Step 1: Check for remaining references to old scratchpad

Run:
```bash
cd flusk && grep -r "Scratchpad\|scratchpad" src/renderer --include="*.ts" --include="*.tsx" -l
```

Verify only these files reference scratchpad:
- `stores/scratchpadStore.ts`
- `stores/scratchpadStore.test.ts`
- `components/scratchpad/ScratchpadView.tsx`
- `components/layout/AppShell.tsx` (imports `ScratchpadView`)

If `TitleBar.tsx`, `useKeyboardShortcuts.ts`, or `AppShell.tsx` still import from the old scratchpad store selectors like `selectScratchpadIsOpen`, remove those imports.

### Step 2: Check for old `@uiw` references

Run:
```bash
cd flusk && grep -r "@uiw" src/ --include="*.ts" --include="*.tsx" -l
```

Expected: No results.

### Step 3: Run full type check

Run:
```bash
cd flusk && npx tsc --noEmit -p tsconfig.renderer.json
```

Expected: Clean pass.

### Step 4: Run tests

Run:
```bash
cd flusk && npx vitest run
```

Expected: All tests pass.

### Step 5: Commit (if any cleanup was needed)

```bash
git add -A
git commit -m "chore: clean up dead scratchpad imports and verify build"
```

---

## Task 6: Manual testing checklist

No code changes. Verify these behaviors manually:

1. **Navigation**: Click "Notes" tab in TitleBar → shows BlockNote editor full-view
2. **Keyboard**: Press `Cmd+N` → navigates to Notes view
3. **Number shortcuts**: Press `1`/`2`/`3` → navigates to Today/Projects/Inbox (still works)
4. **Slash menu**: Type `/` in the editor → see default items + "Create Task" and "Send to AI" under "Flusk" group
5. **Create Task**: Type some text, invoke `/task` → verify a new task appears in Inbox
6. **Send to AI**: Invoke `/send` or click "Send to AI" button → navigates to chat with scratchpad content
7. **Auto-save**: Type content, wait 2 seconds → status shows "Saved"
8. **Manual save**: Click "Save" button → status updates
9. **Theme**: Toggle dark/light mode → BlockNote editor follows theme
10. **Legacy migration**: If existing scratchpad had markdown content, first load converts it to blocks
11. **Navigate away and back**: Content persists
12. **Escape key**: In Notes view, Escape doesn't do anything unexpected (no overlay to close)
