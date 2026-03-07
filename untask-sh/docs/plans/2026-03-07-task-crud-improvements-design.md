# Task CRUD Improvements Design

## Summary

Improve task CRUD operations across Kanban and List views. Replace the current full-panel TaskDetail with a centered modal overlay. Add inline quick-add inputs for task creation. Add drag-and-drop for moving and reordering tasks in Kanban. Add delete with confirmation. Autosave all edits.

## Current State

- **Create:** No UI. Backend `addTask()` exists but nothing calls it.
- **Read:** Works. Kanban and List views display tasks.
- **Update:** Only body (Milkdown editor) and status (dropdown) are editable. Title, priority, tags are read-only. Editing requires navigating away from the board/list to a full TaskDetail panel.
- **Delete:** No UI. Backend `deleteTask()` exists but nothing calls it.
- **Movement:** Small arrow buttons on hover to shift tasks between adjacent Kanban columns. No drag-and-drop.
- **Ordering:** No manual ordering. Tasks sorted by ID.

## Design

### 1. Inline Quick-Add (Create)

**Kanban:** Each column gets a "+ Add task" button at the bottom. Clicking reveals a text input. Type a title, press Enter to create a task with that column's status. Press Escape or click away to hide the input. Input auto-clears after creation for rapid-fire adding.

**List:** Same pattern. "+ Add task" row at the bottom of the table. Creates with default status (first configured column, e.g., "backlog").

### 2. Task Modal (Edit)

Clicking a task card (in either view) opens a centered modal with dimmed backdrop. Replaces the current full-panel TaskDetail navigation.

**Layout:**

```
+--------------------------------------------------+
|                                        [trash]  X |
|  [Title - click to edit inline]                   |
|                                                   |
|  [Status dropdown] [Priority dot] [Tag chips +]   |
|                                                   |
|  ------------------------------------------------ |
|  Add a description...                             |
|  (click to expand Milkdown editor)                |
|                                                   |
|                                                   |
|                                                   |
|  ------------------------------------------------ |
|  Created: 2026-03-01  Updated: 2026-03-07         |
+--------------------------------------------------+
```

**Field editing:**

| Field | Interaction |
|-------|-------------|
| Title | Rendered as text. Click to edit inline. Enter to confirm, Escape to cancel. |
| Status | Dropdown with configured columns. Change fires update immediately. |
| Priority | Clickable dot/selector cycling: none > low > medium > high > urgent. |
| Tags | Inline tag chips. Small "+ Add tag" input. Click chip X to remove. |
| Body | Collapsed by default. Shows "Add a description..." placeholder or preview text. Click to expand Milkdown editor. |
| Dates | Read-only muted text at the bottom (created, updated). |

**Autosave:** Every field change fires `updateTask()` immediately. No save button. Modal closes on Escape or backdrop click.

### 3. Delete

Trash icon in the top-right of the task modal. Click shows an inline confirmation prompt: "Delete this task?" with Cancel / Delete buttons. Confirm calls `deleteTask()`, modal closes, view refreshes.

### 4. Drag-and-Drop (Kanban)

**Between columns:** Drag a task card from one column to another to change its status. Drop position determines ordering within the target column.

**Within a column:** Drag to reorder tasks manually. Drop between existing cards to set position.

**Replaces** the current left/right arrow buttons, which will be removed.

**Non-drag status changes** (e.g., changing status via the dropdown in the modal) place the task at the bottom of the target column.

### 5. Manual Ordering

Add a `position` field to the task data model:

- **Frontmatter:** `position: <float>` (fractional positioning to avoid reindexing on every reorder)
- **Rust model:** `position: Option<f64>` on `Task` struct
- **DTO:** `position: number | null` in `TaskDto` and `TaskUpdateDto`
- **Default:** New tasks get `position = max_position_in_column + 1`
- **Reorder:** When dropped between two tasks, new position = midpoint of neighbors
- **Rebalance:** If positions get too close (precision issues), reindex the entire column with integer spacing

Tasks within each Kanban column and in the List view sort by `position` (ascending) as the primary sort.

### 6. Task Card Display

Task cards in both views should show all supported metadata:

- Priority dot (colored, small)
- Title
- Tags (as small chips/badges)
- Subtask progress (e.g., "2/5" or a small progress bar, if subtasks exist)
- Updated date (muted, relative like "2d ago")

Keep cards compact and dense per the design language.

## Component Changes

| Component | Change |
|-----------|--------|
| `Kanban.svelte` | Add quick-add input per column. Replace task click handler to open modal. Add drag-and-drop. Remove arrow buttons. Enrich card display. Sort by position. |
| `TaskList.svelte` | Add quick-add row at bottom. Replace row click to open modal. Enrich row display. Sort by position as default. |
| **New: `TaskModal.svelte`** | Centered modal with backdrop. All fields editable inline. Autosave. Delete with confirmation. |
| `App.svelte` | Remove TaskDetail panel navigation. Manage modal open/close state (selected task ID). |
| `TaskDetail.svelte` | Remove (replaced by TaskModal). |
| `MilkdownEditor.svelte` | No changes. Reused inside TaskModal. |
| `api.ts` | No changes to existing functions. Types updated to include `position`. |

## Backend Changes

| Area | Change |
|------|--------|
| `task.rs` | Add `position: Option<f64>` to `Task` struct. Parse/serialize in frontmatter. |
| `store.rs` | Assign default position on task creation. Support position in updates. |
| `commands.rs` | Add `position` to `TaskUpdateDto`. No new commands needed. |
| Frontmatter | New optional field `position: <float>`. |

## Design System Compliance

All new UI must follow `docs/untask-design-language.md`:

- **Modal radius:** `10-12px` (not `6px`)
- **Modal shadow:** `0 16px 40px -12px rgba(0,0,0,0.4)`
- **Modal backdrop:** subtle blur, dimmed background
- **Modal animation:** fade + scale from `0.96` to `1`, `300ms` duration. No bounce or elastic motion.
- **Tags:** monochrome bordered chips only. `20px` high, `10px` mono text, border at `60-70%` alpha. Do NOT use colorful pill soup.
- **Priority:** tiny `5px` dot. Cycling interaction uses a subtle hover cue (slightly larger, or cursor change) — never turns into a loud badge.
- **Task card rows:** `40px` min height, `13px` sans title, `10-11px` mono metadata
- **Quick-add input:** compact, mono placeholder hints, dashed border when empty
- **Spacing:** `4px` rhythm. Paddings of `6/8/10/12px`. Dense, not airy.
- **Color:** monochrome first. Color only for priority dots and destructive actions.
- **Delete button:** uses `--destructive` token. Muted dark red on dark mode, `#DC2626` on light.

## Edge Cases

### Unindexed tasks (id = null)

- **Modal:** opens in read-only mode. All fields disabled. Warning banner shown: "This file is not managed by Untask yet. Repair or reindex before editing."
- **Quick-add:** not affected (new tasks always get an ID)
- **Drag-and-drop:** unindexed task cards are NOT draggable. No drag handle or drag affordance.
- **Delete:** not available for unindexed tasks (no ID to reference)

### Unmatched status

- **Modal status dropdown:** includes the current unmatched status value as the first option, plus all configured columns. User can select a configured column to normalize it.
- **Kanban drag:** dragging TO or FROM the `__unmatched` virtual column is disabled. Unmatched tasks can only be fixed via the status dropdown in the modal.

### Empty title

- **Quick-add:** pressing Enter on an empty input is a no-op. Input stays visible.
- **Modal title edit:** if user clears the title and blurs, revert to the previous title. Never save an empty title.

### Autosave behavior

- **Title:** saves on blur or Enter. Does NOT save on every keystroke. If user presses Escape, reverts to the previous value.
- **Status/Priority/Tags:** save immediately on change (single discrete actions).
- **Body (Milkdown editor):** saves on blur (leaving the editor area), NOT on every keystroke. This prevents mid-edit markdown corruption.
- **Error handling:** if `updateTask()` fails, show a brief inline error indicator (e.g., red border flash) and revert the field. Do not show a blocking alert.

### Concurrent edits / file watcher refresh

- **Modal open during refresh:** if `untask://project-refresh` fires while the modal is open, silently reload the task data from the backend. Do NOT close the modal. Preserve any in-progress edits (if the user is mid-keystroke in the title, don't overwrite).
- **Task deleted externally:** if `getTask()` returns not-found during a refresh, close the modal and show a brief toast/notice: "Task was deleted."

### Drag-and-drop edge cases

- **Dragging unindexed tasks:** disabled (no drag affordance shown)
- **Dragging to/from `__unmatched` column:** disabled
- **Dropping on same position:** no-op, no API call
- **Empty columns:** must have a visible drop zone area (min-height, dashed border placeholder) so cards can be dropped into empty columns
- **Modal open during drag:** if the modal is open, drag-and-drop is disabled across the board. Close the modal first.

### Position field migration

- **Existing tasks:** have no `position` field. On first render, tasks without a position are sorted by ID and displayed in that order. No file rewrite occurs.
- **First reorder:** when a task is dragged for the first time, all tasks in the affected column get position values assigned (integer spacing: 1.0, 2.0, 3.0...), then the dragged task gets its new position.
- **Fractional precision:** when the gap between two adjacent positions drops below `0.001`, rebalance the entire column by reassigning integer positions (1.0, 2.0, 3.0...).
- **Position in frontmatter:** stored as `position: 1.5` (YAML float). Optional field — omitted if not set.

### List view quick-add

- Creates tasks with the default status (first configured column, e.g., "backlog").
- Placeholder text should indicate this: `"Add task to backlog..."` (dynamically using the actual default column name).

### Accessibility

- Drag-and-drop has no keyboard alternative for within-column reordering. Acceptable for v1.
- Cross-column movement is covered by the status dropdown in the modal (keyboard accessible).
- All modal fields are keyboard navigable (Tab order, Enter/Escape for title edit).

## Out of Scope

- Global shortcut (Cmd+N) for task creation
- Automatic sorting (by priority, date, etc.) — manual only for now
- Archive/soft-delete
- Bulk operations
- Search/filter in Kanban view
- Drag-and-drop in List view (reorder via List is lower priority)
- Keyboard-based within-column reordering
