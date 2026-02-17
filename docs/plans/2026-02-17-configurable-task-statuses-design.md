# Configurable Task Statuses

**Date:** 2026-02-17
**Status:** Approved
**Revised:** 2026-02-17 (v2 — no DB rename, added store/IPC/selector details)

## Summary

Replace the hardcoded 5-status task system with a configurable predefined palette. Users can toggle statuses on/off and reorder them in the Tasks view. No custom status creation — just enable/disable and reorder from a curated set.

## Predefined Status Palette

| ID | Label | Default On | Locked | Terminal |
|----|-------|-----------|--------|----------|
| `inbox` | Inbox | Yes | Yes | No |
| `active` | Backlog | Yes | No | No |
| `in_progress` | In Progress | Yes | No | No |
| `waiting` | On Hold | Yes | No | No |
| `review` | Review | No | No | No |
| `someday` | Someday | No | No | No |
| `cancelled` | Cancelled | No | No | Yes |
| `done` | Done | Yes | Yes | Yes |

> **Note:** Internal IDs stay as `active` and `waiting` (matching the current DB values). Display labels "Backlog" and "On Hold" come from the `PREDEFINED_STATUSES` registry. No data migration rename needed.

- **Locked** = always enabled, cannot be toggled off (Inbox is the entry point, Done is the primary exit)
- **Terminal** = represents a resolution (Done, Cancelled). Gets a timestamp, collapsed by default in views, excluded from counts and keyboard cycling.

## Data Model

### Predefined Registry

New constant in `types/models.ts`:

```typescript
export const PREDEFINED_STATUSES = [
  { id: 'inbox',       label: 'Inbox',       defaultEnabled: true,  locked: true,  terminal: false },
  { id: 'active',      label: 'Backlog',     defaultEnabled: true,  locked: false, terminal: false },
  { id: 'in_progress', label: 'In Progress', defaultEnabled: true,  locked: false, terminal: false },
  { id: 'waiting',     label: 'On Hold',     defaultEnabled: true,  locked: false, terminal: false },
  { id: 'review',      label: 'Review',      defaultEnabled: false, locked: false, terminal: false },
  { id: 'someday',     label: 'Someday',     defaultEnabled: false, locked: false, terminal: false },
  { id: 'cancelled',   label: 'Cancelled',   defaultEnabled: false, locked: false, terminal: true  },
  { id: 'done',        label: 'Done',        defaultEnabled: true,  locked: true,  terminal: true  },
] as const;

export type PredefinedStatusId = (typeof PREDEFINED_STATUSES)[number]['id'];
```

Also update `TASK_STATUS_VALUES` to include all possible statuses:

```typescript
export const TASK_STATUS_VALUES = [
  'inbox', 'active', 'in_progress', 'waiting', 'review', 'someday', 'cancelled', 'done',
] as const;
```

### User Config

Stored in existing `settings` table as a single JSON key:

```typescript
// key: 'task_statuses'
// value: JSON string
{
  enabled: ['inbox', 'active', 'in_progress', 'waiting', 'done'],
  order: ['in_progress', 'active', 'waiting', 'done']  // view order, excludes inbox (always separate)
}
```

### Schema Changes

- `tasks.status` column stays as `text` — widen the enum to include `review`, `someday`, `cancelled`
- **No rename** — `active` and `waiting` stay as-is in the DB. Display labels come from `PREDEFINED_STATUSES`.
- Add `cancelledAt` column (nullable text, mirrors `completedAt` pattern)

### Task Type Update

Add `cancelledAt` to the `Task` type in `types/models.ts`:

```typescript
export type Task = {
  // ... existing fields ...
  completedAt: string | null;
  cancelledAt: string | null;  // NEW
};
```

## Service Layer Changes

### New Service Functions (`taskService.ts`)

```typescript
cancelTask(id, source) → {
  status: 'cancelled',
  cancelledAt: new Date().toISOString(),
  // Also cancels active children if completeChildren option set
}

reopenTask(id, source) → {
  status: firstEnabledNonTerminal,  // reads from task_statuses setting
  completedAt: null,
  cancelledAt: null,
}
```

### Task Event Action Enum

Add `'cancel'` to `task_events.action` enum:

```typescript
action: text('action', {
  enum: ['create', 'update', 'move', 'complete', 'cancel', 'delete'],
}).notNull(),
```

`cancelTask` logs a `'cancel'` event (distinct from `'complete'`), enabling audit trail differentiation.

### IPC Handlers

New handlers in `ipc.ts`:

```typescript
'tasks:cancel':      (id: string) => cancelTask(id, 'user')
'tasks:reopen':      (id: string) => reopenTask(id, 'user')
'tasks:getStatuses': () => getTaskStatusConfig()  // reads from settings table
'tasks:setStatuses': (config: TaskStatusConfig) => setTaskStatusConfig(config)
```

### Preload API

Extend `flusk.tasks` in preload:

```typescript
cancel: (id: string) => ipcRenderer.invoke('tasks:cancel', id),
reopen: (id: string) => ipcRenderer.invoke('tasks:reopen', id),
getStatuses: () => ipcRenderer.invoke('tasks:getStatuses'),
setStatuses: (config) => ipcRenderer.invoke('tasks:setStatuses', config),
```

## Store Layer Changes

### Task Store (`taskStore.ts`)

New actions:

```typescript
cancelTask: async (id) => {
  // Optimistic: set status='cancelled', cancelledAt=now
  // Call flusk.tasks.cancel(id)
  // Rollback on failure
}

reopenTask: async (id) => {
  // Optimistic: set status=firstEnabledNonTerminal, clear completedAt/cancelledAt
  // Call flusk.tasks.reopen(id)
  // Rollback on failure
}
```

### Selector Updates

These selectors currently filter `status !== 'done'` and must also exclude `'cancelled'`:

```typescript
// taskStore.ts
selectTodayTasks:    filter t.status not in terminal statuses (done, cancelled)
selectProjectTasks:  filter t.status not in [inbox, ...terminal]
selectInboxTasks:    no change (already filters status === 'inbox')

// Any sidebar count logic: exclude all terminal statuses
```

### Task Status Config Store

New store or extend settings store to hold the status config reactively:

```typescript
// Option A: Dedicated store (simpler)
type TaskStatusConfigStore = {
  config: TaskStatusConfig | null;
  fetchConfig: () => Promise<void>;
  updateConfig: (config: TaskStatusConfig) => Promise<void>;
}

// Option B: Extend existing settings pattern
// Either way, components that need enabled/order info subscribe to this store.
```

The config store loads on app init and is the single source of truth for which statuses are enabled and their order. Components never read from the settings table directly.

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

### Dynamic `statusLaneDrag.ts`

Currently `StatusLaneKey`, `STATUS_LANE_KEYS`, `StatusLaneTaskIds`, and `cloneStatusLaneTaskIds` are all hardcoded to 4 specific statuses. These must become dynamic:

- `StatusLaneKey` = any enabled status excluding `inbox`
- `STATUS_LANE_KEYS` = derived from config store's enabled + ordered list
- `StatusLaneTaskIds` = `Record<string, string[]>` (dynamic keys)
- `cloneStatusLaneTaskIds` = generic object clone instead of manual 4-key spread
- `moveTaskAcrossStatusLanes` + `flattenStatusLaneTaskIds` = iterate config-driven keys

### Drag Between Lanes

- Dragging into Done → `completeTask()` (sets `completedAt`)
- Dragging into Cancelled → `cancelTask()` (sets `cancelledAt`)
- Dragging out of a terminal lane → `reopenTask()` (clears timestamps, sets target status)
- All other cross-lane drags → `updateTask({ status })`

### Status Dropdown (TaskBody)

- Only shows enabled statuses
- Ordered by user's custom order
- Terminal statuses at bottom, separated by divider
- Replace hardcoded `STATUS_OPTIONS` and `STATUS_LABEL` with config-driven lists

### Other Views

- **Today view** — no change. Shows all non-terminal, today-flagged tasks.
- **Inbox view** — no change. Dedicated view.
- **Sidebar count** — excludes all terminal statuses (Done + Cancelled).

## Keyboard & Interactions

### S Key Cycle

- Cycles through enabled non-terminal statuses in user's custom order
- Skips terminal statuses (Done, Cancelled)
- Example default: `active → in_progress → waiting → active`
- Example with Review: `active → in_progress → waiting → review → active`
- S on Inbox task → promotes to first enabled non-terminal status

**Breaking change:** Currently S cycles through `active → in_progress → waiting → done → active`. After this change, S skips terminal statuses. Users must use checkbox or context menu to complete/cancel.

### `taskInteraction.ts` Changes

```typescript
// getNextStatusInCycle(current, enabledOrder) — now takes config
// getStatusAfterToggleComplete(current, enabledOrder) — reopen target is first enabled non-terminal

// Both functions receive the enabled non-terminal status list from config
// instead of using hardcoded sequences.
```

### Checkbox Toggle

- Check → `completeTask()` (→ Done), no change
- Uncheck → `reopenTask()` → first enabled non-terminal status (was hardcoded to `active`)

### Context Menu

- "Move to Inbox" / "Move to Tasks" — no change
- New: "Cancel task" option (only visible if Cancelled is enabled, only for non-terminal tasks)

## Migration

### Drizzle Migration

Standard Drizzle migration to:

1. Widen `tasks.status` enum to include `review`, `someday`, `cancelled`
2. Add `cancelledAt` column (nullable text)
3. Add `'cancel'` to `task_events.action` enum

### One-Time Data Migration

Runs on app startup if no `task_statuses` setting exists:

1. Write default config to settings table (using `defaultEnabled` values from `PREDEFINED_STATUSES`)

**No row-level data migration needed** — existing `active`/`waiting` values are valid as-is.

### Fresh Install

No settings key → use `defaultEnabled` and default order from predefined registry. No migration needed.

## Edge Cases

1. **All middle statuses disabled** — Only Inbox and Done remain. S key on inbox promotes directly to done via checkbox. Valid but degenerate — user's choice.

2. **AI creates task with disabled status** — Fall back to first enabled non-terminal status.

3. **Undo restores disabled status** — Task events log stores original status. Undo falls back to first enabled non-terminal status instead of restoring disabled status.

4. **Recurrent task spawn** — Still spawns as `inbox` (no change).

5. **Orphaned tasks with disabled status** — If a task somehow has a disabled status, it appears in a catch-all "Other" section at the bottom of Tasks view rather than disappearing silently.

6. **Parent promotion on subtask add** — Currently promotes inbox parent to `'active'`. No change needed since `active` remains a valid status ID.
