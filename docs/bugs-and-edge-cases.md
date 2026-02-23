# Bugs and Edge Cases

Date: 2026-02-23

## Flow Map and Status

| ID | Flow | Status |
| --- | --- | --- |
| TASK-001 | Cascade delete in nested task trees | Fixed |
| TASK-002 | Complete with `completeChildren` in nested trees | Fixed |
| TASK-003 | Concurrent `fetchTasks` / `refreshTasks` response ordering | Fixed |
| TASK-004 | Bursty `TASK_DATA_CHANGED` events trigger repeated refresh work | Fixed |
| TASK-005 | Notification-driven task navigation always forced refresh | Fixed |
| TASK-006 | Optimistic temp task ID collision under same-millisecond creates | Fixed |
| TASK-007 | Missing task navigation selected non-existent task ID | Fixed |
| TASK-008 | Delete rollback dropped prior selected task state on failure | Fixed |
| TASK-009 | Background task reload retained selected ID for missing task | Fixed |
| TASK-010 | Cross-thread proactive stream completion could leak into active chat thread | Fixed |
| TASK-011 | Stream cancel left stale request payload mappings in chat store | Fixed |
| TASK-012 | Late `assistant_done` could leave orphaned stream placeholder message | Fixed |
| TASK-013 | Stream error path left stale assistant-message request mapping | Fixed |
| TEST-001 | Core task service recursion tests are skipped in default suite | Fixed (Guarded workflow) |

## Detailed Issues

## TASK-001: Cascade delete only removed direct children in optimistic renderer state

Flow
- Task lifecycle: delete parent task with deep subtask hierarchy.

Repro steps
1. Create `Parent` -> `Child` -> `Grandchild` hierarchy.
2. Trigger delete with cascade on `Parent`.
3. Observe renderer state before the async IPC call settles.

Expected
- Parent and all descendants should disappear immediately.

Actual (before fix)
- Only parent and direct children were removed optimistically; deeper descendants remained temporarily.

Fix
- Renderer now computes the full descendant closure before optimistic removal.

Status
- Fixed in `src/renderer/stores/taskStore.ts`.

## TASK-002: Complete with children only marked parent done optimistically

Flow
- Task lifecycle: complete parent with `completeChildren: true`.

Repro steps
1. Create `Parent` with active child tasks.
2. Complete parent with `completeChildren` enabled.
3. Observe renderer state before IPC returns.

Expected
- Parent and descendants should appear done immediately.

Actual (before fix)
- Parent was marked done but descendants stayed active until later refresh.

Fix
- Optimistic completion now marks parent and descendants done together, with rollback on failure.

Status
- Fixed in `src/renderer/stores/taskStore.ts`.

## TASK-003: Out-of-order list responses could revert newer task state

Flow
- Main/renderer synchronization during overlapping `fetchTasks` and `refreshTasks` calls.

Repro steps
1. Trigger `fetchTasks()`.
2. Before it resolves, trigger `refreshTasks()`.
3. Let refresh return first (new data), then fetch return later (stale data).

Expected
- Latest request wins; stale response should be ignored.

Actual (before fix)
- Later-arriving stale response could overwrite the newest state.

Fix
- Added monotonic request IDs and stale-response ignore logic in task list loading.

Status
- Fixed in `src/renderer/stores/taskStore.ts`.

## TASK-004: Event bursts can trigger repeated task refresh work

Flow
- Main process emits `TASK_DATA_CHANGED`; renderer refreshes task list each event.

Repro steps
1. Perform rapid task mutations (e.g., AI/tool-driven batch updates).
2. Observe repeated renderer refresh calls in short intervals.

Expected
- Equivalent final UI state with minimal redundant refreshes.

Actual (before fix)
- Every event triggers an immediate refresh.

Fix
- Added a coalesced refresh controller for `onTaskDataChanged` so bursts collapse to minimal refresh calls while preserving correctness.

Status
- Fixed in `src/renderer/components/layout/AppShell.tsx` and `src/renderer/lib/taskRefreshCoalescer.ts`.

## TASK-005: Task navigation always refreshed even when target task was already present

Flow
- Notification/quick-add driven task navigation in renderer shell.

Repro steps
1. Trigger task navigation for a task already loaded in the renderer store.
2. Observe navigation path in `onTaskNavigate`.

Expected
- Navigate immediately when task exists; refresh only when task is missing.

Actual (before fix)
- Always refreshed task list before resolving view/navigation target.

Fix
- `onTaskNavigate` now checks in-memory task state first and only refreshes when needed.

Status
- Fixed in `src/renderer/components/layout/AppShell.tsx`.

## TASK-006: Optimistic temp task IDs could collide for rapid creates

Flow
- Renderer optimistic task creation.

Repro steps
1. Trigger two task creates in the same millisecond (or with a mocked `Date.now()`).
2. Observe optimistic temp IDs generated before main-process create responses return.

Expected
- Each optimistic task should have a unique temp ID.

Actual (before fix)
- Temp IDs used only `Date.now()`, so two rapid creates could share the same ID and cause optimistic replacement ambiguity.

Fix
- Added a monotonic counter suffix to optimistic temp IDs.

Status
- Fixed in `src/renderer/stores/taskStore.ts`.

## TASK-007: Missing task navigation selected a non-existent task ID

Flow
- Notification/quick-add task navigation when a referenced task is no longer available.

Repro steps
1. Emit `task:navigate` for a task ID that is missing both before and after refresh.
2. Observe selected task state update in renderer.

Expected
- Keep navigation fallback to tasks view, but do not select a non-existent task ID.

Actual (before fix)
- Selection was set to the missing task ID.

Fix
- Navigation now clears selection (`null`) when the target task still cannot be resolved.

Status
- Fixed in `src/renderer/components/layout/AppShell.tsx`.

## TASK-008: Failed cascade delete rollback did not restore previously selected task

Flow
- Task lifecycle: cascade delete fails after optimistic renderer update.

Repro steps
1. Select a descendant task.
2. Trigger parent cascade delete.
3. Force main-process delete failure.

Expected
- On failure, renderer should fully restore pre-delete state, including selection.

Actual (before fix)
- Task list rolled back, but `selectedTaskId` stayed cleared (`null`).

Fix
- Delete rollback now restores both the previous task list and previous selected task ID.

Status
- Fixed in `src/renderer/stores/taskStore.ts`.

## TASK-009: Full task list reload kept stale selected task ID when selected task no longer existed

Flow
- Main/renderer synchronization after cross-window task mutation and list refresh.

Repro steps
1. Select task `A` in renderer.
2. Remove `A` elsewhere and trigger list refresh.
3. Observe selection state after refresh.

Expected
- Selection should clear if selected ID is no longer present in refreshed list.

Actual (before fix)
- `selectedTaskId` could remain set to a non-existent task.

Fix
- Task load path now validates `selectedTaskId` against refreshed task IDs and clears stale selection.

Status
- Fixed in `src/renderer/stores/taskStore.ts`.

## TASK-010: Proactive assistant completion from another conversation could land in active thread

Flow
- Chat streaming: proactive background assistant events while user is viewing a different conversation.

Repro steps
1. Have active conversation `A` in renderer.
2. Receive proactive stream events for request in conversation `B` (placeholder exists in-flight).
3. Receive `assistant_done` for conversation `B`.

Expected
- Active thread should not render conversation `B` message; request state should be cleaned and conversation list refreshed.

Actual (before fix)
- `assistant_done` finalized into the active thread when in-flight placeholder existed, causing cross-thread message leakage.

Fix
- Added conversation-ID guard in `assistant_done` handling for in-flight paths.
- On mismatch, removes placeholder, clears request-tracking maps for that request, and refreshes conversations.

Status
- Fixed in `src/renderer/stores/chat/chatStreamSlice.ts`.

## TASK-011: Cancelling stream did not clear request payload map entries

Flow
- Chat streaming: user cancels an in-flight assistant generation.

Repro steps
1. Send a message and create in-flight request state.
2. Trigger `cancelStream()`.
3. Inspect `requestPayloadByRequestId` in chat store state.

Expected
- Cancel should clear request-scoped in-flight metadata, including payload mappings.

Actual (before fix)
- `requestPayloadByRequestId` entries were retained after cancellation.

Fix
- `cancelStream()` now clears `requestPayloadByRequestId` together with other request-scoped maps.

Status
- Fixed in `src/renderer/stores/chat/chatStreamSlice.ts`.

## TASK-012: Late `assistant_done` without in-flight state could keep orphaned placeholder message

Flow
- Chat streaming race: terminal assistant event arrives after request in-flight state was already cleared.

Repro steps
1. Have placeholder message `assistant-stream-<requestId>` in chat state.
2. Ensure `inFlightByRequestId[requestId]` is already cleared (e.g., after prior error path).
3. Receive `assistant_done` for the same request.

Expected
- Final assistant message should replace any request placeholder; no orphaned placeholder remains.

Actual (before fix)
- Placeholder removal only used `inFlight.placeholderId`, so with missing in-flight state the placeholder could remain.

Fix
- `assistant_done` finalization now falls back to request-derived placeholder ID (`assistant-stream-<requestId>`) when in-flight metadata is absent.

Status
- Fixed in `src/renderer/stores/chat/chatStreamSlice.ts`.

## TASK-013: Stream error handling did not clear assistant-message request mapping

Flow
- Chat streaming: request fails with stream `error` event.

Repro steps
1. Set an entry in `assistantMessageIdByRequestId` for a request.
2. Emit retryable `error` event for the same request.
3. Inspect request-tracking maps.

Expected
- Request-scoped assistant-message mapping should be removed on terminal error handling.

Actual (before fix)
- `assistantMessageIdByRequestId[requestId]` was retained.

Fix
- Error handler now removes assistant-message mapping for the errored request while preserving retry payload data when `retryable=true`.

Status
- Fixed in `src/renderer/stores/chat/chatStreamSlice.ts`.

## TEST-001: Task service recursion tests are skipped

Flow
- Developer verification flow.

Repro steps
1. Run `npm test`.
2. Observe skipped `taskService` tests.

Expected
- Critical task recursion paths covered in active test suite.

Actual
- Service-level task recursion tests are currently skipped.

Root cause
- `better-sqlite3` native module in this local environment targets `NODE_MODULE_VERSION 143`, while current Node runtime requires `127`, so native SQLite probes fail and conditional suites skip.

Fix
- Added `scripts/ensure-better-sqlite3.cjs` and `npm run test:full` to auto-verify and rebuild `better-sqlite3` before running tests.

Status
- Fixed with guard workflow (`npm run test:full`).
- `npm test` still assumes native module is already aligned.

## Verification added in this iteration

- `src/renderer/stores/taskStore.test.ts`
  - Cascade-delete removes full descendant tree optimistically.
  - Failed cascade-delete rollback restores previous selected task.
  - `completeChildren` marks descendants done optimistically.
  - Optimistic `completeChildren` rolls back on failure.
  - Stale fetch response is ignored when a newer refresh has already resolved.
  - Refresh clears selected task when selected ID is missing from refreshed list.
- `src/renderer/lib/taskRefreshCoalescer.test.ts`
  - First change refreshes immediately.
  - Burst notifications during in-flight refresh collapse to one trailing refresh.
  - Disposed coalescer ignores later notifications.
  - Coalescer emits notify/refresh metrics for dev diagnostics.
- `src/renderer/components/layout/taskNavigation.test.ts`
  - Missing target after refresh resolves to `undefined` (so selection can be cleared safely).
- `src/renderer/stores/chatStore.test.ts`
  - Cross-thread proactive `assistant_done` is dropped from active thread and request state is cleaned.
  - `cancelStream()` clears request payload mappings with other in-flight request state.
  - Late `assistant_done` replaces orphaned request placeholder even when in-flight metadata is already missing.
  - Retryable `error` clears assistant-message request mapping while retaining retry payload.
