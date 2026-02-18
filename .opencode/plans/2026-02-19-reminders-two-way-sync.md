# Smart Two-Way Reminders Sync — Implementation Plan

**Date:** 2026-02-19
**Status:** Draft

## Problem Statement

Current sync has two critical issues:

1. **Watcher unreliable** - `.EKEventStoreChanged` notification doesn't reliably fire for iCloud-synced changes from iPhone. Users must restart app to import new reminders.

2. **One-way data sync** - Untask only pulls completion/deletion status, never data changes (title, dueDate, priority). This causes Untask to overwrite edits made in Reminders.app.

## Solution Overview

### Phase 1: Fix Watcher Reliability
Ensure Reminders → Untask sync triggers reliably without restart.

### Phase 2: Two-Way Data Sync
Pull data changes from Reminders, with smart conflict resolution.

---

## Phase 1: Fix Watcher Reliability

### 1.1 Pull on App Window Focus

**File:** `src/main/window/summonController.ts` or similar

Add a listener that triggers `pullChanges()` when the Untask window gains focus.

```typescript
// In main window setup
mainWindow.on('focus', () => {
  if (getSetting(SETTING_KEY_REMINDERS_SYNC_ENABLED) === 'true') {
    void pullChanges();
  }
});
```

**Rationale:** User switches from Reminders.app to Untask → immediate sync.

### 1.2 Reduce Polling Interval

**File:** `src/main/services/remindersSync.ts`

```diff
- const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
+ const POLL_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
```

**Rationale:** Faster fallback when watcher fails.

### 1.3 Add Manual "Refresh from Reminders" Button

**File:** `src/renderer/components/settings/SettingsReminders.tsx`

Add a button next to "Sync now" that only pulls (doesn't push).

```typescript
const handleRefreshFromReminders = useCallback(async () => {
  await getUntask().reminders.pullOnly(); // New IPC method
}, []);
```

**Files to modify:**
- `src/types/ipc.ts` - Add `REMINDERS_PULL_ONLY` channel
- `src/main/ipc.ts` - Add handler
- `src/main/services/remindersSync.ts` - Export `pullOnly()` function
- `src/preload/index.ts` - Expose `pullOnly()`
- `src/types/preload.d.ts` - Add to API type
- `src/renderer/components/settings/SettingsReminders.tsx` - Add button

### 1.4 Keep Watcher (Still Useful)

The watcher is still valuable for **local changes** (when Untask modifies a reminder via its own push). Keep it but don't rely on it for iCloud changes.

---

## Phase 2: Two-Way Data Sync

### 2.1 Database Schema Changes

**File:** `src/main/db/schema.ts`

Add `lastPushedData` to mappings table to track what we last pushed (for conflict detection):

```diff
export const remindersMappings = sqliteTable(
  'reminders_mapping',
  {
    taskId: text('task_id').primaryKey(),
    reminderId: text('reminder_id').notNull(),
    externalId: text('external_id'),
    lastSyncedAt: text('last_synced_at'),
+   lastPushedData: text('last_pushed_data'), // JSON snapshot of last pushed values
+   lastPulledData: text('last_pulled_data'), // JSON snapshot of last pulled values
    createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
  },
  // ...
);
```

**Migration needed:** Add columns with `NULL` defaults.

### 2.2 Swift Helper: Add `lastModifiedDate` to FetchedReminder

**File:** `swift-helper/Sources/Models.swift`

```diff
struct FetchedReminder: Codable {
    let reminderId: String
    let externalId: String?
    let title: String
    let notes: String?
    let dueDate: String?
    let priority: Int
    let isCompleted: Bool
    let recurrenceRule: String?
+   let lastModifiedDate: String? // ISO 8601
}
```

**File:** `swift-helper/Sources/EventKitBridge.swift`

```swift
// In fetchAllReminders:
FetchedReminder(
    // ...
    lastModifiedDate: reminder.lastModifiedDate.map { isoFormatter.string(from: $0) }
)
```

**Note:** `lastModifiedDate` has a known Apple bug - doesn't update reliably for iPhone edits. We'll use it as a hint but not rely on it solely.

### 2.3 Sync Logic: Detect Changes

**File:** `src/main/services/remindersSync.ts`

Add helper to detect if reminder has data changes vs what we last pushed:

```typescript
type DataSnapshot = {
  title: string;
  dueDate: string | null;
  priority: number;
  // Notes excluded - always Untask → Reminders for formatting
};

function hasDataChanges(
  reminder: FetchedReminder,
  lastPushed: DataSnapshot | null
): boolean {
  if (!lastPushed) return true;
  
  return (
    reminder.title !== lastPushed.title ||
    reminder.dueDate !== lastPushed.dueDate ||
    reminder.priority !== lastPushed.priority
  );
}
```

### 2.4 Conflict Resolution Strategy

**Decision: Untask wins for data fields**

Rationale:
- `lastModifiedDate` is unreliable for iPhone edits (Apple bug)
- Can't reliably determine "newer" version
- Untask is the "primary" interface for task management
- Reminders.app is for quick capture + completion

| Field | Pull from Reminders? | Push to Reminders? | Conflict Resolution |
|-------|---------------------|-------------------|---------------------|
| **title** | ✓ Yes | ✓ Yes | Untask wins |
| **dueDate** | ✓ Yes | ✓ Yes | Untask wins |
| **priority** | ✓ Yes | ✓ Yes | Untask wins |
| **notes** | ✗ No | ✓ Yes | Untask wins (formatting) |
| **completion** | ✓ Yes | ✓ Yes | Either side |
| **deletion** | ✓ Yes | ✓ Yes | Either side |
| **recurrence** | ✗ No | ✓ Yes | Untask only (simpler model) |

### 2.5 Updated Pull Logic

```typescript
async function pullChanges(): Promise<void> {
  // ... existing guards ...

  for (const mapping of mappings) {
    const reminder = fetchedById.get(mapping.reminderId);

    // ... existing deletion/completion handling ...

    // ─── Pull data changes from Reminders ───────────────────
    if (reminder && !reminder.isCompleted) {
      const lastPushed = mapping.lastPushedData 
        ? JSON.parse(mapping.lastPushedData) 
        : null;

      // Only pull if reminder has data we didn't push
      if (hasDataChanges(reminder, lastPushed)) {
        const task = getTaskById(mapping.taskId);
        if (task && !isTerminal(task.status)) {
          // Update task with reminder data
          updateTask({
            id: task.id,
            title: reminder.title,
            dueDate: reminder.dueDate,
            priority: eventKitToUntaskPriority(reminder.priority),
            // Don't update body/notes - Untask is source of truth
          }, 'user');
          
          markAsPulled(task.id);
        }
      }
      
      // Update our snapshot of pulled data
      updateMappingPulledData(mapping.taskId, {
        title: reminder.title,
        dueDate: reminder.dueDate,
        priority: reminder.priority,
      });
    }
  }

  // ... existing import logic ...
}
```

### 2.6 Updated Push Logic

Store snapshot of pushed data:

```typescript
async function pushChanges(): Promise<void> {
  // ... existing logic ...

  if (mapping && matchesFilter && !taskIsTerminal) {
    // Update existing reminder
    await runHelper('--update', {
      reminderId: mapping.reminderId,
      ...payload,
    });
    
    // Store what we pushed for conflict detection
    updateMappingPushedData(mapping.taskId, {
      title: payload.title,
      dueDate: payload.dueDate,
      priority: payload.priority,
    });
  }
}
```

---

## Phase 3: UX Polish (Optional Future Work)

### 3.1 Sync Indicator
Show a subtle indicator when sync is in progress.

### 3.2 Conflict Notification
If both Untask and Reminders have uncommitted changes, notify user and let them choose.

### 3.3 Sync History
Track sync events for debugging and user transparency.

---

## Implementation Order

### Batch 1: Watcher Reliability (High Priority)
1. Pull on window focus
2. Reduce polling to 2 minutes
3. Add "Refresh from Reminders" button

### Batch 2: Two-Way Data Sync (Medium Priority)
4. Add `lastPushedData` column to mappings table
5. Update Swift helper to include `lastModifiedDate`
6. Update pull logic to pull data changes
7. Update push logic to store pushed data snapshot
8. Add migration for existing databases

### Batch 3: Polish (Low Priority)
9. Sync indicator UI
10. Conflict notification

---

## Files Changed

### Phase 1
- `src/main/services/remindersSync.ts`
- `src/main/window/summonController.ts` (or window setup)
- `src/types/ipc.ts`
- `src/main/ipc.ts`
- `src/preload/index.ts`
- `src/types/preload.d.ts`
- `src/renderer/components/settings/SettingsReminders.tsx`

### Phase 2
- `src/main/db/schema.ts`
- `src/main/services/remindersSync.ts`
- `swift-helper/Sources/Models.swift`
- `swift-helper/Sources/EventKitBridge.swift`
- Drizzle migration file

---

## Edge Cases

### EKEventStoreChanged Bug
The `.EKEventStoreChanged` notification is unreliable for iCloud-synced changes. This is why we add multiple trigger points (focus, polling, manual).

### lastModifiedDate Bug
Apple's `lastModifiedDate` doesn't update reliably for iPhone edits. We use our own `lastPushedData` snapshot instead for conflict detection.

### Notes Formatting
Untask uses BlockNote (rich formatting), Reminders uses plain text. We always push Untask's markdown version to Reminders but never pull notes back.

### Recurrence Complexity
Reminders supports complex recurrence (2nd Tuesday, limited occurrences) that Untask doesn't. We only push simple recurrence patterns and never pull complex ones.

---

## Testing Checklist

1. [ ] Create reminder on iPhone → appears in Untask within 2 minutes
2. [ ] Edit reminder title on iPhone → Untask updates (on focus/poll)
3. [ ] Edit task in Untask → Reminders updates immediately
4. [ ] Complete on iPhone → Untask marks done
5. [ ] Complete in Untask → Reminders marks done
6. [ ] Delete on iPhone → Untask marks cancelled
7. [ ] Delete in Untask → Reminder deleted
8. [ ] Edit same task on both sides → Untask wins
9. [ ] Manual "Refresh" button works
10. [ ] Window focus triggers pull
