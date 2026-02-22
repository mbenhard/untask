# Untask Memory Leaks & Lifecycle Audit — 2026-02-22

## Executive Summary

The codebase demonstrates generally strong lifecycle management. The `will-quit` handler properly stops all major services, clears timers, unregisters shortcuts, destroys the tray, and closes the database. The preload bridge consistently returns unsubscribe functions for IPC listeners, and renderer components call them in `useEffect` cleanup. The `remindersSync` service has a thorough `stopRemindersSync()`.

**Finding breakdown:** 1 HIGH, 5 MEDIUM, 5 LOW

---

## Findings

### HIGH

**1. Quick-Add Window IPC Listeners Accumulate on Recreation**
- `quickAddWindow.ts:78-101` — `createQuickAddWindow()` registers 3 `ipcMain.on()` listeners on the global singleton, not on `webContents`. If the window is destroyed and recreated, old listeners remain and new ones accumulate. The guard at line 28 prevents duplicate windows but not duplicate listeners.
- **Fix:** Move registrations outside the function, or add `ipcMain.removeAllListeners()` cleanup before re-registering, or clean up in `quickAddWin.on('closed', ...)`.

### MEDIUM

**2. summonController `boundsSaveTimer` Not Cleared on Re-init**
- `summonController.ts:41-63` — If the main window is destroyed and recreated (via `activate` handler), `initSummonController()` runs again without clearing the old `boundsSaveTimer`. The `saveBounds` guard (`if (!win || win.isDestroyed()) return`) mitigates the impact.
- **Fix:** Call `clearTimeout(boundsSaveTimer)` at the start of `initSummonController()`.

**3. `cooldownMap` in Reminder Scheduler Grows Without Bounds**
- `reminderScheduler.ts:37-42` — Records when reminders fired. Entries are never removed. `stopReminderScheduler()` doesn't clear it. Over months, accumulates thousands of stale entries.
- **Fix:** Add `cooldownMap.clear()` to `stopReminderScheduler()`. Consider periodic sweep for entries older than 24h.

**4. `cascadeUndoGroups` Map Grows Without Bounds**
- `taskService.ts:80` — Stores cascade-delete groupings for undo. Entries only removed when undo is exercised. When entries fall off the bounded `userUndoStack` (max 20), their `cascadeUndoGroups` entries persist forever.
- **Fix:** When evicting from `userUndoStack`, also delete from `cascadeUndoGroups`:
  ```typescript
  const evicted = userUndoStack.pop();
  if (evicted) cascadeUndoGroups.delete(evicted);
  ```

**5. `activeChatRequestIds` / `canceledChatRequestIds` Can Leak Entries**
- `chat.ts:43-44` — If cancel is called after a stream already finished (race condition), the `canceledId` entry persists. `cancelActiveChatTurns()` adds to `canceledChatRequestIds` without removing from `activeChatRequestIds`.
- **Fix:** Clear both Sets when no streams are in flight, or have `cancelActiveChatTurns()` also clear `activeChatRequestIds`.

### LOW

**6. Backup Scheduler Recursive setTimeout Can Escape Stop Guard**
- `backupService.ts:383-401` — `stopDailyBackupScheduler()` clears current timer, but if `runBackup()` is mid-flight, `scheduleNext()` creates a new timer after stop.
- **Fix:** Add a `stopped` flag checked in `scheduleNext()`.

**7. Proactive Placeholder Timeout Never Cancelled**
- `chatStreamSlice.ts:81-95` — 2-minute safety timeout is fire-and-forget. Callback guards against already-finalized streams, so impact is benign.
- **Fix:** Store timeout ID in `InFlightStream` and clear in `handleAssistantDone`.

**8. `_stableKeyMap` in Task Store Grows Between Refreshes**
- `taskStore.ts:74` — Cleared on every `fetchTasks()`/`refreshTasks()`. Benign — refreshes happen frequently.
- **Fix:** No action needed.

**9. Main Window Re-creation Handled Adequately**
- `index.ts:281-295` — IPC handlers guarded, chat store unsubscribes on re-init. No issue.

**10. `recentlyPulled` Map Lazy Cleanup Is Adequate**
- `remindersSync.ts:143-157` — Entries lazily cleaned on access, bulk cleared on stop. Minor concern.

---

## Positive Findings

- **AbortControllers properly managed** — `streamOrchestration.ts:282-310` uses `once` listeners, clears inactivity timer on completion and cancellation.
- **Preload API returns unsubscribe functions consistently** — Every `ipcRenderer.on()` returns cleanup function, and all renderer `useEffect` hooks call it.
- **Chat store unsubscribes on re-initialization** — Stores `unsubscribeStream` and `unsubscribeFocusMessage`, calls them before re-registering.

---

## Priority Actions

1. Fix quick-add window IPC listener accumulation (#1)
2. Add `cascadeUndoGroups` cleanup on undo stack eviction (#4)
3. Clear `cooldownMap` on scheduler stop (#3)
4. Clear `activeChatRequestIds` on cancel (#5)
5. Clear `boundsSaveTimer` on re-init (#2)
