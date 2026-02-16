# Autopilot Full Trust Mode

**Date**: 2026-02-16
**Status**: Approved

## Problem

Autopilot mode still blocks high-risk and critical actions (delete, invoice transitions, completed-task edits, bulk writes). Users who choose Autopilot expect full autonomy.

## Decision

Upgrade existing Autopilot mode to auto-execute all actions regardless of risk level or hard-override status. No new mode added.

## Changes

### 1. `autonomy.ts` — `evaluateGate()`

Make `hardOverride` check mode-aware (skip in autopilot). Make autopilot case return `execute` unconditionally.

Before:
```typescript
if (hardOverride) {
  return { action: 'pending', reason: 'Hard safety override requires confirmation.' };
}
// ...
case 'autopilot':
  if (risk === 'low' || risk === 'medium') return { action: 'execute' };
  return { action: 'pending', reason: `Autopilot mode: ${risk}-risk actions require approval.` };
```

After:
```typescript
if (hardOverride && mode !== 'autopilot') {
  return { action: 'pending', reason: 'Hard safety override requires confirmation.' };
}
// ...
case 'autopilot':
  return { action: 'execute' };
```

### 2. `tools.ts` — `executeToolCall()`

When the autonomy gate returns `execute` for a mutation tool, set `skipInternalConfirmation: true` so individual tool guards (delete confirmation, invoice confirmation, bulk write confirmation) also yield.

Before:
```typescript
const execContext: ToolExecutionContext = context.autonomyBypass
  ? { ...context, skipInternalConfirmation: true }
  : context;
```

After:
```typescript
const gateApproved = !context.autonomyBypass && isMutationTool(rawToolName) && gateResult?.action === 'execute';
const execContext: ToolExecutionContext =
  context.autonomyBypass || gateApproved
    ? { ...context, skipInternalConfirmation: true }
    : context;
```

### 3. Tests

Update autonomy and tools test suites to cover:
- Autopilot + critical risk = execute
- Autopilot + hard override = execute
- Autopilot + delete_task = no confirmation card
- Autopilot + invoice transition = no confirmation card
- Safe/Manual modes unchanged

## Safety nets preserved

- `undo_last_action` tool still works for all mutations except delete
- Task event audit log still records all AI mutations
- Mode toggle in UI lets user downgrade to Safe/Manual anytime

## Scope

- 2 files changed (autonomy.ts, tools.ts)
- Test updates
- No UI changes, no schema changes, no new types
