# Animations, A11y & Task UX Polish — Execution Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add focus traps to modals, missing ARIA roles, subtle animations, and manual task management UX (add task, inline edit, field editing, move to project).

**Architecture:** Component-by-component sweep. One shared `useFocusTrap` hook applied to 3 modal overlays. Animation additions use existing Framer Motion patterns (inline variants, `useReducedMotion()`). Task UX extends existing `InlineTaskInput` and `TaskBody` components. All data flows through the existing `taskStore` Zustand store.

**Tech Stack:** React 19, Framer Motion 12, Zustand, Vitest, Electron (renderer process only)

**Design doc:** `docs/plans/2026-02-16-animations-a11y-task-ux-design.md`

---

## Task 1: useFocusTrap Hook

**Files:**
- Create: `flusk/src/renderer/hooks/useFocusTrap.ts`
- Create: `flusk/src/renderer/hooks/useFocusTrap.test.ts`

**Step 1: Write the test**

```typescript
// flusk/src/renderer/hooks/useFocusTrap.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// We test the raw logic, not React hooks. Extract the core as a pure function
// and test it. The hook is a thin React wrapper.

import { getFocusableElements, FOCUSABLE_SELECTOR } from './useFocusTrap';

describe('getFocusableElements', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('returns buttons and inputs inside container', () => {
    container.innerHTML = `
      <button>One</button>
      <input type="text" />
      <button disabled>Disabled</button>
      <div tabindex="0">Focusable div</div>
      <div tabindex="-1">Not focusable via tab</div>
    `;

    const elements = getFocusableElements(container);
    expect(elements).toHaveLength(3); // button, input, tabindex=0 div
  });

  it('returns empty array for container with no focusable elements', () => {
    container.innerHTML = '<p>No focusable elements</p>';
    const elements = getFocusableElements(container);
    expect(elements).toHaveLength(0);
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `cd flusk && npx vitest run src/renderer/hooks/useFocusTrap.test.ts`
Expected: FAIL — module not found

**Step 3: Implement the hook**

```typescript
// flusk/src/renderer/hooks/useFocusTrap.ts
import { useEffect, useRef, type RefObject } from 'react';

export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not(:disabled)',
  'input:not(:disabled)',
  'textarea:not(:disabled)',
  'select:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export const getFocusableElements = (container: HTMLElement): HTMLElement[] =>
  Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));

export const useFocusTrap = (
  containerRef: RefObject<HTMLElement | null>,
  isActive: boolean,
): void => {
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isActive) return;

    const container = containerRef.current;
    if (!container) return;

    // Store the element that was focused before trap activated
    previousFocusRef.current = document.activeElement as HTMLElement | null;

    // Focus the first focusable element
    const elements = getFocusableElements(container);
    if (elements.length > 0) {
      elements[0].focus();
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Tab') return;

      const focusable = getFocusableElements(container);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    container.addEventListener('keydown', handleKeyDown);

    // MutationObserver not needed for MVP — focusable elements are static
    // within our modals. Add later if needed.

    return () => {
      container.removeEventListener('keydown', handleKeyDown);

      // Restore focus to the element that was focused before trap
      if (previousFocusRef.current && previousFocusRef.current.isConnected) {
        previousFocusRef.current.focus();
      }
    };
  }, [isActive, containerRef]);
};
```

**Step 4: Run the test to verify it passes**

Run: `cd flusk && npx vitest run src/renderer/hooks/useFocusTrap.test.ts`
Expected: PASS

**Step 5: Type check**

Run: `cd flusk && npx tsc --noEmit`
Expected: No errors (or only pre-existing ones)

**Step 6: Commit**

```bash
git add flusk/src/renderer/hooks/useFocusTrap.ts flusk/src/renderer/hooks/useFocusTrap.test.ts
git commit -m "feat: add useFocusTrap hook for modal focus management"
```

---

## Task 2: SettingsMemory — A11y + Tab Animation + Focus Trap

**Files:**
- Modify: `flusk/src/renderer/components/settings/SettingsMemory.tsx`

**Step 1: Add dialog ARIA and semantic tabs to the root element**

In `SettingsMemory.tsx`, change the root `<section>` tag:

```tsx
// BEFORE (line ~596):
<section className="no-drag absolute inset-0 z-30 flex flex-col bg-background/95 backdrop-blur-sm">

// AFTER:
<section
  className="no-drag absolute inset-0 z-30 flex flex-col bg-background/95 backdrop-blur-sm"
  role="dialog"
  aria-modal="true"
  aria-labelledby="settings-title"
>
```

Add `id` to the title (line ~599):

```tsx
// BEFORE:
<h2 className="text-sm font-semibold text-foreground">Settings</h2>

// AFTER:
<h2 id="settings-title" className="text-sm font-semibold text-foreground">Settings</h2>
```

**Step 2: Add tablist/tab/tabpanel ARIA to the nav and tab buttons**

Change the `<nav>` element (line ~609):

```tsx
// BEFORE:
<nav className="flex items-center gap-2 border-b border-border px-4 py-2">
  {TAB_ORDER.map((tab) => (
    <Button
      key={tab}
      type="button"
      variant={activeTab === tab ? 'default' : 'ghost'}
      size="sm"
      onClick={() => setActiveTab(tab)}
    >
      {TAB_LABELS[tab]}
    </Button>
  ))}
</nav>

// AFTER:
<nav
  className="flex items-center gap-2 border-b border-border px-4 py-2"
  role="tablist"
  aria-label="Settings sections"
>
  {TAB_ORDER.map((tab) => (
    <Button
      key={tab}
      type="button"
      variant={activeTab === tab ? 'default' : 'ghost'}
      size="sm"
      onClick={() => setActiveTab(tab)}
      role="tab"
      aria-selected={activeTab === tab}
      aria-controls={`settings-panel-${tab}`}
    >
      {TAB_LABELS[tab]}
    </Button>
  ))}
</nav>
```

**Step 3: Wrap each tab content block in tabpanel divs**

For each `{activeTab === 'xxx' ? (...) : null}` block, wrap the inner content:

```tsx
// Example for the general tab (repeat pattern for all 7 tabs):

// BEFORE:
{activeTab === 'general' ? (
  <div className="space-y-3">
    ...
  </div>
) : null}

// AFTER:
{activeTab === 'general' ? (
  <div role="tabpanel" id="settings-panel-general" className="space-y-3">
    ...
  </div>
) : null}
```

Apply the same `role="tabpanel"` + `id="settings-panel-{tab}"` pattern to all 7 tab content blocks: general, ai, memory, journal, chat, shortcuts, backup.

**Step 4: Add AnimatePresence for tab content transitions**

Add imports at top:

```tsx
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
```

Add `useReducedMotion` inside the component:

```tsx
const prefersReducedMotion = useReducedMotion();
```

Wrap the content area (the `<div className="flex-1 overflow-y-auto px-4 py-3">` block) with AnimatePresence:

```tsx
<div className="flex-1 overflow-y-auto px-4 py-3">
  {error ? (...) : null}
  {notice ? (...) : null}

  <AnimatePresence mode="wait">
    <motion.div
      key={activeTab}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: prefersReducedMotion ? 0.05 : 0.15, ease: 'easeOut' }}
    >
      {/* All the tab content blocks go here */}
    </motion.div>
  </AnimatePresence>
</div>
```

Note: The error/notice banners stay OUTSIDE the AnimatePresence since they're shared across tabs.

**Step 5: Add focus trap**

Add import and ref:

```tsx
import { useFocusTrap } from '../../hooks/useFocusTrap';

// Inside component:
const settingsRef = useRef<HTMLElement>(null);
useFocusTrap(settingsRef, true); // Always active when rendered
```

Add ref to the root section:

```tsx
<section
  ref={settingsRef}
  className="no-drag absolute inset-0 z-30 ..."
  role="dialog"
  ...
>
```

**Step 6: Type check and verify**

Run: `cd flusk && npx tsc --noEmit`
Expected: No errors

**Step 7: Commit**

```bash
git add flusk/src/renderer/components/settings/SettingsMemory.tsx
git commit -m "feat: add dialog a11y, semantic tabs, focus trap, and tab transitions to Settings"
```

---

## Task 3: SearchModal — A11y + Focus Trap + Result Stagger

**Files:**
- Modify: `flusk/src/renderer/components/search/SearchModal.tsx`

**Step 1: Add dialog ARIA to root element**

```tsx
// BEFORE (line ~203):
<motion.div
  key="search-modal"
  ...
  className="no-drag absolute inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm"
  onKeyDown={handleKeyDown}
>

// AFTER:
<motion.div
  key="search-modal"
  ...
  className="no-drag absolute inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm"
  onKeyDown={handleKeyDown}
  role="dialog"
  aria-modal="true"
  aria-label="Search tasks"
>
```

**Step 2: Add focus trap**

Add import and ref:

```tsx
import { useFocusTrap } from '../../hooks/useFocusTrap';

// Inside component:
const modalRef = useRef<HTMLDivElement>(null);
useFocusTrap(modalRef, isOpen);
```

Add ref to the root motion.div — but since it's inside AnimatePresence, use a callback ref or add the ref conditionally. Simplest approach: add the ref to the outer container:

```tsx
// Wrap the AnimatePresence return in a container div when open:
return (
  <AnimatePresence>
    {isOpen ? (
      <motion.div
        ref={modalRef}
        key="search-modal"
        ...
      >
```

**Step 3: Add result stagger animation**

Wrap each result button in a `motion.div` with stagger. Change the `renderResult` function:

```tsx
const renderResult = (
  result: SearchResultItem,
  flatIndex: number,
) => {
  const isSelected = flatIndex === selectedIndex;

  return (
    <motion.div
      key={result.id}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: prefersReducedMotion ? 0.05 : 0.12,
        delay: prefersReducedMotion ? 0 : flatIndex * 0.03,
        ease: 'easeOut',
      }}
    >
      <button
        type="button"
        className={`w-full rounded-md px-3 py-2 text-left transition-colors ${
          isSelected
            ? 'bg-accent text-accent-foreground'
            : 'hover:bg-accent/50'
        }`}
        onClick={() => navigateToResult(result)}
        onMouseEnter={() =>
          useSearchStore.setState({ selectedIndex: flatIndex })
        }
      >
        <p className="truncate text-sm font-medium text-foreground">
          {result.title}
        </p>
        {result.client ? (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {result.client}
          </p>
        ) : null}
        {result.snippet ? (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {renderSafeSnippet(result.snippet)}
          </p>
        ) : null}
      </button>
    </motion.div>
  );
};
```

Note: Remove `key={result.id}` from the inner button since it's now on the motion.div wrapper.

**Step 4: Type check**

Run: `cd flusk && npx tsc --noEmit`

**Step 5: Commit**

```bash
git add flusk/src/renderer/components/search/SearchModal.tsx
git commit -m "feat: add dialog a11y, focus trap, and result stagger to SearchModal"
```

---

## Task 4: Scratchpad — Focus Trap

**Files:**
- Modify: `flusk/src/renderer/components/scratchpad/Scratchpad.tsx`

**Step 1: Add focus trap**

Import and apply `useFocusTrap`:

```tsx
import { useFocusTrap } from '../../hooks/useFocusTrap';

// Inside component:
const panelRef = useRef<HTMLElement>(null);
useFocusTrap(panelRef, isOpen);
```

Add ref to the root `<section>` element (line ~61):

```tsx
<section
  ref={panelRef}
  className="no-drag absolute inset-0 z-40 flex items-end"
  aria-label="Scratchpad panel"
  role="dialog"
  aria-modal="true"
>
```

**Step 2: Type check**

Run: `cd flusk && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add flusk/src/renderer/components/scratchpad/Scratchpad.tsx
git commit -m "feat: add focus trap to Scratchpad modal"
```

---

## Task 5: ChatView — Message Animation + Confirmation Dialog

**Files:**
- Modify: `flusk/src/renderer/components/chat/ChatView.tsx`

**Step 1: Add ARIA to message scroll container**

```tsx
// BEFORE (line ~441):
<div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 space-y-4 overflow-y-auto pr-1 pb-16">

// AFTER:
<div
  ref={scrollContainerRef}
  onScroll={handleScroll}
  className="flex-1 space-y-4 overflow-y-auto pr-1 pb-16"
  role="log"
  aria-live="polite"
  aria-relevant="additions"
>
```

**Step 2: Add animation to latest message only**

Add imports:

```tsx
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
```

Add inside component:

```tsx
const prefersReducedMotion = useReducedMotion();
const lastAnimatedIdRef = useRef<string | null>(null);
```

In `renderedMessages`, wrap each article. Only animate the LAST message if it hasn't been animated yet:

```tsx
const renderedMessages = useMemo(
  () => {
    const lastMessageId = messages.length > 0 ? messages[messages.length - 1].id : null;

    return messages.map((message) => {
      const isAssistant = message.role === 'assistant';
      const timestamp = formatTimestamp(message.createdAt);
      const hasSteps = isAssistant && message.steps.length > 0;
      const isLatest = message.id === lastMessageId;
      const shouldAnimate = isLatest && message.id !== lastAnimatedIdRef.current;

      if (shouldAnimate) {
        lastAnimatedIdRef.current = message.id;
      }

      return (
        <motion.article
          key={message.id}
          initial={shouldAnimate ? { opacity: 0, y: 8 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: prefersReducedMotion ? 0.05 : 0.15,
            ease: 'easeOut',
          }}
          className={cn(
            'flex w-full flex-col gap-1.5',
            isAssistant ? 'items-start' : 'items-end',
          )}
        >
          {/* ... existing message content unchanged ... */}
        </motion.article>
      );
    });
  },
  [messages, undoAction, handleApprove, rejectPendingAction, prefersReducedMotion],
);
```

Note: Change `<article>` to `<motion.article>` only. All children stay the same.

**Step 3: Add animation and ARIA to confirmation dialog**

Replace the confirmation dialog block (lines 462-483):

```tsx
<AnimatePresence>
  {confirmationTarget ? (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: prefersReducedMotion ? 0.05 : 0.15 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-desc"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: prefersReducedMotion ? 0.05 : 0.15, ease: 'easeOut' }}
        className="w-full max-w-sm rounded-xl border border-border bg-card p-4 shadow-lg"
      >
        <div className="flex items-center gap-2 text-amber-300">
          <AlertTriangle className="size-4" />
          <h3 id="confirm-dialog-title" className="text-sm font-semibold">
            Confirm {confirmationTarget.riskLevel}-risk action
          </h3>
        </div>
        <p id="confirm-dialog-desc" className="mt-3 text-sm text-muted-foreground">
          {confirmationTarget.rationale}
        </p>
        <p className="mt-2 text-xs text-muted-foreground/70">
          This action has elevated risk and requires explicit confirmation.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmationTarget(null)}>
            Cancel
          </Button>
          <Button type="button" variant="default" size="sm" onClick={handleConfirmApprove}>
            Confirm &amp; Execute
          </Button>
        </div>
      </motion.div>
    </motion.div>
  ) : null}
</AnimatePresence>
```

**Step 4: Type check**

Run: `cd flusk && npx tsc --noEmit`

**Step 5: Commit**

```bash
git add flusk/src/renderer/components/chat/ChatView.tsx
git commit -m "feat: add message fade-in, confirmation dialog animation, and ARIA to ChatView"
```

---

## Task 6: LiveThought — Exit Animation

**Files:**
- Modify: `flusk/src/renderer/components/layout/LiveThought.tsx`

**Step 1: Wrap in AnimatePresence for exit animation**

Currently the component returns `null` early when `!isVisible`, which prevents AnimatePresence from seeing the exit. Restructure:

```tsx
// BEFORE:
import { motion } from 'framer-motion';

// AFTER:
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
```

Replace the early return and the component's return block:

```tsx
export const LiveThought = ({ refreshKey }: LiveThoughtProps) => {
  // ... existing state/effects unchanged ...
  const prefersReducedMotion = useReducedMotion();

  // Remove the early return: if (!isVisible) return null;

  return (
    <AnimatePresence>
      {isVisible ? (
        <motion.section
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
          transition={{ duration: prefersReducedMotion ? 0.05 : 0.15, ease: 'easeOut' }}
          className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2"
          aria-live="polite"
        >
          {/* ... existing children unchanged ... */}
        </motion.section>
      ) : null}
    </AnimatePresence>
  );
};
```

**Step 2: Type check**

Run: `cd flusk && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add flusk/src/renderer/components/layout/LiveThought.tsx
git commit -m "feat: add exit animation to LiveThought"
```

---

## Task 7: Refactor InlineTaskInput for Top-Level Tasks

**Files:**
- Modify: `flusk/src/renderer/components/tasks/InlineTaskInput.tsx`

**Step 1: Update the props to be generic**

```tsx
// BEFORE:
type InlineTaskInputProps = {
  parentId: string;
};

// AFTER:
type InlineTaskInputProps = {
  parentId?: string | null;
  defaultStatus?: 'inbox' | 'active';
  defaultToday?: boolean;
  placeholder?: string;
  label?: string;
  /** External signal to open the input (e.g. from a keyboard shortcut) */
  triggerOpen?: number; // increment to trigger
};
```

**Step 2: Update the component to use new props**

```tsx
export const InlineTaskInput = ({
  parentId = null,
  defaultStatus = 'active',
  defaultToday,
  placeholder,
  label = parentId ? 'Add subtask' : 'Add task',
  triggerOpen,
}: InlineTaskInputProps) => {
  const createTask = useTaskStore((state) => state.createTask);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  // Respond to external trigger to open
  useEffect(() => {
    if (triggerOpen && triggerOpen > 0) {
      setIsOpen(true);
    }
  }, [triggerOpen]);

  const handleSubmit = useCallback(async (): Promise<void> => {
    const normalizedTitle = title.trim();
    if (normalizedTitle.length === 0 || isCreating) {
      return;
    }

    setIsCreating(true);
    const created = await createTask({
      title: normalizedTitle,
      parentId: parentId ?? undefined,
      status: defaultStatus,
      priority: 'none',
      today: defaultToday,
    });
    setIsCreating(false);

    if (!created) {
      return;
    }

    setTitle('');
    // Keep input open for rapid entry — close on Escape or blur
  }, [createTask, defaultStatus, defaultToday, isCreating, parentId, title]);

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <Plus className="size-3.5" />
        {label}
      </button>
    );
  }

  return (
    <Input
      ref={inputRef}
      value={title}
      onChange={(event) => setTitle(event.target.value)}
      onBlur={() => {
        if (title.trim().length === 0) {
          setIsOpen(false);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          void handleSubmit();
          return;
        }

        if (event.key === 'Escape') {
          event.preventDefault();
          setTitle('');
          setIsOpen(false);
        }
      }}
      placeholder={isCreating ? 'Creating...' : (placeholder ?? `Write a ${label.toLowerCase()} and press Enter`)}
      disabled={isCreating}
      className="h-8 text-xs"
      aria-label={label}
    />
  );
};
```

Key changes:
- `parentId` is now optional (defaults to `null` for top-level tasks)
- `defaultStatus` controls which status the task gets
- `defaultToday` optionally sets the today flag
- `triggerOpen` allows external keyboard shortcut to open the input
- After submit, input stays open for rapid entry (close only on Escape/blur)
- The `parentId` passed to `createTask` uses `undefined` when null (so Drizzle inserts as null)

**Step 3: Verify ProjectGroup still works**

Check that `ProjectGroup.tsx` passes `parentId={parentTask.id}` correctly — it does, and the new `parentId` prop still accepts strings. No change needed.

**Step 4: Type check**

Run: `cd flusk && npx tsc --noEmit`

**Step 5: Commit**

```bash
git add flusk/src/renderer/components/tasks/InlineTaskInput.tsx
git commit -m "refactor: make InlineTaskInput generic for top-level and subtask creation"
```

---

## Task 8: Add Task Buttons in Inbox & Today Views + N Key

**Files:**
- Modify: `flusk/src/renderer/components/views/InboxView.tsx`
- Modify: `flusk/src/renderer/components/views/TodayView.tsx`
- Modify: `flusk/src/renderer/hooks/useKeyboardShortcuts.ts`
- Modify: `flusk/src/renderer/stores/appStore.ts` (add new action)

**Step 1: Add a store action for "new task" trigger**

In `appStore.ts`, add a counter that increments when `N` is pressed. Components observe this.

Find the appStore type and add:

```typescript
// Add to the store state:
newTaskTrigger: number;

// Add to the store actions:
triggerNewTask: () => void;
```

In the store implementation:

```typescript
newTaskTrigger: 0,
triggerNewTask: () => set((s) => ({ newTaskTrigger: s.newTaskTrigger + 1 })),
```

**Step 2: Add N key shortcut**

In `useKeyboardShortcuts.ts`, add the handler after the `'3'` key handler (line ~168), before the closing of the `onKeyDown` function:

```typescript
if (event.key.toLowerCase() === 'n') {
  event.preventDefault();
  useAppStore.getState().triggerNewTask();
}
```

This only fires when:
- No modifier keys (already checked above)
- Not in a text input (already checked above)
- Not in chat mode / overlay (the view-level shortcut only fires in task views)

Note: The existing guard `if (isTextInputElement(document.activeElement)) return;` already prevents this from firing when typing in inputs.

**Step 3: Add InlineTaskInput to InboxView**

```tsx
// flusk/src/renderer/components/views/InboxView.tsx
import { InlineTaskInput } from '../tasks/InlineTaskInput';
import { useAppStore } from '../../stores/appStore';

export const InboxView = ({ allTasks, isLoading, error }: InboxViewProps) => {
  const inboxTasks = useMemo(...); // unchanged
  const newTaskTrigger = useAppStore((state) => state.newTaskTrigger);
  const activeView = useAppStore((state) => state.activeView);

  // Only pass trigger when this view is active
  const trigger = activeView === 'inbox' ? newTaskTrigger : 0;

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        {/* ... existing loading/error/TaskList ... */}

        {!isLoading ? (
          <>
            <TaskList ... />
            <InlineTaskInput
              parentId={null}
              defaultStatus="inbox"
              label="Add task"
              placeholder="New inbox item..."
              triggerOpen={trigger}
            />
          </>
        ) : null}
      </div>
    </div>
  );
};
```

**Step 4: Add InlineTaskInput to TodayView**

```tsx
// flusk/src/renderer/components/views/TodayView.tsx
import { InlineTaskInput } from '../tasks/InlineTaskInput';
import { useAppStore } from '../../stores/appStore';

export const TodayView = ({ allTasks, isLoading, error }: TodayViewProps) => {
  const todayTasks = useMemo(...); // unchanged
  const liveThoughtRefreshKey = useMemo(...); // unchanged
  const newTaskTrigger = useAppStore((state) => state.newTaskTrigger);
  const activeView = useAppStore((state) => state.activeView);

  const trigger = activeView === 'today' ? newTaskTrigger : 0;

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <LiveThought refreshKey={liveThoughtRefreshKey} />

        {/* ... existing loading/error ... */}

        {!isLoading ? (
          <>
            <TaskList ... />
            <InlineTaskInput
              parentId={null}
              defaultStatus="active"
              defaultToday
              label="Add task"
              placeholder="Add to today..."
              triggerOpen={trigger}
            />
          </>
        ) : null}
      </div>
    </div>
  );
};
```

**Step 5: Type check**

Run: `cd flusk && npx tsc --noEmit`

**Step 6: Commit**

```bash
git add flusk/src/renderer/components/views/InboxView.tsx flusk/src/renderer/components/views/TodayView.tsx flusk/src/renderer/hooks/useKeyboardShortcuts.ts flusk/src/renderer/stores/appStore.ts
git commit -m "feat: add task creation buttons in Inbox and Today views with N key shortcut"
```

---

## Task 9: Inline Title Editing in TaskItem

**Files:**
- Modify: `flusk/src/renderer/components/tasks/TaskItem.tsx`
- Modify: `flusk/src/renderer/components/tasks/TaskList.tsx`
- Modify: `flusk/src/renderer/hooks/useTaskListKeyboard.ts`

**Step 1: Add editing state and handler to TaskItem**

Add to TaskItem props:

```tsx
export interface TaskItemProps {
  task: Task;
  isExpanded: boolean;
  isFocused: boolean;
  isEditingTitle: boolean;                    // NEW
  onToggleExpand: (id: string) => void;
  onComplete: (id: string) => void;
  onToggleToday: (id: string) => void;
  onStartTitleEdit: (id: string) => void;     // NEW
  onEndTitleEdit: () => void;                 // NEW
  onBodyEditModeChange?: (editing: boolean) => void;
  onFocus?: () => void;
}
```

Add imports and state:

```tsx
import { Pencil } from 'lucide-react';
import { useTaskStore } from '../../stores/taskStore';

// Inside component:
const updateTask = useTaskStore((state) => state.updateTask);
const [titleDraft, setTitleDraft] = useState(task.title);

useEffect(() => {
  setTitleDraft(task.title);
}, [task.title]);
```

Replace the title `<p>` element (line ~117-124) with conditional rendering:

```tsx
<div className="min-w-0 flex-1">
  <div className="flex items-center gap-2">
    {isEditingTitle ? (
      <input
        autoFocus
        value={titleDraft}
        onChange={(event) => setTitleDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            const trimmed = titleDraft.trim();
            if (trimmed.length > 0 && trimmed !== task.title) {
              void updateTask({ id: task.id, title: trimmed });
            }
            onEndTitleEdit();
            return;
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            setTitleDraft(task.title);
            onEndTitleEdit();
          }
        }}
        onBlur={() => {
          const trimmed = titleDraft.trim();
          if (trimmed.length > 0 && trimmed !== task.title) {
            void updateTask({ id: task.id, title: trimmed });
          }
          onEndTitleEdit();
        }}
        onClick={(event) => event.stopPropagation()}
        className="w-full truncate rounded-sm bg-transparent text-sm text-foreground outline-none ring-1 ring-ring px-1 -ml-1"
        aria-label={`Edit title for "${task.title}"`}
      />
    ) : (
      <>
        <p
          className={cn(
            'truncate text-sm text-foreground',
            isCompleted && 'text-muted-foreground line-through',
          )}
        >
          {task.title}
        </p>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onStartTitleEdit(task.id);
          }}
          className="hidden size-5 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity group-hover:flex group-hover:opacity-100 hover:bg-accent hover:text-foreground focus-visible:flex focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-ring"
          aria-label={`Edit title for "${task.title}"`}
        >
          <Pencil className="size-3" />
        </button>
      </>
    )}
    {!isEditingTitle && task.client ? (
      <span className="rounded-sm border border-border/80 bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {task.client}
      </span>
    ) : null}
  </div>
</div>
```

Add `group` class to the row container for hover effects:

```tsx
// Change the outer container div className to add 'group':
<div
  onClick={() => onToggleExpand(task.id)}
  className="group flex min-h-11 items-center gap-2 px-2"
>
```

**Step 2: Add editing state management to TaskList**

In `TaskList.tsx`, add state:

```tsx
const [editingTitleTaskId, setEditingTitleTaskId] = useState<string | null>(null);
```

Pass to TaskItem:

```tsx
<TaskItem
  key={task.id}
  task={task}
  isExpanded={expandedTaskId === task.id}
  isFocused={focusedIndex === index}
  isEditingTitle={editingTitleTaskId === task.id}
  onToggleExpand={handleToggleExpand}
  onComplete={handleComplete}
  onToggleToday={handleToggleToday}
  onStartTitleEdit={setEditingTitleTaskId}
  onEndTitleEdit={() => setEditingTitleTaskId(null)}
  onBodyEditModeChange={setIsAnyBodyEditing}
  onFocus={() => setFocusedIndex(index)}
/>
```

Also pass `editingTitleTaskId` to `useTaskListKeyboard` (next step).

**Step 3: Add E key to useTaskListKeyboard**

Add to the options type:

```typescript
type UseTaskListKeyboardOptions = {
  // ... existing ...
  onStartTitleEdit: (id: string) => void;     // NEW
  isEditingTitle: boolean;                      // NEW
};
```

Add guards and handler inside the callback:

```typescript
// After the existing guard for isDragActive/isAnyBodyEditing:
if (isDragActive || isAnyBodyEditing || isEditingTitle) {
  return;
}

// After the 't' key handler:
if (event.key.toLowerCase() === 'e') {
  event.preventDefault();
  onStartTitleEdit(focusedTask.id);
  return;
}
```

Update the deps array to include `onStartTitleEdit` and `isEditingTitle`.

**Step 4: Update TaskList to pass new props to keyboard hook**

```tsx
const onKeyDown = useTaskListKeyboard({
  tasks,
  focusedIndex,
  onFocusedIndexChange: setFocusedIndex,
  expandedTaskId,
  onToggleExpand: handleToggleExpand,
  onToggleToday: handleToggleToday,
  isAnyBodyEditing,
  isDragActive: activeDragId !== null,
  containerRef,
  onStartTitleEdit: setEditingTitleTaskId,        // NEW
  isEditingTitle: editingTitleTaskId !== null,     // NEW
});
```

**Step 5: Type check**

Run: `cd flusk && npx tsc --noEmit`

**Step 6: Commit**

```bash
git add flusk/src/renderer/components/tasks/TaskItem.tsx flusk/src/renderer/components/tasks/TaskList.tsx flusk/src/renderer/hooks/useTaskListKeyboard.ts
git commit -m "feat: add inline title editing via E key and hover pencil icon"
```

---

## Task 10: TaskBody Metadata Row (Priority, Due Date, Client, Effort, Project)

**Files:**
- Modify: `flusk/src/renderer/components/tasks/TaskBody.tsx`

This is the largest single task. It adds a metadata editing row to the expanded task body.

**Step 1: Add metadata row below the notes editor**

Add imports:

```tsx
import { Calendar, FolderOpen } from 'lucide-react';
import { cn } from '../../lib/utils';
```

After the closing `</div>` of the body editor content (the `border-t border-border/80 px-3 py-2` div), add a new section:

```tsx
{/* Metadata fields */}
<div className="border-t border-border/80 px-3 py-2">
  <div className="flex flex-wrap items-center gap-2">
    <TaskFieldPriority task={task} onUpdate={updateTask} />
    <TaskFieldDueDate task={task} onUpdate={updateTask} />
    <TaskFieldClient task={task} onUpdate={updateTask} />
    <TaskFieldEffort task={task} onUpdate={updateTask} />
    <TaskFieldProject task={task} onUpdate={updateTask} />
  </div>
</div>
```

**Step 2: Implement TaskFieldPriority (inline in TaskBody.tsx)**

```tsx
const PRIORITY_OPTIONS: Array<{ value: Task['priority']; label: string; className: string }> = [
  { value: 'none', label: 'None', className: 'text-muted-foreground' },
  { value: 'low', label: 'Low', className: 'text-border' },
  { value: 'medium', label: 'Med', className: 'text-muted-foreground/70' },
  { value: 'high', label: 'High', className: 'text-foreground' },
];

const TaskFieldPriority = ({
  task,
  onUpdate,
}: {
  task: Task;
  onUpdate: (input: { id: string; priority: Task['priority'] }) => Promise<Task | null>;
}) => (
  <select
    value={task.priority ?? 'none'}
    onChange={(event) => {
      void onUpdate({ id: task.id, priority: event.target.value as Task['priority'] });
    }}
    className="h-7 rounded-md border border-border bg-transparent px-2 text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    aria-label="Priority"
  >
    {PRIORITY_OPTIONS.map((opt) => (
      <option key={opt.value} value={opt.value ?? 'none'}>
        {opt.label}
      </option>
    ))}
  </select>
);
```

**Step 3: Implement TaskFieldDueDate**

```tsx
const TaskFieldDueDate = ({
  task,
  onUpdate,
}: {
  task: Task;
  onUpdate: (input: { id: string; dueDate: string | null }) => Promise<Task | null>;
}) => {
  const [isEditing, setIsEditing] = useState(false);

  if (!isEditing && !task.dueDate) {
    return (
      <button
        type="button"
        onClick={() => setIsEditing(true)}
        className="inline-flex h-7 items-center gap-1 rounded-md border border-dashed border-border px-2 text-xs text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <Calendar className="size-3" />
        + Due date
      </button>
    );
  }

  return (
    <input
      type="date"
      value={task.dueDate ?? ''}
      onChange={(event) => {
        const value = event.target.value || null;
        void onUpdate({ id: task.id, dueDate: value });
        if (!value) setIsEditing(false);
      }}
      onBlur={() => {
        if (!task.dueDate) setIsEditing(false);
      }}
      autoFocus={isEditing && !task.dueDate}
      className="h-7 rounded-md border border-border bg-transparent px-2 text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      aria-label="Due date"
    />
  );
};
```

**Step 4: Implement TaskFieldClient**

```tsx
const TaskFieldClient = ({
  task,
  onUpdate,
}: {
  task: Task;
  onUpdate: (input: { id: string; client: string | null }) => Promise<Task | null>;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(task.client ?? '');

  useEffect(() => {
    setDraft(task.client ?? '');
  }, [task.client]);

  if (!isEditing && !task.client) {
    return (
      <button
        type="button"
        onClick={() => setIsEditing(true)}
        className="inline-flex h-7 items-center gap-1 rounded-md border border-dashed border-border px-2 text-xs text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        + Client
      </button>
    );
  }

  if (isEditing) {
    return (
      <input
        autoFocus
        type="text"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            const trimmed = draft.trim();
            void onUpdate({ id: task.id, client: trimmed || null });
            setIsEditing(false);
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            setDraft(task.client ?? '');
            setIsEditing(false);
          }
        }}
        onBlur={() => {
          const trimmed = draft.trim();
          void onUpdate({ id: task.id, client: trimmed || null });
          setIsEditing(false);
        }}
        placeholder="Client name"
        className="h-7 w-28 rounded-md border border-border bg-transparent px-2 text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        aria-label="Client"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setIsEditing(true)}
      className="inline-flex h-7 items-center rounded-md border border-border/80 bg-muted px-2 text-xs text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      aria-label="Edit client"
    >
      {task.client}
    </button>
  );
};
```

**Step 5: Implement TaskFieldEffort**

```tsx
const EFFORT_OPTIONS: Array<{ value: NonNullable<Task['effort']>; label: string }> = [
  { value: 'unknown', label: '? Effort' },
  { value: 'tiny', label: 'Tiny' },
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'deep', label: 'Deep' },
];

const TaskFieldEffort = ({
  task,
  onUpdate,
}: {
  task: Task;
  onUpdate: (input: { id: string; effort: Task['effort'] }) => Promise<Task | null>;
}) => (
  <select
    value={task.effort ?? 'unknown'}
    onChange={(event) => {
      void onUpdate({ id: task.id, effort: event.target.value as Task['effort'] });
    }}
    className="h-7 rounded-md border border-border bg-transparent px-2 text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    aria-label="Effort"
  >
    {EFFORT_OPTIONS.map((opt) => (
      <option key={opt.value} value={opt.value}>
        {opt.label}
      </option>
    ))}
  </select>
);
```

**Step 6: Implement TaskFieldProject**

```tsx
const TaskFieldProject = ({
  task,
  onUpdate,
}: {
  task: Task;
  onUpdate: (input: { id: string; parentId?: string | null; status?: Task['status'] }) => Promise<Task | null>;
}) => {
  const projects = useTaskStore((state) =>
    state.tasks.filter(
      (t) =>
        t.parentId === null &&
        t.id !== task.id &&
        (t.status === 'active' || t.status === 'in_progress'),
    ),
  );

  // Find current project name
  const currentProject = useTaskStore((state) =>
    task.parentId ? state.tasks.find((t) => t.id === task.parentId) : null,
  );

  return (
    <div className="flex items-center gap-1">
      <FolderOpen className="size-3 text-muted-foreground" />
      <select
        value={task.parentId ?? ''}
        onChange={(event) => {
          const nextParentId = event.target.value || null;
          const updates: { id: string; parentId?: string | null; status?: Task['status'] } = {
            id: task.id,
            parentId: nextParentId,
          };

          // When assigning inbox task to a project, upgrade status to active
          if (nextParentId && task.status === 'inbox') {
            updates.status = 'active';
          }

          void onUpdate(updates);
        }}
        className="h-7 max-w-[160px] truncate rounded-md border border-border bg-transparent px-2 text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        aria-label="Project"
      >
        <option value="">No project</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.title}
          </option>
        ))}
      </select>
    </div>
  );
};
```

**Step 7: Type check**

Run: `cd flusk && npx tsc --noEmit`

**Step 8: Commit**

```bash
git add flusk/src/renderer/components/tasks/TaskBody.tsx
git commit -m "feat: add metadata editing row to TaskBody (priority, due date, client, effort, project)"
```

---

## Task 11: Update current-run.md

**Files:**
- Modify: `docs/plans/current-run.md`

**Step 1: Update the run tracker**

```markdown
# Current Run

- stage: implementation_complete
- topic: animations-a11y-task-ux
- design_path: docs/plans/2026-02-16-animations-a11y-task-ux-design.md
- execution_plan_path: docs/plans/2026-02-16-animations-a11y-task-ux-execution-plan.md
- next_skill: superpowers:verification-before-completion
- updated_at: {current ISO timestamp}
```

**Step 2: Commit**

```bash
git add docs/plans/current-run.md
git commit -m "chore: update current-run.md for animations-a11y-task-ux completion"
```

---

## Verification Checklist (after all tasks)

Run: `cd flusk && npx tsc --noEmit && npx vitest run`

Manual checks:
1. Open Settings → Tab cycles only within settings, tabs have proper ARIA
2. Open Search → Results stagger in, focus trapped, dialog announced
3. Open Scratchpad → Focus trapped within panel
4. Send chat message → Latest message fades in
5. Dismiss LiveThought → Smoothly fades out
6. Press N in Inbox view → Inline input opens, can create task
7. Press N in Today view → Inline input opens, creates today task
8. Focus task, press E → Title becomes editable input
9. Expand task → See metadata row with priority, due, client, effort, project
10. Change project dropdown → Task moves to that project
