# Deadline Notifications — Design

## Objective

Make deadline reminders reliable and impossible to miss. One notification at the right time, one visual indicator when overdue, no complexity.

## Design Decisions

- **Alarm clock model**: deadlines demand attention at the exact time
- **No hard/soft distinction**: one deadline, one behavior. `dueType` field is retired from active use (column stays, nothing reads it)
- **No working hours gate**: if the app is running, the assistant is active. Removed from all proactive triggers, not just deadlines.
- **No over-engineering**: no cron, no persistence layer, no settings UI for schedules

---

## 1. Reminder Timing

| Due Date Format | Notification Fires At |
|---|---|
| Date + time (`2026-02-17T14:30`) | Exactly 14:30 local time |
| Date only (`2026-02-17`) | 9:00 AM local time on that date |

Each reminder fires **once per task**. No repeats. If the user ignores it, the overdue badge in the task list is the ongoing signal.

Past-due tasks don't get scheduled — they're already overdue.

---

## 2. Reminder Scheduling

Replace the current ~35-minute rolling horizon with a full scan approach:

- **On app launch** → scan all active tasks with `dueDate`, schedule a `setTimeout` for each future deadline
- **On any task change** (create, update, complete, delete) → clear all timers, reschedule from scratch
- **On task completion** → cancel that task's timer
- **Date-only deadlines** → compute 9:00 AM local time on the due date as the target timestamp

Implementation is `setTimeout` with `delay = targetMs - Date.now()`. No external scheduler, no persistence.

If the app isn't running when a deadline hits, the task is overdue on next launch. The assistant picks it up in its first evaluation cycle and the overdue badge is immediately visible.

The 30-minute evaluation interval stays for situational triggers (overdue accumulation, stale clients, empty Today list, etc.).

---

## 3. Delivery

### App not focused
Native macOS notification via Electron `Notification` API:
- Title: task title
- Body: due date/time
- Click action: focus app window, scroll to the chat message

### App focused
- Red dot badge on the chat tab/icon
- Opening chat reveals the assistant's reminder message

### Chat message
The proactive loop fires a `time_reminder` trigger through the existing chat pipeline. The assistant composes a brief reminder with action chips (same as today's behavior, just with reliable timing).

---

## 4. Overdue Visual

When `isDueDateOverdue(task.dueDate, Date.now())` returns true and the task status is not `done`:
- The due date badge text in `TaskItem` turns red (`text-destructive`)
- Same size, same position, just the color

No icons, no animations, no tooltips. The `isDueDateOverdue` utility already exists in `dueDateParser.ts` and handles both date-only and date+time formats.

---

## 5. Chat Red Dot

- Proactive message fires → set `unreadProactive` flag in renderer state
- Chat tab renders a small red dot when flag is true
- User opens/views chat → flag clears, dot disappears
- Multiple unread messages → still one dot (not a count)
- No persistence — app restart clears it

---

## 6. What Changes

### Modified
- `proactiveLoop.ts` → remove `isWorkingHours` gate from `evaluate()` and `onAppOpen()`. Replace rolling horizon scheduling with full scan on startup + task change. Add 9 AM scheduling for date-only deadlines.
- `TaskItem.tsx` → add red text color to due date badge when overdue
- Chat navigation component → add red dot for unread proactive messages

### Removed
- `isWorkingHours()` usage in evaluate/onAppOpen (function can stay for reference but is no longer called)
- 35-minute scheduling horizon limit

### Unchanged
- Proactive trigger evaluation logic (overdue accumulation, stale clients, etc.)
- Cooldown system
- Native notification delivery mechanism
- Morning briefing on first app open
- `dueType` column in DB (no migration)
- `dueDateParser.ts` utilities (already correct)

---

## 7. Not In Scope

- Configurable reminder lead time (e.g., "remind me 15 min before")
- Snooze functionality
- Recurring reminder notifications
- Settings UI for notification preferences
- Sound customization
