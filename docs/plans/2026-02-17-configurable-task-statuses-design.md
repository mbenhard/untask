# Configurable Task Statuses

**Date:** 2026-02-17
**Status:** Approved

## Summary

Replace the hardcoded 5-status task system with a configurable predefined palette. Users can toggle statuses on/off and reorder them in the Tasks view. No custom status creation — just enable/disable and reorder from a curated set.

## Predefined Status Palette

| ID | Label | Default On | Locked | Terminal |
|----|-------|-----------|--------|----------|
| `inbox` | Inbox | Yes | Yes | No |
| `backlog` | Backlog | Yes | No | No |
| `in_progress` | In Progress | Yes | No | No |
| `on_hold` | On Hold | Yes | No | No |
| `review` | Review | No | No | No |
| `someday` | Someday | No | No | No |
| `cancelled` | Cancelled | No | No | Yes |
| `done` | Done | Yes | Yes | Yes |

- **Locked** = always enabled, cannot be toggled off (Inbox is the entry point, Done is the primary exit)
- **Terminal** = represents a resolution (Done, Cancelled). Gets a timestamp, collapsed by default in views, excluded from counts and keyboard cycling.

## Data Model

### Predefined Registry

New constant in `types/models.ts`:

```typescript
export const PREDEFINED_STATUSES = [
  { id: 'inbox',       label: 'Inbox',       defaultEnabled: true,  locked: true,  terminal: false },
  { id: 'backlog',     label: 'Backlog',      defaultEnabled: true,  locked: false, terminal: false },
  { id: 'in_progress', label: 'In Progress',  defaultEnabled: true,  locked: false, terminal: false },
  { id: 'on_hold',     label: 'On Hold',      defaultEnabled: true,  locked: false, terminal: false },
  { id: 'review',      label: 'Review',       defaultEnabled: false, locked: false, terminal: false },
  { id: 'someday',     label: 'Someday',      defaultEnabled: false, locked: false, terminal: false },
  { id: 'cancelled',   label: 'Cancelled',    defaultEnabled: false, locked: false, terminal: true  },
  { id: 'done',        label: 'Done',         defaultEnabled: true,  locked: true,  terminal: true  },
] as const;
```

### User Config

Stored in existing `settings` table as a single JSON key:

```typescript
// key: 'task_statuses'
// value: JSON string
{
  enabled: ['inbox', 'backlog', 'in_progress', 'on_hold', 'done'],
  order: ['in_progress', 'backlog', 'on_hold', 'done']  // view order, excludes inbox (always separate)
}
```

### Schema Changes

- `tasks.status` column stays as `text` — widen accepted values
- Rename existing values: `active` → `backlog`, `waiting` → `on_hold`
- Add `cancelledAt` column (nullable text, mirrors `completedAt` pattern)

## Settings UI

### New "Tasks" Tab

Located in SettingsView between General and AI tabs.

Contains one section: **Status Lanes**

- Vertical list of all 8 predefined statuses
- Each row: drag handle | status label | toggle switch
- Locked statuses (Inbox, Done) show toggle as disabled/always-on with lock icon
- Drag-to-reorder via dnd-kit
- Inbox is not in the reorderable list (always separate in its own view)
- Terminal statuses (Done, Cancelled) always sort below non-terminal statuses — reorderable relative to each other but not above non-terminal

### Disabling a Status With Tasks

- Toggle does not flip immediately
- Inline dialog appears: "N tasks are in [Status]. Move them to:" with dropdown of other enabled non-terminal statuses
- User picks target → tasks move → status disables
- If 0 tasks in that status, toggle flips instantly

### Enabling a Status

- Toggle flips instantly
- New lane appears at the bottom of non-terminal section in Tasks view
- User can drag to reorder

### Persistence

- Every change writes to `settings` table immediately (no save button)
- Same pattern as existing settings

## Tasks View Behavior

### Lane Rendering

- Only enabled statuses appear as lanes
- Lane order follows user's custom order from settings
- Terminal statuses collapsed by default, non-terminal open
- Inbox remains its own separate view (no change)

### Drag Between Lanes

- Dragging into Done → `completeTask()` (sets `completedAt`)
- Dragging into Cancelled → `cancelTask()` (sets `cancelledAt`)
- Dragging out of a terminal lane → clears timestamp, sets target status
- All other cross-lane drags → `updateTask({ status })`

### Status Dropdown (TaskBody)

- Only shows enabled statuses
- Ordered by user's custom order
- Terminal statuses at bottom, separated by divider

### Other Views

- **Today view** — no change. Shows all non-terminal, today-flagged tasks.
- **Inbox view** — no change. Dedicated view.
- **Sidebar count** — excludes all terminal statuses (Done + Cancelled).

## Keyboard & Interactions

### S Key Cycle

- Cycles through enabled non-terminal statuses in user's custom order
- Skips terminal statuses (Done, Cancelled)
- Example default: `backlog → in_progress → on_hold → backlog`
- Example with Review: `backlog → in_progress → on_hold → review → backlog`
- S on Inbox task → promotes to first enabled non-terminal status

### Checkbox Toggle

- Check → `completeTask()` (→ Done), no change
- Uncheck → reopen to first enabled non-terminal status (was hardcoded to `active`)

### Context Menu

- "Move to Inbox" / "Move to Tasks" — no change
- New: "Cancel task" option (only visible if Cancelled is enabled, only for non-terminal tasks)

### New Service Functions

```typescript
cancelTask(id) → { status: 'cancelled', cancelledAt: new Date().toISOString() }
reopenTask(id) → { status: firstEnabledNonTerminal, completedAt: null, cancelledAt: null }
```

## Migration

### One-Time Data Migration

Runs on app startup if no `task_statuses` setting exists:

1. Rename `active` → `backlog` in tasks table
2. Rename `waiting` → `on_hold` in tasks table
3. Add `cancelledAt` column (nullable text)
4. Write default config to settings table

### Fresh Install

No settings key → use `defaultEnabled` and default order from predefined registry. No migration needed.

## Edge Cases

1. **All middle statuses disabled** — Only Inbox and Done remain. S key on inbox promotes directly to done via checkbox. Valid but degenerate — user's choice.

2. **AI creates task with disabled status** — Fall back to first enabled non-terminal status.

3. **Undo restores disabled status** — Task events log stores original status. Undo falls back to first enabled non-terminal status instead of restoring disabled status.

4. **Recurrent task spawn** — Still spawns as `inbox` (no change).

5. **Orphaned tasks with disabled status** — If a task somehow has a disabled status, it appears in a catch-all "Other" section at the bottom of Tasks view rather than disappearing silently.
