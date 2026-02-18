# Notification System Revamp

## Problem

The current notification/reminder system is unreliable:

1. Entire pipeline gated behind `isAiEnabled()` — no AI = no reminders
2. `setTimeout` silently fails for due dates >24.8 days out (JS `MAX_SAFE_TIMEOUT`)
3. No catch-up for missed reminders (app was closed/asleep when task was due)
4. Past-due tasks skipped on startup — gone forever
5. Native notifications only fire when window is NOT focused — easy to miss otherwise
6. Due date picker allows past dates and has no quick presets

## Design

### Architecture

```
┌─────────────────────────────────────┐
│  Reminder Scheduler                 │  ← Single new module
│  - Scans tasks with due dates       │
│  - Schedules timers per offset      │
│  - Shows native macOS notifications │
│  - Optionally triggers AI chat      │
│  - Overdue catch-up on startup      │
├─────────────────────────────────────┤
│  Due Date Picker (UI)               │  ← Enhanced existing component
│  - Quick presets (Today, etc.)      │
│  - No past dates                    │
│  - Per-task reminder offset         │
└─────────────────────────────────────┘
```

No event emitter system. Uses dependency injection for the AI callback,
matching the existing `subscribeTaskChanges` / `ProactiveLoopDeps` patterns.

### Reminder Scheduler

New module: `src/main/services/reminderScheduler.ts`

Replaces scheduling + notification logic currently embedded in `proactiveLoop.ts`.

**Timer strategy:**

- Uses a **1-hour recurring interval** that re-evaluates all active tasks
- Only creates precise `setTimeout` for tasks due within the next hour
- This avoids the JS `MAX_SAFE_TIMEOUT` (~24.8 day) limit entirely
- **First scan runs immediately on init** (no 1-hour gap on startup)
- Also rescans on task changes via `subscribeTaskChanges()` (debounced 2s)

**Notification routing:**

```
Timer fires for a task
  → ALWAYS: show native macOS notification
  → ADDITIONALLY, IF ai callback provided: trigger AI chat turn

App startup
  → Collect all overdue tasks
  → IF count == 1: native notification for that single task
  → IF count > 1: summary notification ("3 tasks overdue")
  → Click brings app to focus (overdue tasks already highlighted red in list)
```

**Notification format:**

| Type | Title | Body |
|------|-------|------|
| Upcoming (offset) | "Task due in 15 minutes" | Task title |
| Due now | "Task due now" | Task title |
| Overdue (single) | "Task overdue" | Task title |
| Overdue (summary) | "3 tasks overdue" | First 2-3 task titles |

**Click behavior:**

- Single task notifications → app focuses, selects that task via `TASK_NAVIGATE` IPC
- Summary notification → app focuses (overdue tasks are already visually distinct)

**Cooldown:**

- Per-task in-memory map keyed by `taskId:offset`
- Resets on app restart (fine — startup handles overdue catch-up)

**Dependencies (injected):**

```ts
type ReminderSchedulerDeps = {
  fireAiReminder?: (taskContext: { id: string; title: string }) => Promise<void>;
};
```

AI callback is optional. When not provided (AI disabled), native notifications still work.
When AI is enabled, `index.ts` wires in the callback from the simplified `proactiveLoop.ts`.

### proactiveLoop.ts Simplification

The `ProactiveLoop` class becomes a single exported function:

```ts
export function fireAiReminder(
  taskContext: { id: string; title: string },
  deps: { startProactiveTurn: ... },
): Promise<void>
```

- Builds trigger message, calls `startProactiveTurn`, streams to all windows
- No class, no singleton, no timer management
- The existing AI chat turn mechanics (system prompt, streaming, tool restrictions) stay unchanged

### Schema Changes

New column on `tasks` table:

```sql
ALTER TABLE tasks ADD COLUMN reminder_offset TEXT DEFAULT 'at_due';
```

Values: `'at_due'` | `'15m'` | `'1h'` | `'1d'`

Parsed to milliseconds by scheduler:
- `at_due` → 0ms
- `15m` → 900,000ms
- `1h` → 3,600,000ms
- `1d` → 86,400,000ms

Default: `at_due` — zero friction for users who don't care.

Drizzle schema addition:
```ts
reminderOffset: text('reminder_offset').default('at_due'),
```

### Due Date Picker UI

Three improvements to `TaskDueDatePicker.tsx`:

**A. Quick presets**

Row of chip buttons above the calendar:
```
[ Today ]  [ Tomorrow ]  [ Next Week ]
```

- Today → today's date, no time
- Tomorrow → tomorrow's date, no time
- Next Week → next Monday, no time
- Clicking a preset sets the date immediately and closes the popover
- Calendar still available below for custom date picking

**B. No past dates**

- Calendar `disabled` prop set to `{ before: today }` — past dates greyed out
- Existing tasks with past due dates still display correctly (read-only display unaffected)

**C. Reminder offset selector**

Appears below the time input when a due date is set:

```
Remind me:  [ At due time ▾ ]
```

Options: At due time · 15 min before · 1 hour before · 1 day before

- Only visible when task has a due date
- Defaults to "At due time"
- Requires `reminderOffset` prop added to `TaskDueDatePickerProps`
- Change propagated via new `onReminderOffsetChange` callback

## File Changes

### New files
- `src/main/services/reminderScheduler.ts` — scheduler + native notifications
- `drizzle/0008_add_reminder_offset.sql` — migration

### Modified files
- `src/main/db/schema.ts` — add `reminderOffset` column
- `src/main/assistant/proactiveLoop.ts` — simplify class → exported function
- `src/main/index.ts` — init scheduler independently of `isAiEnabled()`, wire AI callback conditionally
- `src/main/services/taskService.ts` — accept `reminderOffset` in create/update schemas
- `src/types/ipc.ts` — add `TASK_NAVIGATE` channel
- `src/renderer/components/tasks/TaskDueDatePicker.tsx` — presets, past date blocking, offset selector
- Renderer task navigation handler — listen for `TASK_NAVIGATE` IPC and select/scroll to task

### Simplified
- `proactiveLoop.ts` — class → single function, no timers, no singleton
- `index.ts` — remove `isAiEnabled()` gate (scheduler always starts, AI callback conditional)

### Not changing
- AI chat turn mechanics (system prompt, streaming, tools)
- Tray behavior
- Backup/update schedulers
