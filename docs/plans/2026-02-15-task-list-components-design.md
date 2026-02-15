# Task List Components with Drag-and-Drop - Design (Resolved)

Task 6. Build the task list UI with inline expansion, checkbox interactions, drag-to-reorder, project grouping, and keyboard navigation.

This version resolves all pre-implementation blockers discovered in review and is ready to implement.

## Final Decisions

- One shared `TaskItem` is used by Today, Inbox, and Projects subtasks.
- Dragging is restricted to list scope (no cross-view, no cross-project-group, no reparent via drag).
- Existing store/IPC contracts stay unchanged.
- Reorder is implemented as **scoped visual reorder + global payload reconciliation**.
- `LiveThought` remains at the top of Today view.
- Active views hide completed tasks.

## Existing Constraints We Must Respect

1. `taskStore.reorderTasks(ids)` requires a complete ordered ID list of all tasks, not a subset.
2. `tasks.order` is a single global field (no per-view/per-parent order columns).
3. Current renderer theme tokens are `accent`, `ring`, `muted`, etc. (`--hover` / `--interactive` do not exist yet).

## Data and Filtering Rules

These replace ambiguous/underspecified filter behavior:

- Today view tasks: `today === true && status !== 'done'`
- Inbox view tasks: `status === 'inbox' && parentId === null && today !== true`
- Projects view:
1. Parent tasks: `parentId === null && status !== 'inbox' && status !== 'done'`
2. Subtasks: grouped by `parentId`
3. Render only parents that have at least one non-done subtask

Notes:

- Subtasks can appear in Today if flagged `today`.
- Done tasks stay persisted in DB but are hidden from active lists.

## Reorder Contract (Critical)

### UX rule

- Reorder is only allowed within the currently rendered list scope.
- Cross-group and cross-view drops are ignored.

### Store/API rule

`reorderTasks` still receives a full ordered ID list.

### Reconciliation algorithm

When a scoped list is reordered:

1. Compute reordered IDs for just that scope via `arrayMove`.
2. Rebuild full ID order by walking global ordered IDs and replacing only IDs in the scope, in their new scoped order.
3. Call `taskStore.reorderTasks(fullOrderedIds)`.

Result:

- Non-scope task relative order is preserved.
- Scope reorder is persisted without requiring schema or IPC changes.

## File Structure

```text
flusk/src/renderer/components/tasks/
├── TaskItem.tsx
├── TaskList.tsx
├── TaskBody.tsx
├── ProjectGroup.tsx
└── InlineTaskInput.tsx

flusk/src/renderer/hooks/
└── useTaskListKeyboard.ts

flusk/src/renderer/components/ui/
└── textarea.tsx
```

## View Integration

- `TodayView` keeps `LiveThought`, then renders one `<TaskList>`.
- `InboxView` renders one `<TaskList>`.
- `ProjectsView` now receives `allTasks` and derives groups internally, rendering `<ProjectGroup>` entries.
- `AppShell` must pass `allTasks` to `ProjectsView` (not only prefiltered parent rows).

## New Packages

- `@dnd-kit/core`
- `@dnd-kit/sortable`
- `@dnd-kit/utilities`
- `react-markdown`

## Component Specs

## `TaskItem`

44px row, shared across views.

- Left priority indicator (2px)
- Checkbox with completion animation (~300ms)
- Title + optional client badge
- Row click (except checkbox/controls) toggles expand
- Sortable row via `useSortable`
- Uses existing tokens/classes (`bg-accent/40`, `ring-ring`, `text-muted-foreground`)

```ts
interface TaskItemProps {
  task: Task;
  isExpanded: boolean;
  isFocused: boolean;
  onToggleExpand: (id: string) => void;
  onComplete: (id: string) => void;
  onToggleToday: (id: string) => void;
  onBodyEditModeChange?: (editing: boolean) => void;
}
```

## `TaskList`

Sortable list wrapper with expansion and keyboard handling.

```ts
interface TaskListProps {
  tasks: Task[];            // visible scope
  allTasks: Task[];         // globally ordered source for reorder reconciliation
  emptyMessage: string;
  emptyAction?: string;
  ariaLabel: string;
  scopeId: string;          // e.g. "today", "inbox", "project:<parentId>"
  indentPx?: number;
}
```

dnd-kit:

- `PointerSensor` (8px activation)
- `KeyboardSensor`
- `SortableContext` + `verticalListSortingStrategy`
- `closestCenter`
- Drag overlay mirrors row with subtle shadow

State in `TaskList`:

- `expandedTaskId: string | null` (single-expanded behavior)
- `focusedIndex: number`
- `isAnyBodyEditing: boolean`

## `ProjectGroup`

Parent task header + collapsible subtask list + inline subtask input.

```ts
interface ProjectGroupProps {
  parentTask: Task;
  subtasks: Task[];      // non-done subtasks for rendering/reorder
  allTasks: Task[];      // passed through to nested TaskList
  completedCount: number;
  totalCount: number;
}
```

Behavior:

- Header button toggles collapse (`aria-expanded`, `aria-controls`)
- Progress shown as `completedCount/totalCount`
- Nested `TaskList` scope: `project:<parentId>`
- `InlineTaskInput` at bottom when expanded

## `TaskBody`

Inline expandable body renderer/editor.

- Read mode: `react-markdown`
- Edit mode: `Textarea` (`ui/textarea.tsx`)
- Save: `Cmd+Enter` and `Ctrl+Enter`
- Cancel: `Escape`
- Empty placeholder: `Add notes...`
- Reduced-motion aware animation (respect `prefers-reduced-motion`)

## `InlineTaskInput`

- Collapsed ghost button: `+ Add subtask`
- Expanded input auto-focus
- `Enter`: `createTask({ title, parentId, status: 'active', priority: 'none' })`
- `Escape`: collapse
- Blur: collapse when empty

## Keyboard Behavior (`useTaskListKeyboard`)

Attached to TaskList container with roving focus:

- `ArrowDown` / `ArrowUp`: move focus
- `Enter`: toggle expand on focused row
- `T`: toggle today on focused row
- `Escape`: cancel edit or collapse expanded row, then blur list if nothing expanded

Guards:

- Ignore while TaskBody is editing
- Ignore when chat input or other text field is focused
- Ignore when drag interaction is active
- Stop handling at list boundaries (no wrap)

Accessibility:

- TaskList: `role="listbox"` + `aria-label`
- TaskItem: `role="option"` + `aria-selected`
- Checkbox uses native semantics (`input` or button with proper `aria-label`)
- Project headers use button semantics with expanded/collapsed announcement

## Styling Tokens (Resolved)

Use current theme tokens/classes, no new CSS variables required for this task:

- Hover: `bg-accent/40` with 100ms transition
- Focus ring: `ring-1 ring-ring`
- Secondary text: `text-muted-foreground`

If later we want semantic aliases (`--hover`, `--interactive`), add them in a dedicated theme task.

## Implementation Order

1. Install packages (`dnd-kit`, `react-markdown`)
2. Add `ui/textarea.tsx`
3. Build `TaskBody`
4. Build `TaskItem`
5. Build `useTaskListKeyboard`
6. Build `TaskList` with scoped reorder reconciliation
7. Build `InlineTaskInput`
8. Build `ProjectGroup`
9. Refactor `TodayView`, `InboxView`, `ProjectsView`
10. Update `AppShell` Projects data flow (`allTasks` pass-through)
11. Validate lint + typecheck

## Acceptance Gates Before Marking Task 6 Done

1. Drag reorder works in Today, Inbox, and within each ProjectGroup, with persistence after reload.
2. Reorder payload always includes full task ID ordering (no store contract violations).
3. Today still renders `LiveThought`.
4. Inbox excludes today-flagged and nested tasks.
5. Active views hide done tasks.
6. `TaskBody` edit/save/cancel works with `Cmd+Enter` and `Ctrl+Enter`.
7. Keyboard navigation and focus rings work without conflicting with global shortcuts.
8. Lint and TypeScript checks pass for touched scope.
