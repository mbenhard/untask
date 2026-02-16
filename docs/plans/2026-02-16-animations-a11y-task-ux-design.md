# Animations, Accessibility & Task UX Polish — Design

**Date**: 2026-02-16
**Task**: 12 (Polish UI Animations and Accessibility) + Task Management UX fixes
**Approach**: Component-by-component sweep

## Scope

One shared hook + 6 component animation/a11y touches + 5 task management UX fixes.

---

## Part 1: Shared Hook

### `useFocusTrap` (`src/renderer/hooks/useFocusTrap.ts`)

```typescript
function useFocusTrap(containerRef: RefObject<HTMLElement>, isActive: boolean): void
```

- When `isActive` becomes true: store `document.activeElement`, find all focusable elements inside container, focus the first one
- Tab at last focusable → wrap to first
- Shift+Tab at first → wrap to last
- On deactivation or unmount → restore focus to stored element
- MutationObserver to re-query focusable elements on DOM changes
- Focusable selector: `a[href], button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])`

---

## Part 2: Animation & Accessibility Sweep

### 2.1 SettingsMemory.tsx

**Animations:**
- AnimatePresence crossfade between tab content panels (opacity 0→1, 150ms)

**Accessibility:**
- Add `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to title element
- Add `role="tablist"` on tab container, `role="tab"` + `aria-selected` on each tab button, `role="tabpanel"` on content
- Apply `useFocusTrap` when settings is open

### 2.2 SearchModal.tsx

**Animations:**
- Stagger on search results: each result fades in with 30ms delay between items (opacity 0→1, y: 4→0)

**Accessibility:**
- Apply `useFocusTrap`
- Ensure `role="dialog"` + `aria-modal="true"` present

### 2.3 Scratchpad.tsx

**Animations:**
- Already fully animated — no changes

**Accessibility:**
- Apply `useFocusTrap`
- Add `role="dialog"` + `aria-modal="true"`

### 2.4 ChatView.tsx

**Animations:**
- New messages: fade-in (opacity 0→1, y: 8→0, 150ms) — only animate the latest message to avoid re-animating scroll history
- Confirmation dialog: AnimatePresence with backdrop fade + dialog scale entrance (0.95→1, 150ms)

**Accessibility:**
- Message container: add `role="log"` + `aria-live="polite"`
- Confirmation dialog: `role="alertdialog"` + `aria-modal="true"` + `aria-labelledby`/`aria-describedby`

### 2.5 ProjectGroup.tsx

**Animations:**
- Group collapse/expand: AnimatePresence + height animation (same pattern as TaskBody — animate maxHeight with overflow hidden)

**Accessibility:**
- Already has `aria-expanded` — verify present on toggle button

### 2.6 LiveThought.tsx

**Animations:**
- Entrance/exit: AnimatePresence with fade + slide down (opacity 0→1, y: -8→0, 150ms)

**Accessibility:**
- Already has `aria-live="polite"` — verify present

---

## Part 3: Task Management UX Fixes

### 3.1 Add Task Button in Inbox View

- Render persistent "Add task" row at bottom of Inbox TaskList
- Click → shows inline text input (reuse InlineTaskInput pattern)
- Enter to create with `{ status: 'inbox', parentId: null, priority: 'none' }`
- Escape or blur to cancel
- Keyboard: `N` key when task list is focused and not in chat mode
- Auto-focus input on open

### 3.2 Add Task Button in Today View

- Same pattern as Inbox
- Creates with `{ status: 'active', today: true, parentId: null, priority: 'none' }`
- Same `N` key shortcut behavior

### 3.3 Inline Title Editing

- Double-click on task title in TaskItem → replaces title `<span>` with `<input>`
- Enter to save, Escape to cancel, blur to save
- Uses existing `updateTask` from taskStore (optimistic updates already work)
- No new IPC channels needed
- Input inherits same font size/weight as title span

### 3.4 Quick Field Editing in TaskBody

When task is expanded, add a field row below the body notes:

| Field | Widget | Values |
|-------|--------|--------|
| Priority | Dropdown badge | none, low, medium, high |
| Due date | Date input popover | Date picker |
| Client | Text input popover | Free text |
| Effort | Dropdown badge | unknown, tiny, small, medium, deep |

- Each saves immediately via `updateTask` on selection/submit
- Empty fields render as "+" buttons (e.g., "+ Due date", "+ Client")
- Filled fields render as colored badges with the value, clickable to edit

### 3.5 Move to Project

- In TaskBody field row, add "Project" badge
- Click → dropdown listing all top-level project tasks (`parentId=null, status in ['active','in_progress']`)
- Selecting a project: sets `parentId` to selected project ID, changes `status` from 'inbox' to 'active'
- "None" option: sets `parentId=null`
- Shows current project name if assigned, or "No project" if parentId is null

---

## Implementation Order

1. `useFocusTrap` hook (dependency for 2-4)
2. SettingsMemory (a11y + animations)
3. SearchModal (a11y + stagger animation)
4. Scratchpad (a11y focus trap)
5. ChatView (animations + a11y)
6. ProjectGroup (collapse animation)
7. LiveThought (entrance animation)
8. InlineTaskInput refactor (extract reusable pattern for Inbox/Today)
9. Inbox & Today "Add task" buttons
10. Inline title editing in TaskItem
11. Quick field editing in TaskBody
12. Move to project in TaskBody

---

## Reduced Motion

All new animations respect `useReducedMotion()` (already used throughout the codebase). When reduced motion is enabled:
- Replace transform animations with opacity-only
- Shorten durations to 0-50ms
- Keep functional feedback (focus, state changes) but remove decorative motion

---

## No New Dependencies

- Framer Motion already installed (v12.34.0)
- All field editing uses existing `updateTask` IPC and store actions
- No new packages needed
