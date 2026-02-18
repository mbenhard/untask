# Apple Reminders Sync — Design Document

**Date:** 2026-02-18
**Status:** Draft

## Problem

Untask is a local-first macOS app. Users have no way to receive task notifications or check off tasks when away from their Mac. Building a mobile app is too costly. We need a lightweight way to bridge the gap.

## Solution

Sync tasks with due dates to Apple Reminders via EventKit. iCloud handles delivery to iPhone, iPad, and Apple Watch automatically. Users check off reminders on their phone, and completion syncs back to Untask.

No server. No accounts. No mobile app to build. Users toggle a switch in settings and get native notifications on every Apple device they own.

## User Experience

### Setup (one-time)

1. User opens Untask settings
2. Toggles **"Sync to Apple Reminders"**
3. macOS shows the system permission dialog: *"Untask wants to access your Reminders"*
4. User clicks **Allow**
5. A dedicated **"Untask"** list appears in their Reminders app
6. Tasks with due dates begin syncing

### Ongoing

- Create a task with a due date in Untask → appears as a Reminder on phone
- Edit the task title or due date → Reminder updates on phone
- Complete the task in Untask → Reminder marked complete
- **Check off a Reminder on phone → task marked done in Untask**
- Complete a recurring task on phone → task marked done, new recurrence instance synced automatically
- Delete a task in Untask → Reminder removed
- Cancel a task in Untask → Reminder marked complete (cancelled = done from Reminders' perspective)
- Delete a Reminder in Reminders.app → Untask recreates it on next sync (Untask is source of truth)

### What syncs

| Untask field | Reminders field | Direction |
|---|---|---|
| `title` | `title` | Untask → Reminders |
| `body` (plain text excerpt) | `notes` | Untask → Reminders |
| `dueDate` | `dueDateComponents` | Untask → Reminders |
| `priority` | `priority` | Untask → Reminders |
| `status` (done/cancelled) | `isCompleted` | Both ways |

### What does NOT sync

- Subtasks (EventKit does not expose subtask hierarchy)
- Tags, flags (not available via EventKit)
- Task status beyond done/not-done (inbox, active, waiting, etc.)
- Notes with rich formatting (plain text excerpt only)
- Recurrence rules (managed by Untask's own recurrence engine — see Recurring Tasks section)

### Sync model: 1.5-way

- **Untask → Reminders:** All task data (title, due date, priority, notes). Untask is the source of truth.
- **Reminders → Untask:** Completion status only. Checking off a Reminder on phone marks the task done in Untask.
- Untask owns the data. Reminders is a read-mostly remote control.

## Architecture

### Overview

```
Untask main process
├── remindersSync.ts (orchestrator)
│   ├── subscribeTaskChanges() → debounced push (Untask → Reminders)
│   ├── Long-lived spawn: swift-helper --watch
│   │     stdout → JSON "store_changed" events
│   ├── On change: swift-helper --fetch-all → compare → update tasks
│   ├── Polling fallback: every 5 min re-fetch all synced reminders
│   └── Push/pull cooldowns to prevent loops
└── Swift CLI helper (extraResource binary)
    └── EventKit framework (EKEventStore, EKReminder)
```

Note: `app.requestSingleInstanceLock()` in `index.ts` ensures only one Untask instance runs at a time, so there is no risk of concurrent sync processes.

### Components

#### 1. Swift CLI helper (`untask/swift-helper/`)

A standalone Swift Package Manager CLI tool that wraps EventKit. Communicates with Node.js via JSON over stdin/stdout.

**Commands:**

| Command | Input | Output | Description |
|---|---|---|---|
| `--request-access` | — | `{ "granted": bool }` | Request TCC permission |
| `--check-access` | — | `{ "status": "authorized" \| "denied" \| "not_determined" }` | Check current permission |
| `--ensure-list` | `{ "name": "Untask" }` | `{ "listId": "..." }` | Create or find the Untask reminder list |
| `--create` | `{ "listId", "title", "notes?", "dueDate?", "priority?" }` | `{ "reminderId": "..." }` | Create a reminder |
| `--update` | `{ "reminderId", "title?", "notes?", "dueDate?", "priority?" }` | `{ "ok": true }` | Update a reminder |
| `--delete` | `{ "reminderId" }` | `{ "ok": true }` | Delete a reminder |
| `--complete` | `{ "reminderId" }` | `{ "ok": true }` | Mark reminder complete |
| `--batch-create` | `[{ "listId", "title", ... }]` | `[{ "reminderId": "..." }]` | Create multiple reminders in one invocation |
| `--fetch-all` | `{ "listId" }` | `[{ "reminderId", "externalId", "title", "isCompleted", ... }]` | Fetch all reminders in list |
| `--watch` | — | Streaming JSON lines | Long-lived: emits `{ "event": "store_changed" }` on EKEventStoreChangedNotification |

**Implementation notes:**
- Uses `EKEventStore.requestFullAccessToReminders()` on macOS 14+, falls back to `requestAccess(to: .reminder)` on older versions
- `--watch` mode uses `RunLoop.main.run()` to keep the process alive and receive NotificationCenter events
- All output is newline-delimited JSON on stdout
- Errors reported as `{ "error": "message" }` on stdout (not stderr), with non-zero exit code for fatal errors
- `--fetch-all` returns both `calendarItemIdentifier` (as `reminderId`) and `calendarItemExternalIdentifier` (as `externalId`) for stable cross-device identification
- `--batch-create` uses `save(_:commit: false)` for each reminder, then a single `commit()` call for efficiency
- `NSAppleEventsUsageDescription` is NOT needed — EventKit does not use Apple Events

**Project structure:**

```
untask/swift-helper/
├── Package.swift
└── Sources/
    ├── main.swift              # CLI argument parsing, dispatch
    ├── EventKitBridge.swift     # EKEventStore wrapper
    ├── Commands.swift           # Individual command implementations
    └── Models.swift             # JSON-serializable types
```

#### 2. Sync orchestrator (`src/main/services/remindersSync.ts`)

Follows the exact pattern established by `reminderScheduler.ts`: subscribe to task changes, debounce, scan, act.

**Responsibilities:**
- Spawn and manage the Swift helper process
- Push task changes to Reminders (debounced, 2-second window)
- Listen for `store_changed` events from the watcher
- Pull completion status back from Reminders
- Maintain the mapping table (task ID ↔ Reminder ID)
- Polling fallback every 5 minutes as a safety net
- Handle recurring task completions (new recurrence instances)

**Lifecycle:**

```typescript
// Init (called from index.ts after DB ready)
export function initRemindersSync(): void {
  const enabled = getSetting('reminders.sync_enabled');
  if (enabled !== 'true') return;

  // 1. Spawn swift-helper --check-access
  // 2. If authorized, spawn swift-helper --ensure-list
  // 3. Subscribe to task changes (debounced)
  // 4. Spawn swift-helper --watch (long-lived)
  // 5. Start polling fallback interval
  // 6. Run initial full sync (batched — see Bulk Sync section)
}

// Cleanup (called from app will-quit)
export function stopRemindersSync(): void {
  // Unsubscribe from task changes
  // Kill watcher process
  // Clear polling interval
  // Note: Reminders and the "Untask" list are left in place.
  // User can manually delete them from Reminders if desired.
}

// Re-init when setting toggled
export function toggleRemindersSync(enabled: boolean): void {
  setSetting('reminders.sync_enabled', String(enabled));
  if (enabled) initRemindersSync();
  else stopRemindersSync();
}
```

**Timeouts:** All Swift helper invocations use a timeout (15 seconds for individual operations, 60 seconds for `--fetch-all`). If the helper hangs (e.g., iCloud issues), the promise rejects and the operation is retried on the next cycle. Pattern follows the existing `BACKUP_JOB_TIMEOUT_MS` approach in `ipc.ts`.

**Watcher crash recovery:** If the `--watch` process exits unexpectedly, the orchestrator restarts it after a 5-second delay with exponential backoff (max 60 seconds). The polling fallback ensures changes are still detected during watcher downtime.

#### 3. Database: reminders_mapping table

New table to track which tasks are synced to which Reminders.

```sql
CREATE TABLE reminders_mapping (
  task_id TEXT PRIMARY KEY,
  reminder_id TEXT NOT NULL,
  external_id TEXT,
  last_synced_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_reminders_mapping_reminder_id ON reminders_mapping(reminder_id);
CREATE INDEX idx_reminders_mapping_external_id ON reminders_mapping(external_id);
```

**Fields:**
- `task_id` → Untask task UUID (primary key — one task = one reminder)
- `reminder_id` → EventKit `calendarItemIdentifier` (used for local operations)
- `external_id` → EventKit `calendarItemExternalIdentifier` (stable across iCloud syncs — used for matching when `reminder_id` changes)
- `last_synced_at` → Timestamp of last successful sync for this pair

**Why `external_id` matters:** Apple's documentation warns that `calendarItemIdentifier` can change when a reminder syncs to iCloud (the local ID is replaced by the iCloud ID). This typically happens once, shortly after creation. By also storing and matching on `external_id`, the pull handler can correctly identify reminders even after their local ID changes, preventing duplicates.

**Mapping lookup strategy (pull):**
1. Try matching by `reminder_id` first (fast path)
2. If no match, try matching by `external_id` (handles ID change after iCloud sync)
3. If match found via `external_id`, update `reminder_id` in the mapping
4. If no match at all, the reminder is unknown (possibly manually created in the Untask list — ignore it)

#### 4. Settings

New settings keys:

| Key | Type | Default | Description |
|---|---|---|---|
| `reminders.sync_enabled` | `'true' \| 'false'` | `'false'` | Master toggle |
| `reminders.list_id` | `string` | — | Cached EventKit list identifier |
| `reminders.sync_filter` | `'due_date_only' \| 'today' \| 'all'` | `'due_date_only'` | Which tasks to sync |

**Sync filter options:**
- `due_date_only` — Only sync tasks that have a due date set (recommended default)
- `today` — Sync tasks marked as "today" plus tasks with due dates
- `all` — Sync all active/in-progress tasks regardless of due date

All filters **exclude tasks in terminal statuses** (`done`, `cancelled`). If a synced task is completed or cancelled, the push handler marks the corresponding reminder as complete and removes the mapping.

Note: The `today` filter interacts with `clearStaleTodayFlags()` in `taskService.ts`, which clears the `today` flag on terminal tasks completed before today. This means a task synced via the `today` filter will naturally fall out of sync eligibility when completed and its today flag is cleared on the following day. This is expected behavior.

#### 5. IPC channels

| Channel | Direction | Payload | Purpose |
|---|---|---|---|
| `reminders:get-status` | Renderer → Main | — | Returns `{ enabled, authorized, syncFilter, lastSyncAt, syncedCount }` |
| `reminders:toggle` | Renderer → Main | `{ enabled: boolean }` | Enable/disable sync |
| `reminders:set-filter` | Renderer → Main | `{ filter: string }` | Change sync filter |
| `reminders:request-access` | Renderer → Main | — | Trigger TCC permission dialog |
| `reminders:force-sync` | Renderer → Main | — | Manual full sync |
| `reminders:sync-status` | Main → Renderer | `{ status: 'syncing' \| 'idle' \| 'error', message? }` | Live sync status updates |

## Sync Logic

### Push: Untask → Reminders

Triggered by `subscribeTaskChanges()` with 2-second debounce.

```
On task change (debounced):
  1. Set pushInFlight = true
  2. Query all non-terminal tasks matching sync filter
  3. For each task:
     a. Skip if wasPulledRecently(task_id) — avoid pull→push loop
     b. Look up reminders_mapping by task_id
     c. If no mapping exists AND task matches filter:
        - swift-helper --create → get reminder_id + external_id
        - INSERT into reminders_mapping
     d. If mapping exists AND task still matches filter:
        - swift-helper --update with current task data
        - UPDATE last_synced_at in reminders_mapping
     e. If mapping exists AND task is in terminal status (done/cancelled):
        - swift-helper --complete
        - DELETE from reminders_mapping
     f. If mapping exists AND task no longer matches filter (due date removed):
        - swift-helper --delete
        - DELETE from reminders_mapping
  4. For orphaned mappings (task deleted in Untask):
     - swift-helper --delete
     - DELETE from reminders_mapping
  5. Set pushInFlight = false after 3-second cooldown
```

### Pull: Reminders → Untask

Triggered by `store_changed` event from watcher OR polling fallback.

```
On store change:
  0. If pushInFlight, skip this event (it's our own write)
  1. swift-helper --fetch-all for the Untask list
  2. For each reminder returned:
     a. Look up reminders_mapping by reminder_id, then by external_id
     b. If found via external_id but not reminder_id:
        - Update reminder_id in the mapping (iCloud changed the local ID)
     c. If mapping found AND reminder.isCompleted AND task is not done/cancelled:
        - Call completeTask(task_id, 'user')
        - If completeTask returns a recurredTask (recurring task):
          → The new recurrence instance triggers emitTaskChange
          → The debounced push handler will pick it up and sync it
        - markAsPulled(task_id) to prevent push→pull loop
     d. If mapping found AND reminder was deleted (not in fetch results):
        - Recreate the reminder (Untask is source of truth)
        - Update reminders_mapping with new reminder_id + external_id
     e. If no mapping found (unknown reminder in the Untask list):
        - Ignore — may have been manually created by user in Reminders
  3. Update last_synced_at for all processed mappings
```

### Recurring tasks

When a recurring task is completed via Reminders:

1. Pull handler calls `completeTask(task_id, 'user')`
2. `completeTask()` returns `{ completed, recurredTask }` where `recurredTask` is the newly spawned recurrence instance (if applicable)
3. The completed task's mapping is removed (task is now in terminal status)
4. The new `recurredTask` has a due date (set by the recurrence engine), so it matches the sync filter
5. `emitTaskChange()` fires → debounced push handler picks up the new task → syncs it to Reminders
6. User sees the old reminder complete and a new one appear — matching Untask's recurrence behavior

### Cancelled tasks

- When a task is cancelled in Untask: push handler marks the corresponding reminder as complete (since Reminders has no "cancelled" concept) and removes the mapping.
- If a user un-completes a reminder on their phone for a task that was cancelled in Untask: the pull handler finds the task in a terminal status and ignores the change. Untask is source of truth.

### Loop prevention

Two mechanisms prevent infinite sync loops:

**1. Pull → Push prevention** (`recentlyPulled` set):
When a completion is pulled from Reminders → Untask, this triggers `emitTaskChange` → push handler. The push handler skips any task in the `recentlyPulled` set.

```typescript
const recentlyPulled = new Map<string, number>(); // taskId → timestamp

function markAsPulled(taskId: string): void {
  recentlyPulled.set(taskId, Date.now());
}

function wasPulledRecently(taskId: string): boolean {
  const ts = recentlyPulled.get(taskId);
  if (!ts) return false;
  if (Date.now() - ts > 5000) {
    recentlyPulled.delete(taskId);
    return false;
  }
  return true;
}
```

**2. Push → Pull prevention** (`pushInFlight` flag):
When the push handler writes to Reminders, `EKEventStoreChangedNotification` fires (for our own writes). The pull handler checks `pushInFlight` and skips processing during and shortly after push operations.

```typescript
let pushInFlight = false;
let pushCooldownTimer: NodeJS.Timeout | null = null;

function setPushInFlight(): void {
  pushInFlight = true;
  if (pushCooldownTimer) clearTimeout(pushCooldownTimer);
}

function clearPushInFlight(): void {
  // 3-second cooldown after last push completes
  pushCooldownTimer = setTimeout(() => {
    pushInFlight = false;
  }, 3000);
}
```

### Bulk initial sync

When sync is first enabled and many tasks already exist, the orchestrator batches the initial sync to avoid spawning hundreds of processes:

1. Query all tasks matching the sync filter
2. Split into batches of 20
3. For each batch: call `swift-helper --batch-create` (single process, multiple reminders)
4. Insert all mappings
5. 500ms delay between batches to avoid overwhelming EventKit

### Priority mapping

| Untask | EventKit `EKReminderPriority` | Value |
|---|---|---|
| `none` | `.none` | `0` |
| `low` | `.low` | `9` |
| `medium` | `.medium` | `5` |
| `high` | `.high` | `1` |

### Due date mapping

Untask stores `dueDate` as an ISO 8601 string. EventKit uses `DateComponents`.

```swift
// Untask ISO string → DateComponents
let date = ISO8601DateFormatter().date(from: isoString)
reminder.dueDateComponents = Calendar.current.dateComponents(
    [.year, .month, .day, .hour, .minute],
    from: date
)
```

If the Untask due date has no time component (date only), set the reminder's alarm to 9:00 AM local time as a sensible default.

## Packaging

### Swift helper binary

**Build (universal binary):**
```bash
cd untask/swift-helper
swift build -c release --arch arm64 --arch x86_64
cp .build/apple/Products/Release/UntaskHelper ../resources/bin/untask-helper
```

**Directory setup:**
The `resources/bin/` directory must be created. The compiled binary is a build artifact and should be gitignored:

```gitignore
# untask/.gitignore
resources/bin/untask-helper
```

The directory structure (`resources/bin/`) should be committed with a `.gitkeep` file so the build has a target directory.

**Forge config addition:**
```typescript
// forge.config.ts
packagerConfig: {
  extraResource: [
    './drizzle',
    './assets/tray',
    './assets/icons/Assets.car',
    './resources/bin/untask-helper',  // <-- add
  ],
}
```

**Runtime path resolution:**
```typescript
function getHelperPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'untask-helper');
  }
  // In dev, __dirname is .vite/build/ — need three levels up to reach project root
  // Follows the same pattern as migrate.ts for drizzle path resolution
  return path.join(app.getAppPath(), 'resources', 'bin', 'untask-helper');
}
```

**Build integration (package.json):**
```json
{
  "build:helper": "cd swift-helper && swift build -c release --arch arm64 --arch x86_64 && cp .build/apple/Products/Release/UntaskHelper ../resources/bin/untask-helper",
  "package": "npm run build:helper && electron-forge package",
  "make": "npm run build:helper && electron-forge make"
}
```

### Info.plist

Add to the Electron app's Info.plist (via Forge's `extendInfo` or a custom plist template):

```xml
<key>NSRemindersFullAccessUsageDescription</key>
<string>Untask syncs your tasks with due dates to Reminders so you can check them off on your phone.</string>
<key>NSRemindersUsageDescription</key>
<string>Untask syncs your tasks with due dates to Reminders so you can check them off on your phone.</string>
```

Both keys are needed for compatibility with macOS < 14 and >= 14.

### Code signing and entitlements

`@electron/osx-sign` automatically discovers and signs all Mach-O binaries in the .app bundle, including the Swift helper.

**Entitlements:** The Electron app's entitlements file must include the calendar/reminders entitlement for the hardened runtime. Without this, TCC silently denies access on signed/notarized builds:

```xml
<!-- entitlements.plist (for the main app) -->
<key>com.apple.security.personal-information.calendars</key>
<true/>
```

Configure in `forge.config.ts`:

```typescript
packagerConfig: {
  osxSign: {
    optionsForFile: (filePath: string) => {
      if (filePath.endsWith('untask-helper')) {
        return {
          entitlements: 'entitlements.plist',
          hardenedRuntime: true,
        };
      }
      return {};
    },
  },
}
```

TCC permissions are attributed to the parent Electron app (Untask), not the helper binary. The user sees "Untask wants to access your Reminders."

### CI (GitHub Actions)

The release workflow needs Swift installed. macOS runners include Swift by default. Add the helper build step before `pnpm make`:

```yaml
- name: Build Swift helper
  run: |
    cd untask/swift-helper
    swift build -c release --arch arm64 --arch x86_64
    cp .build/apple/Products/Release/UntaskHelper ../resources/bin/untask-helper
```

## UI (Settings page)

Minimal addition to the existing settings UI:

```
┌─ Reminders Sync ─────────────────────────────────┐
│                                                    │
│  Sync to Apple Reminders          [Toggle: OFF]    │
│  Sync tasks with due dates to your Reminders app.  │
│  Changes sync to all your Apple devices via iCloud. │
│                                                    │
│  ── When enabled: ──────────────────────────────── │
│                                                    │
│  Sync filter:  ○ Tasks with due dates (default)    │
│                ○ Today + due dates                  │
│                ○ All active tasks                   │
│                                                    │
│  Status: ● Synced · 12 tasks · last sync 2m ago   │
│                                                    │
│  [Force Sync]                                      │
│                                                    │
└────────────────────────────────────────────────────┘
```

When the user first enables the toggle and permission is `not_determined`, trigger the TCC prompt. If `denied`, show a message linking to System Settings > Privacy & Security > Reminders.

## Error Handling

| Scenario | Behavior |
|---|---|
| Swift helper not found at path | Log error, disable sync, show error in settings UI |
| TCC permission denied | Show message in settings linking to System Settings |
| Swift helper times out (15s/60s) | Log warning, skip this cycle, retry on next trigger |
| Swift helper crashes | Restart with exponential backoff (5s → 10s → 20s → 60s max) |
| EventKit returns error on create/update | Log error, mark mapping as failed, retry on next cycle |
| Reminder ID changed after iCloud sync | Match via `external_id`, update `reminder_id` in mapping |
| iCloud sync delayed (>30s) | Polling fallback at 5 min catches it |
| App crashes mid-sync | On next launch, full sync reconciles any missed changes |

## Disable / Cleanup Behavior

When the user disables sync:
- The orchestrator stops (watcher killed, listeners unsubscribed)
- The "Untask" list and its reminders are **left in place** in Reminders
- The `reminders_mapping` table is **preserved** (so re-enabling is fast)
- If the user wants to remove reminders, they delete the "Untask" list manually in Reminders.app

Rationale: Deleting reminders automatically could surprise users who rely on them while away from their Mac. Leaving them in place is the safer default.

## Known Limitations

1. **iCloud sync latency (5-30 seconds)** — Not instant. Changes from phone reach Mac within seconds to ~30 seconds depending on network conditions. Acceptable for a task manager.

2. **Completion sync is the weakest link** — Apple Community forums document cases where completion status fails to sync. The 5-minute polling fallback mitigates this.

3. **Mac must run periodically** — Untask pushes changes when it's running. If the Mac is off for a week, Reminders won't update. Changes queue and sync on next launch.

4. **No subtask hierarchy** — EventKit doesn't expose subtasks. Only top-level tasks sync. Could flatten subtasks as "Parent > Child" in the title if desired (future enhancement).

5. **Apple ecosystem only** — Requires iCloud and Apple devices. Android users get nothing from this feature.

6. **Reminders app may need to be running** — Some third-party developers report that EventKit sync is more reliable when Reminders.app is allowed to run in background. Needs testing.

7. **Recurrence rules are one-way** — Untask manages its own recurrence engine. The reminder itself is not set as recurring in EventKit. Instead, when a recurring task is completed, Untask spawns a new instance and syncs it as a new reminder.

## Future Enhancements (not in v1)

- **Calendar sync** — Optional toggle to also create calendar events for visual timeline view
- **Subtask flattening** — Sync subtasks as separate reminders with "Parent > Child" title format
- **Bidirectional title editing** — Allow title changes in Reminders to flow back to Untask
- **Siri integration** — "Hey Siri, add a task to Untask" (works automatically once tasks are in Reminders)
- **Quick-add from Reminders** — Detect new reminders added directly to the "Untask" list and import them as tasks
- **Sync status in menu bar** — Show sync indicator in the tray icon
- **Single long-lived helper process** — Replace per-command spawns with a single NDJSON protocol process for better performance (reuse EKEventStore instance across operations)

## Implementation Order

1. **Swift helper** — Build the CLI tool, test it standalone
2. **Database migration** — Add `reminders_mapping` table
3. **Sync orchestrator** — `remindersSync.ts` with push logic (Untask → Reminders), including batch initial sync
4. **Watcher + pull** — Add `--watch` mode and completion pull (Reminders → Untask), including recurring task handling
5. **Loop prevention** — Implement both `recentlyPulled` and `pushInFlight` mechanisms
6. **Settings UI** — Toggle, filter, status display, permission flow
7. **Entitlements + packaging** — Info.plist TCC description, entitlements.plist, extraResource, build scripts, .gitignore
8. **Testing** — Manual testing across devices, edge cases (offline, rapid changes, bulk operations, recurring tasks, iCloud ID changes)
