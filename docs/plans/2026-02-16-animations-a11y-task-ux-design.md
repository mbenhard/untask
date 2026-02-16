# Animations, Accessibility & Task UX Polish — Design

**Date**: 2026-02-16
**Task**: 12 (Polish UI Animations and Accessibility) + Task Management UX fixes
**Approach**: Component-by-component sweep
**Revised**: Post code-review against actual codebase

## Scope

One shared hook + 4 component animation/a11y touches + 5 task management UX fixes.

> Reduced from 6 components to 4 after code review: ProjectGroup already has
> AnimatePresence + height animation + aria-expanded. Scratchpad already has
> role="dialog" + aria-modal="true" (only needs focus trap).

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

**Current state**: Full-screen overlay (`<section>` with `absolute inset-0 z-30`). No dialog role. Tab switching uses `<Button>` components with conditional rendering — no semantic tabs, no transition.

**Animations:**
- AnimatePresence crossfade between tab content panels (opacity 0→1, 150ms)
- Wrap each `{activeTab === 'xxx' ? (...) : null}` block in `<motion.div>` with AnimatePresence mode="wait"

**Accessibility:**
- Add `role="dialog"`, `aria-modal="true"`, `aria-labelledby="settings-title"` to root `<section>`
- Add `id="settings-title"` to the `<h2>Settings</h2>` element
- On `<nav>` tab container: add `role="tablist"`
- On each tab `<Button>`: add `role="tab"`, `aria-selected={activeTab === tab}`, `aria-controls={`settings-panel-${tab}`}`
- On each content block: wrap in `<div role="tabpanel" id={`settings-panel-${tab}`}>`
- Apply `useFocusTrap` when settings is open

### 2.2 SearchModal.tsx

**Current state**: Full-screen overlay (`absolute inset-0 z-50`). Has backdrop animation + scale. No dialog role. Results render immediately without stagger.

**Animations:**
- Stagger on search results: wrap each result `<button>` in `<motion.div>` with staggered fade-in (opacity 0→1, y: 4→0, 30ms stagger delay per item)
- Only stagger on query change, not on arrow key navigation

**Accessibility:**
- Add `role="dialog"`, `aria-modal="true"`, `aria-label="Search tasks"` to root `<motion.div>`
- Apply `useFocusTrap` (input already auto-focuses; trap ensures Tab stays inside)

### 2.3 Scratchpad.tsx

**Current state**: Already has `role="dialog"`, `aria-modal="true"`, full slide-up animation, backdrop.

**Accessibility:**
- Apply `useFocusTrap` only (ARIA already correct)

### 2.4 ChatView.tsx

**Current state**: Messages render as static `<article>` elements in a memoized list. Confirmation dialog (lines 462-483) is a raw `<div>` with `fixed inset-0 z-50` — no animation, no dialog ARIA.

**Animations:**
- New messages: fade-in (opacity 0→1, y: 8→0, 150ms) — only on the LAST message in the list to avoid re-animating history. Track `lastAnimatedMessageId` ref to prevent re-animation on re-renders.
- Confirmation dialog: wrap in AnimatePresence. Backdrop: opacity 0→1 (150ms). Dialog: scale 0.95→1 + opacity 0→1 (150ms). Exit: reverse.
- Respect `useReducedMotion()` — opacity only when active.

**Accessibility:**
- Scroll container (`ref={scrollContainerRef}`): add `role="log"`, `aria-live="polite"`, `aria-relevant="additions"`
- Confirmation dialog: add `role="alertdialog"`, `aria-modal="true"`, `aria-labelledby="confirm-title"`, `aria-describedby="confirm-desc"`. Add `id="confirm-title"` to the `<h3>` and `id="confirm-desc"` to the rationale `<p>`.

### 2.5 LiveThought.tsx

**Current state**: Already has entrance animation (opacity 0→1, y: 4→0) and `aria-live="polite"`. But dismiss (`setIsVisible(false)`) returns `null` immediately — no exit animation.

**Animation fix:**
- Wrap the whole component in `<AnimatePresence>` with exit variant (opacity 1→0, y: -4, 150ms)
- Needs structural change: the `if (!isVisible) return null` early return prevents AnimatePresence from seeing the exit. Move visibility check inside AnimatePresence.

### ~~2.5 ProjectGroup.tsx~~ — REMOVED (already complete)

Already has AnimatePresence + height animation (opacity 0→1, height 0→auto) + `aria-expanded` on toggle button + `aria-controls` with matching id. No changes needed.

---

## Part 3: Task Management UX Fixes

### 3.1 & 3.2 Add Task in Inbox & Today Views

**Problem**: InlineTaskInput takes required `parentId` prop and creates subtasks with `status: 'active'`. No way to create top-level tasks.

**Solution**: Refactor InlineTaskInput to be generic:

```typescript
type InlineTaskInputProps = {
  parentId?: string | null;   // null for top-level tasks
  defaultStatus?: 'inbox' | 'active';
  defaultToday?: boolean;
  placeholder?: string;
  label: string;              // "Add task" vs "Add subtask"
};
```

**Placement**: Add task button goes in InboxView and TodayView, OUTSIDE TaskList. This is critical because TaskList returns an empty state div when tasks.length === 0 — putting the button inside TaskList would make it disappear when the inbox is empty (exactly when you need it most).

```tsx
// InboxView.tsx
<TaskList ... />
<InlineTaskInput
  parentId={null}
  defaultStatus="inbox"
  label="Add task"
  placeholder="New inbox item..."
/>

// TodayView.tsx
<TaskList ... />
<InlineTaskInput
  parentId={null}
  defaultStatus="active"
  defaultToday={true}
  label="Add task"
  placeholder="Add to today..."
/>
```

**Keyboard shortcut**: Add `N` key to `useKeyboardShortcuts.ts`. When:
- Not in a text input
- Not in chat mode
- No overlay open (search/scratchpad/settings)

The `N` key triggers a custom event or store action that the InlineTaskInput listens to, opening the input and auto-focusing.

### 3.3 Inline Title Editing

**Problem**: Double-click on title conflicts with single-click row expand (TaskItem has `<div onClick={onToggleExpand}>` wrapping the entire row). Double-click detection would add a 300ms single-click delay — bad for a snappy, keyboard-first app.

**Solution (keyboard-first)**:
- **Keyboard**: When task is focused, press `E` to enter title edit mode. Add to `useTaskListKeyboard.ts` alongside existing `T` (toggle today) and `Enter` (expand).
- **Mouse**: Show a small pencil icon on hover (right side of title, before client badge). Click to enter edit mode. Does NOT conflict with row expand because it's a separate click target with `stopPropagation`.
- Edit mode: title `<p>` replaced by `<input>` with same text style. Enter to save, Escape to cancel, blur to save. Uses existing `updateTask` from taskStore.

**Why not double-click**: In a keyboard-first utilitarian app, every click should do exactly one thing immediately. Adding double-click detection delays single-click expand by 300ms and creates ambiguity. The `E` key is instant, discoverable through the SR hint, and consistent with the existing keyboard vocabulary (`T` for today, `Enter` for expand).

### 3.4 Quick Field Editing in TaskBody

**Current state**: TaskBody only contains a body/notes text editor. No way to edit task metadata fields (priority, dueDate, client, effort) without using AI chat.

**Design**: Add a metadata row below the body editor. Uses simple inline form controls, not popovers:

```
┌──────────────────────────────────────────────┐
│ [Body text / notes area]                     │
│                                              │
├──────────────────────────────────────────────┤
│ Priority: [▼ none]  Due: [+ date]            │
│ Client: [+ client]  Effort: [▼ unknown]      │
│ Project: [No project ▼]                      │
└──────────────────────────────────────────────┘
```

**Implementation per field:**

| Field | Control | Behavior |
|-------|---------|----------|
| Priority | `<select>` styled as badge | Options: none, low, medium, high. Change saves immediately via `updateTask`. Badge color matches priority indicator bar. |
| Due date | `<input type="date">` | Native date picker. Empty state shows "+ Due date" button that reveals the input on click. Change saves immediately. |
| Client | Inline `<input type="text">` | Empty state shows "+ Client" button. Click → text input appears. Enter/blur saves. Escape cancels. |
| Effort | `<select>` styled as badge | Options: unknown, tiny, small, medium, deep. Change saves immediately. |

**Styling**: All controls use `text-xs`, muted colors, minimal chrome. Match the existing "Add subtask" button aesthetic — understated, utilitarian, keyboard-accessible.

### 3.5 Move to Project (in TaskBody metadata row)

**Design**: Part of the field editing row (section 3.4 above). Shows as a `<select>` dropdown.

**Data source**: TaskBody already accesses `useTaskStore`. Add a selector to get project tasks:

```typescript
const projects = useTaskStore((state) =>
  state.tasks.filter(t => t.parentId === null && (t.status === 'active' || t.status === 'in_progress'))
);
```

**Behavior**:
- Shows current project name if task has parentId pointing to a project
- "No project" option sets `parentId` to null
- Selecting a project sets `parentId` to that project's ID
- If task was in inbox (`status: 'inbox'`), also update `status: 'active'` when assigning to project
- Change saves immediately via `updateTask`

---

## Implementation Order

1. `useFocusTrap` hook (dependency for 2-4)
2. SettingsMemory (a11y dialog role + semantic tabs + focus trap + tab crossfade)
3. SearchModal (a11y dialog role + focus trap + result stagger)
4. Scratchpad (focus trap only)
5. ChatView (message fade-in + confirmation dialog animation/a11y)
6. LiveThought (exit animation via AnimatePresence)
7. InlineTaskInput refactor (generic props for top-level + subtask creation)
8. InboxView & TodayView "Add task" buttons + `N` key shortcut
9. Inline title editing in TaskItem (`E` key + hover pencil icon)
10. TaskBody metadata row (priority, dueDate, client, effort selects/inputs)
11. Move to project in TaskBody metadata row

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
- Native `<select>` and `<input type="date">` — no popover/dropdown library needed
- No new packages needed
