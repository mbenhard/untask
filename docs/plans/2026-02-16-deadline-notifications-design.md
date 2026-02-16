# Deadline Notifications — Design

## Objective

Make deadline reminders reliable and impossible to miss. One notification at the right time, one visual indicator when overdue, no complexity.

## Design Decisions

- **Alarm clock model**: deadlines demand attention at the exact time
- **No hard/soft distinction**: one deadline, one behavior. `dueType` field is retired from active use (column stays, nothing reads it)
- **No working hours gate**: if the app is running, the assistant is active. Removed from all proactive triggers, not just deadlines.
- **No over-engineering**: no cron, no persistence layer, no settings UI for schedules

> **Note:** The PRD lists "Notifications and reminders" as post-MVP and "Flexible deadlines (hard/soft)" as in-scope. This design intentionally pulls notifications forward and retires hard/soft as unnecessary complexity. The proactive assistant OS design doc references `dueType` in its auto-escalation rules (Section 3.4) — that should be updated to treat all deadlines the same.

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
- **On any task change** (create, update, complete, delete) → clear all timers, reschedule from scratch (debounced — same 2-second debounce as the existing `evaluate()` call in `onTaskChange()`)
- **On task completion** → cancel that task's timer
- **Date-only deadlines** → construct 9 AM local time using `new Date("YYYY-MM-DDT09:00")` (parsed as local time by the JS engine, avoiding the UTC midnight trap of `Date.parse("YYYY-MM-DD")`)

Implementation is `setTimeout` with `delay = targetMs - Date.now()`.

**setTimeout overflow guard:** JavaScript's `setTimeout` maxes out at ~24.8 days (2^31 - 1 ms). Any deadline further than 24 days out is skipped during scheduling. The next app launch or task change reschedule will pick it up once it falls within range.

**Sleep/wake behavior:** macOS sleep can cause `setTimeout` to fire late on wake. This is acceptable — the notification still delivers, and the overdue badge covers the gap.

If the app isn't running when a deadline hits, the task is overdue on next launch. The assistant picks it up in its first evaluation cycle and the overdue badge is immediately visible.

The 30-minute evaluation interval stays for situational triggers (overdue accumulation, stale clients, empty Today list, etc.).

### Trigger message context

When a `time_reminder` fires, the trigger message must include the specific task ID and title so the assistant can reference the exact task without scanning all tasks. Current template is generic ("A task with a time-based reminder is due now") — update to inject the task context.

---

## 3. Delivery

### App not focused
Native macOS notification via Electron `Notification` API:
- Title: task title
- Body: due date/time
- Click action: focus app window, scroll to the chat message

### App focused
- Red dot on the chat peek button (bottom-right "Chat" button in `AppShell.tsx`, line 250-262)
- Opening chat reveals the assistant's reminder message

### Chat message
The proactive loop fires a `time_reminder` trigger through the existing chat pipeline. The assistant composes a brief reminder with action chips.

---

## 4. Overdue Visual

When a task's due date has passed and the task status is not `done`:
- The due date badge text in `TaskItem` turns red (`text-destructive`)
- Same size, same position, just the color

**Overdue definition change:** The current `isDueDateOverdue` in `dueDateParser.ts` considers date-only tasks overdue only after midnight of the next day. This contradicts the 9 AM notification — a task that fired a notification 15 hours ago wouldn't show as overdue. Update the function: date-only tasks are overdue after 9:00 AM on the due date (matching the notification trigger). For date+time tasks, overdue after the exact time (unchanged).

```typescript
// Before (date-only): overdue after end of day (midnight next day)
const endOfDay = new Date(parsed.dateStr);
endOfDay.setDate(endOfDay.getDate() + 1);
return endOfDay.getTime() <= nowMs;

// After (date-only): overdue after 9 AM on the due date
const nineAm = new Date(parsed.dateStr + 'T09:00');
return nineAm.getTime() <= nowMs;
```

---

## 5. Chat Red Dot

- Proactive message fires → set `unreadProactive` flag in renderer state (chatStore or appStore)
- The chat peek button (`AppShell.tsx` line 257, the "Chat" button at bottom-right) renders a small red dot when the flag is true
- User opens chat overlay → flag clears, dot disappears
- Multiple unread messages → still one dot (not a count)
- No persistence — app restart clears it

---

## 6. What Changes

### Modified

**`proactiveLoop.ts`**
- Remove `isWorkingHours` gate from `evaluate()` (line 273) and `onAppOpen()` (line 203)
- Replace rolling ~35-min horizon in `scheduleUpcomingReminders()` with full scan
- Add 9 AM local time scheduling for date-only deadlines using `new Date("YYYY-MM-DDT09:00")`
- Add 24-day overflow guard for `setTimeout`
- Debounce reschedule on task change (2-second delay)
- Pass task ID and title into `time_reminder` trigger message

**`proactivePolicy.ts`**
- Remove `isWorkingHours` gate from `evaluateProactiveTriggerPolicy()` (line 261). This is a separate code path used by the IPC handler that the proactive loop doesn't call — but it must also be ungated for consistency.

**`dueDateParser.ts`**
- Update `isDueDateOverdue` for date-only tasks: overdue after 9 AM on the due date instead of midnight next day

**`TaskItem.tsx`**
- Add red text color (`text-destructive`) to due date badge when overdue

**`AppShell.tsx`**
- Add red dot indicator on the chat peek button when `unreadProactive` flag is true

**`chatStore.ts` or `appStore.ts`**
- Add `unreadProactive` boolean flag, set on proactive message receipt, clear on chat overlay open

### Removed
- `isWorkingHours()` usage in `proactiveLoop.ts` evaluate/onAppOpen
- `isWorkingHours()` usage in `proactivePolicy.ts` evaluateProactiveTriggerPolicy
- 35-minute scheduling horizon limit

### Unchanged
- Proactive trigger evaluation logic (overdue accumulation, stale clients, etc.)
- Cooldown system
- Native notification delivery mechanism
- Morning briefing on first app open
- `dueType` column in DB (no migration)
- AI tool schemas still accept `dueType` on create/update — cleanup is a separate follow-up

---

## 7. Not In Scope

- Configurable reminder lead time (e.g., "remind me 15 min before")
- Snooze functionality
- Recurring reminder notifications
- Settings UI for notification preferences
- Sound customization
- Cleaning `dueType` from AI tool Zod schemas (follow-up)
