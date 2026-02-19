# Notification System Redesign

**Date:** 2026-02-19
**Status:** Approved

## Problem

The notification system has three issues:
1. **Critical** — The app never triggers the macOS notification permission dialog. `Notification.show()` silently fails without authorization.
2. **Moderate** — The scheduler uses a 1-hour scanning window, making it fragile for far-future due dates.
3. **Minor** — `reminderOffset` defaults to `null` in the renderer, relying on a fallback in the scheduler.

## Design

### 1. Onboarding Permission Step

New step between "Basics" (step 2) and "Provider"/"Ready" in the onboarding flow. Requires updating `type Step` to accommodate the additional step.

- **Heading:** "Stay on top of tasks"
- **Subtext:** "Get reminders when tasks are due so nothing slips."
- **Actions:**
  - "Enable reminders" → saves `notifications.enabled = true`, then fires a test notification via IPC (e.g., "Reminders enabled — you'll be notified when tasks are due"). On macOS, this first `notification.show()` call automatically triggers the OS permission dialog. Proceeds to next step regardless of the OS response.
  - "Skip for now" → saves `notifications.enabled = false`, proceeds without triggering the OS dialog.

**Note:** Electron has no `Notification.requestPermission()` API. macOS triggers the permission dialog automatically on the first `notification.show()` call. Showing a real test notification is the only way to prompt the user.

### 2. Settings — Notifications Section

Add a "Notifications" section **within the existing "Reminders" tab** in Settings (above or below the Apple Reminders sync section). Both relate to task reminders, so they belong together. No new tab needed.

| Control | Description | Setting key |
|---------|-------------|-------------|
| Notifications toggle | Master on/off. When turned on, fires a test notification to trigger the OS permission dialog if not yet prompted. | `notifications.enabled` |
| Default reminder | Dropdown: at due, 15m, 1h, 1d before. New tasks inherit this value when a due date is added. | `notifications.default_offset` |
| Sound | Toggle notification sound on/off. Controls the `silent` flag on Electron's `Notification`. | `notifications.sound` |
| Permission status | Read-only indicator. Detected by firing a silent probe notification and listening for the `'show'` event. If blocked: warning text + "Open System Settings" link via `shell.openExternal()`. | (computed at render time) |

**Permission detection:** Electron has no API to directly query macOS notification permission status. Instead, fire a probe notification and listen for the `'show'` event — if it fires, permissions are granted. If it doesn't fire within a short timeout (~500ms), permissions are denied or not determined. Cache the result in memory (not persisted — macOS state can change externally).

### 3. Scheduler Rewrite — Immediate Scheduling

Replace the 1-hour scanning window with immediate, precise scheduling.

**Prerequisite — enhance task change subscription:**
The current `subscribeTaskChanges()` in `taskService.ts` calls listeners with no arguments. Enhance `TaskChangeListener` to provide task metadata:
```typescript
type TaskChangeEvent = {
  taskId: string;
  action: 'create' | 'update' | 'complete' | 'cancel' | 'delete' | 'reopen';
};
type TaskChangeListener = (event: TaskChangeEvent) => void;
```
This lets the scheduler react precisely to individual task changes without scanning all tasks.

**On task create/update** (due date set or changed):
- Look up the task by ID from the change event
- Calculate `reminderMs = dueDateTargetMs - offsetMs`
- If in the future → `setTimeout(fireReminder, delay)`
- Store timer in `taskTimers` map (keyed by task ID)
- Clear existing timer for that task first if present

**On task complete/cancel/delete:**
- Clear the timer for that task

**Hourly safety scan** (kept as fallback):
- Picks up tasks that somehow don't have a timer (edge case recovery)
- Now schedules ALL future tasks with due dates, not just the next hour

**Cold start catch-up** (unchanged):
- On app launch, scan for overdue tasks → summary notification
- Set immediate timers for all future tasks with due dates

**Master toggle check:**
- Before firing any notification, check `notifications.enabled` setting
- If off, skip silently (timers still run so toggling back on doesn't need restart)

### 4. Permission-Aware Notification Delivery

Updated `showNativeNotification` flow:

1. Is `notifications.enabled` on? → No: silently skip
2. Is `Notification.isSupported()`? → No: silently skip
3. Read `notifications.sound` setting → set `silent` flag accordingly
4. Create and show the notification
5. Listen for `'show'` event — if it doesn't fire, log a warning (permissions likely denied)

**Inline warning at due-date creation:** When the permission probe detects notifications are blocked, show a subtle inline message below the reminder offset selector in `TaskDueDatePicker.tsx`: "Reminders won't work — notifications are blocked. [Fix in Settings]"

**No retry spam:** macOS only allows one permission dialog per app install. After denial, the only path is System Settings > Notifications > Untask. The app links there via `shell.openExternal()`.

### 5. Default Reminder Offset Data Flow

**When a user adds a due date** (TaskBody, InlineTaskInput, QuickAddOverlay):
- Auto-populate `reminderOffset` from `notifications.default_offset` setting (fetched once on component mount)
- User can override per-task via the existing reminder offset selector in `TaskDueDatePicker.tsx`
- Fallback: `'at_due'`

**Task creation in store:**
- `reminderOffset` is always a concrete value when `dueDate` is present
- If `dueDate` is null, `reminderOffset` is null

**Scheduler reads directly** — no more `?? 'at_due'` fallback needed.

### 6. New IPC Channels

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `notifications:fire-test` | renderer → main | Fires a test notification (triggers OS permission dialog on first call) |
| `notifications:probe-permission` | renderer → main | Fires a silent probe notification, returns `"granted"` or `"denied"` based on `'show'` event |
| `notifications:open-settings` | renderer → main | Opens macOS System Settings > Notifications via `shell.openExternal()` |

### 7. New Settings

Added to `defaultSettings.ts` following existing `notifications.*` namespace (distinct from `reminders.*` which is Apple Reminders sync).

| Key | Type | Default | Constant |
|-----|------|---------|----------|
| `notifications.enabled` | string (`'true'`/`'false'`) | `'true'` | `SETTING_KEY_NOTIFICATIONS_ENABLED` |
| `notifications.default_offset` | string | `'at_due'` | `SETTING_KEY_NOTIFICATIONS_DEFAULT_OFFSET` |
| `notifications.sound` | string (`'true'`/`'false'`) | `'true'` | `SETTING_KEY_NOTIFICATIONS_SOUND` |

Note: All settings are stored as strings in the key-value store, following the existing pattern.

### 8. Task Change Subscription Enhancement

Modify `taskService.ts` to emit structured change events:

- `emitTaskChange()` → `emitTaskChange(event: TaskChangeEvent)`
- Update all call sites in `taskService.ts` (create, update, complete, cancel, delete, reopen) to pass the task ID and action
- The scheduler subscribes and reacts to individual changes instead of doing full rescans

## Files to Modify

| File | Changes |
|------|---------|
| `src/main/services/reminderScheduler.ts` | Rewrite to immediate scheduling, permission-aware delivery, sound setting |
| `src/main/services/taskService.ts` | Enhance `TaskChangeListener` to include task metadata |
| `src/main/defaultSettings.ts` | Add `SETTING_KEY_NOTIFICATIONS_*` constants and defaults |
| `src/main/index.ts` | Pass new settings to scheduler init |
| `src/main/ipc/settings.ts` | New IPC handlers for notification test/probe/open-settings |
| `src/preload/index.ts` | Expose new `notifications.*` IPC methods |
| `src/types/ipc.ts` | New IPC channel constants and payload types |
| `src/renderer/components/onboarding/OnboardingFlow.tsx` | Add notifications step, update Step type |
| `src/renderer/components/onboarding/OnboardingNotifications.tsx` | New component |
| `src/renderer/components/settings/SettingsReminders.tsx` | Add "Notifications" section above Apple Reminders sync |
| `src/renderer/stores/taskStore.ts` | Populate `reminderOffset` from `notifications.default_offset` setting |
| `src/renderer/components/tasks/TaskDueDatePicker.tsx` | Inline permission warning below reminder offset selector |
