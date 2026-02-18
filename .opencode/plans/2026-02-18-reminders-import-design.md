# Reminders Import — Design Document

**Date:** 2026-02-18
**Status:** Draft

## Problem

Users can create reminders on their iPhone/Apple Watch, but these don't sync back to Untask. Current sync is 1.5-way: Untask → Reminders pushes all data, but Reminders → Untask only pulls completion status for already-mapped tasks.

Users want to:
1. Quick-capture tasks via Siri ("Hey Siri, remind me to call John")
2. Create reminders directly in Reminders.app on iPhone
3. Have these appear in Untask automatically

## Solution

Extend the pull logic to **import unmapped reminders** from the "Untask" list into Untask as new tasks.

## User Experience

### Capture flow
1. User says "Hey Siri, remind me to call John tomorrow at 2pm"
2. Siri creates reminder in default list (not Untask list)
3. User moves it to "Untask" list in Reminders.app (or sets default list to Untask)
4. Untask detects the new reminder on next pull (watcher or polling)
5. Creates task in `inbox` status with title, due date, notes, priority
6. User sees it in Untask inbox, can activate/project-assign

### Completion flow (existing, unchanged)
1. User checks off reminder on phone
2. Untask marks task as `done`

### Deletion flow (new)
1. User deletes reminder in Reminders.app
2. Untask marks task as `cancelled` (or `done` if cancelled disabled)

## Architecture Changes

### 1. Swift helper: Add recurrence rule extraction

Add `recurrenceRule` field to `FetchedReminder`:

```swift
struct FetchedReminder: Codable {
    let reminderId: String
    let externalId: String?
    let title: String
    let notes: String?
    let dueDate: String?
    let priority: Int
    let isCompleted: Bool
    let recurrenceRule: String?  // RFC 5545 RRULE string, e.g., "FREQ=WEEKLY;BYDAY=MO"
}
```

### 2. TypeScript: Status fallback helper

```typescript
function getTerminalStatusForSync(preferred: 'done' | 'cancelled'): PredefinedStatusId {
  if (preferred === 'done') return 'done'; // always locked
  
  const config = getStatusConfig();
  if (config.enabled.includes('cancelled')) return 'cancelled';
  return 'done'; // fallback
}
```

### 3. TypeScript: Recurrence rule converter

Convert RFC 5545 RRULE to Untask human-readable format:

| RRULE | Untask |
|-------|--------|
| `FREQ=DAILY` | `daily` |
| `FREQ=WEEKLY` | `weekly` |
| `FREQ=MONTHLY` | `monthly` |
| `FREQ=WEEKLY;INTERVAL=2` | `every 2 weeks` |
| `FREQ=WEEKLY;BYDAY=MO` | `every monday` |
| `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR` | `every weekday` |
| Complex patterns | `null` (unsupported) |

### 4. TypeScript: Import logic in pullChanges

```
For each fetched reminder:
  If reminder is already mapped → handle completion (existing)
  If reminder is unmapped AND not completed:
    → Create task in inbox
    → Set title, dueDate, priority, notes, recurrence
    → Create mapping
```

### 5. TypeScript: Deletion detection

```
For each existing mapping:
  If reminder no longer in fetch results:
    → Mark task as cancelled (or done if cancelled disabled)
    → Delete mapping
```

## Edge Cases

### Status configuration changes
- `done` and `inbox` are locked (cannot be disabled)
- `cancelled` can be disabled → fallback to `done`

### Recurring reminders - Supported
- daily, weekly, monthly, yearly
- every N days/weeks/months
- every weekday
- every [day name]

### Recurring reminders - Unsupported (imported without recurrence)
- 2nd Tuesday of month
- Every Mon, Wed, Fri
- Limited occurrences (COUNT/UNTIL)

### Both apps edit same task
- Untask is source of truth for data fields
- Only completion/deletion status syncs from Reminders

## Implementation Order

1. **Status fallback helper** — `getTerminalStatusForSync()`
2. **Priority reverse mapping** — `eventKitToUntaskPriority()`
3. **Recurrence converter** — `convertRecurrenceRule()`
4. **Swift: Extract recurrence** — Update `FetchedReminder` model
5. **Import logic** — Update `pullChanges()` to import unmapped reminders
6. **Deletion handling** — Mark as cancelled with done fallback
7. **Testing** — Manual testing

## Files Changed

- `untask/swift-helper/Sources/Models.swift`
- `untask/swift-helper/Sources/EventKitBridge.swift`
- `untask/src/main/services/remindersSync.ts`
