# Structural Audit Log

Date: 2026-02-23

## Summary

This change set focuses on task-flow correctness and small structural simplifications in renderer state management, with no UI or feature changes.

## Changes

## 1. Centralized task list loading path (`fetchTasks` and `refreshTasks`)

What changed
- Added a shared `loadTasks()` helper in `src/renderer/stores/taskStore.ts`.
- Both `fetchTasks` and `refreshTasks` now use the same loading/error/sorting path.
- Added request sequencing to ignore stale async responses.

Why
- Removes duplicate list-fetch logic.
- Prevents out-of-order async responses from regressing state.

Impact
- Correctness: latest list response wins.
- Maintainability: fewer duplicate branches.

## 2. Recursive descendant handling for optimistic tree mutations

What changed
- Added `collectTaskAndDescendantIds()` helper.
- Cascade delete now removes full descendant trees optimistically.
- Added `markDoneForTaskAndDescendants()` for `completeChildren` optimism.

Why
- Aligns renderer optimistic behavior with recursive main-process task service behavior.

Impact
- Correctness: immediate UI state matches intended recursive operation semantics.
- Polish: removes transient inconsistent subtask states.

## 3. Reminder offset defaulting deduplicated

What changed
- Added `resolveDefaultReminderOffset()` helper.
- Reused in both create and update task paths.

Why
- Remove duplicated logic and implicit input mutation.

Impact
- Maintainability: single source of truth for default reminder offset behavior.

## 4. Regression test coverage added for high-risk task-store edges

What changed
- Added `src/renderer/stores/taskStore.test.ts` with targeted edge-case tests.

Why
- Lock in fixes and prevent regressions in the most failure-prone task flows.

Impact
- Reliability: catches task tree and async race regressions early.

## 5. Cross-window task refresh coalescing

What changed
- Added `createTaskRefreshCoalescer()` in `src/renderer/lib/taskRefreshCoalescer.ts`.
- Updated `AppShell` task-data-change subscription to route through the coalescer instead of refreshing on every event.
- Added dedicated tests in `src/renderer/lib/taskRefreshCoalescer.test.ts`.

Why
- Cross-window mutation bursts (quick add, assistant/tool-driven updates) can emit multiple `TASK_DATA_CHANGED` events in tight succession, causing redundant list fetches.

Impact
- Performance: fewer redundant renderer refreshes under bursty updates.
- Correctness: first event still refreshes immediately; trailing updates are preserved.

## 6. Task store mutation-path deduplication

What changed
- Added `replaceTaskAndSort()` helper in `src/renderer/stores/taskStore.ts`.
- Reused it across create/update/complete/cancel/reopen/toggle optimistic confirmation paths.
- Removed one unnecessary intermediate variable in delete-path existence checks.

Why
- These paths repeated the same map-and-sort sequence, increasing cognitive load and copy/paste drift risk.

Impact
- Maintainability: lower duplication and clearer mutation intent.
- Footprint: small LOC reduction in hot-path store code.

## 7. Native SQLite-backed test suite unblocked in local environment

What changed
- Rebuilt `better-sqlite3` from source against the active Node ABI.
- Re-ran previously skipped suites (`taskService`, `memoryService`, `migrations`) and validated they pass.
- Added `scripts/ensure-better-sqlite3.cjs` and `npm run test:full` so ABI alignment can be self-healed before test runs.

Why
- The project had hidden coverage gaps whenever the native module ABI mismatched the running Node version.

Impact
- Correctness confidence: all currently defined tests execute in this environment (no skipped files).
- Durability: a single command now heals ABI mismatches and runs the suite.

## 8. Additional task-store and navigation-path simplification

What changed
- Added `showUndoToastAndRefresh()` helper in `src/renderer/stores/taskStore.ts` to remove repeated undo-toast callback blocks.
- Updated notification-driven navigation in `AppShell` to refresh tasks only when the target task is missing from current renderer state.

Why
- Reduces duplicated async callback logic in the task store.
- Avoids unnecessary refresh work during normal navigation when data is already present.

Impact
- Maintainability: smaller mutation handlers and clearer intent.
- Performance: fewer avoidable refresh calls on navigation flow.

## 9. Navigation helper extraction + optimistic temp-ID hardening

What changed
- Extracted task navigation logic into `src/renderer/components/layout/taskNavigation.ts`.
- Added unit coverage in `src/renderer/components/layout/taskNavigation.test.ts`.
- Hardened optimistic temp ID generation in `taskStore` with a monotonic counter suffix.
- Added regression test for same-millisecond optimistic create IDs in `src/renderer/stores/taskStore.test.ts`.

Why
- Keeps `AppShell` effect logic small and testable.
- Prevents rare-but-real optimistic ID collisions during rapid task creation.

Impact
- Correctness: deterministic unique optimistic IDs.
- Maintainability: navigation policy is centralized and unit-tested.

## 10. Optimistic mutation helper consolidation + missing-task navigation guard

What changed
- Added `patchTaskById()` helper in `taskStore` and reused it for multiple optimistic mutation paths.
- Added a guard in `AppShell` task navigation to clear selection when the task cannot be resolved after refresh.
- Extended `taskNavigation` tests to cover unresolved navigation targets.

Why
- Removes repetitive map/patch boilerplate in core mutation flows.
- Prevents stale selection state when navigation payload references missing tasks.

Impact
- Maintainability: lower duplication in task store mutation code.
- Correctness: no non-existent selected task IDs after failed navigation resolution.

## 11. Dev-only task refresh instrumentation

What changed
- Added optional coalescer metric events (`notify`, `refresh`) in `src/renderer/lib/taskRefreshCoalescer.ts`.
- Wired `AppShell` to collect and periodically log dev-only coalescing stats (notifications vs refreshes) when running in development mode.
- Added coalescer metric emission coverage in `src/renderer/lib/taskRefreshCoalescer.test.ts`.

Why
- Completes Phase 2 observability with lightweight diagnostics for refresh coalescing effectiveness.

Impact
- Performance visibility: can verify coalescing ratio during local development without changing user-facing behavior.
- Production safety: instrumentation is gated behind `import.meta.env.DEV`.

## 12. Direct dependency footprint cleanup

What changed
- Removed unused direct dependency `@radix-ui/react-tooltip` from `package.json`.
- Updated lockfile to keep dependency graph consistent.
- Kept `radix-ui` package usage intact (`Slot`, `Popover`) with no UI or behavior change.

Why
- The package had no direct imports in the application code and increased install/bundle footprint unnecessarily.

Impact
- Footprint: reduced direct dependency surface area.
- Maintainability: less dependency overhead and fewer transitive update paths to monitor.

## 13. Selection-state correctness hardening in task-store refresh/delete flows

What changed
- Updated shared task load path to clear `selectedTaskId` when refreshed task data no longer contains the selected task.
- Updated cascade-delete failure rollback to restore both the previous task list and previous selected task ID.
- Extended `src/renderer/stores/taskStore.test.ts` with targeted regressions for both cases.

Why
- Selection state should remain consistent with task list truth after both background refreshes and failed optimistic mutations.

Impact
- Correctness: avoids non-existent selected task references after reloads.
- Polish: failed destructive actions now return users to their exact pre-action selection state.
- Maintainability: selection synchronization now lives in the shared list-loading path.

## 14. Radix dependency surface trimmed while preserving UI API

What changed
- Replaced `radix-ui` umbrella imports in UI primitives with direct imports from:
  - `@radix-ui/react-slot`
  - `@radix-ui/react-popover`
- Kept exported `Popover` API shape (`Popover.Root`, `Popover.Trigger`, etc.) unchanged for existing consumers.
- Removed `radix-ui` direct dependency from `package.json` and refreshed lockfile.

Why
- The app used only Slot and Popover primitives from the umbrella package.
- Direct package imports reduce dependency bloat and make dependency intent explicit.

Impact
- Footprint: narrower direct dependency surface in production dependencies.
- Maintainability: clearer mapping from UI primitives to concrete packages.
- Compatibility: no user-facing UI or behavior changes.

## 15. Cross-thread chat stream completion guard

What changed
- Hardened `assistant_done` handling in `src/renderer/stores/chat/chatStreamSlice.ts` for in-flight proactive requests.
- Added a conversation mismatch guard so assistant completions for non-active conversations do not finalize into the currently open thread.
- Added cleanup for request-scoped tracking maps (`inFlightByRequestId`, `requestPayloadByRequestId`, `pendingViewSwitchByRequestId`, `conversationIdByRequestId`, `assistantMessageIdByRequestId`) on that mismatch path.
- Added regression coverage in `src/renderer/stores/chatStore.test.ts`.

Why
- Existing mismatch protection only covered proactive `assistant_done` events with no in-flight state.
- When a proactive placeholder was already in-flight, completion for another conversation could leak into active-thread messages.

Impact
- Correctness: prevents cross-thread message contamination in renderer chat state.
- Maintainability: request cleanup behavior is now consistent on this edge path.
- Performance: avoids retaining stale request payload/maps for dropped cross-thread completions.

## 16. Chat cancel-stream request-state cleanup completion

What changed
- Updated `cancelStream()` in `src/renderer/stores/chat/chatStreamSlice.ts` to clear `requestPayloadByRequestId` along with other request-scoped maps.
- Added regression coverage in `src/renderer/stores/chatStore.test.ts` asserting request payload cleanup after cancellation.

Why
- Cancellation should terminate a turn cleanly and release all request metadata.
- Retaining payload mappings after cancel created avoidable stale state and gradual in-memory bloat over repeated cancellations.

Impact
- Correctness: request metadata is fully reset after user-initiated cancellation.
- Performance/footprint: removes stale payload entries that were otherwise retained.
- Maintainability: cleanup semantics are now consistent across cancel and terminal stream paths.

## 17. Assistant-done placeholder race hardening

What changed
- Updated `assistant_done` finalization in `src/renderer/stores/chat/chatStreamSlice.ts` to remove placeholder by:
  - in-flight placeholder ID when available, or
  - fallback request-derived placeholder ID (`assistant-stream-<requestId>`) when in-flight metadata is absent.
- Added regression coverage in `src/renderer/stores/chatStore.test.ts` for late `assistant_done` with missing in-flight state.

Why
- Placeholder cleanup previously depended only on in-flight metadata.
- In race scenarios where in-flight state was already cleared before `assistant_done`, placeholder messages could linger.

Impact
- Correctness: prevents stale/orphaned placeholder messages in terminal stream races.
- Polish: final assistant message consistently replaces transient stream placeholders.
- Maintainability: terminal-event behavior is more deterministic across normal and raced paths.

## 18. Stream-error assistant mapping cleanup

What changed
- Updated `handleError` in `src/renderer/stores/chat/chatStreamSlice.ts` to clear `assistantMessageIdByRequestId[requestId]`.
- Added regression coverage in `src/renderer/stores/chatStore.test.ts` for retryable stream errors to assert:
  - assistant mapping is cleared
  - retry payload/conversation state is retained for retry.

Why
- Error handling is terminal for the active in-flight turn and should remove stale assistant-message mapping for that request.
- Keeping this mapping was inconsistent with other request cleanup paths and risked stale state accumulation.

Impact
- Correctness: request-scoped assistant mapping no longer lingers after error.
- Maintainability: cleanup semantics are more uniform across terminal stream paths.
- Reliability: retry path remains intact while avoiding stale mapping drift.

## Validation

- `npx vitest run src/renderer/stores/taskStore.test.ts` passed.
- `npx vitest run src/renderer/lib/taskRefreshCoalescer.test.ts` passed.
- `npx vitest run src/main/services/taskService.test.ts src/main/services/memoryService.test.ts src/main/db/migrations.test.ts` passed.
- `npm test` passed (all existing + new tests).
- `npm run test:full` passed.
- `npm run typecheck` passed.
- `npx vitest run src/renderer/components/layout/taskNavigation.test.ts` passed.
- `npx vitest run src/renderer/lib/taskRefreshCoalescer.test.ts` passed with metric assertions.
- `npm run test:full` passed after dependency cleanup.
- `npx vitest run src/renderer/stores/taskStore.test.ts` passed with selection-state regression cases.
- `npm run test:full` passed (`38/38` files, `285/285` tests).
- `npm run typecheck` passed.
- `npx eslint src/renderer/components/ui/button.tsx src/renderer/components/ui/popover.tsx` passed.
- `npm run typecheck` passed after direct Radix import swap.
- `npm run test:full` passed after dependency swap (`38/38` files, `285/285` tests).
- `npx vitest run src/renderer/stores/chatStore.test.ts` passed with cross-thread proactive completion regression.
- `npx eslint src/renderer/stores/chat/chatStreamSlice.ts src/renderer/stores/chatStore.test.ts` passed.
- `npm run test:full` passed (`38/38` files, `286/286` tests).
- `npm run typecheck` passed.
- `npx vitest run src/renderer/stores/chatStore.test.ts` passed with cancel-stream payload cleanup regression.
- `npx eslint src/renderer/stores/chat/chatStreamSlice.ts src/renderer/stores/chatStore.test.ts` passed.
- `npm run test:full` passed (`38/38` files, `287/287` tests).
- `npm run typecheck` passed.
- `npx vitest run src/renderer/stores/chatStore.test.ts` passed with late assistant-done placeholder regression.
- `npx eslint src/renderer/stores/chat/chatStreamSlice.ts src/renderer/stores/chatStore.test.ts` passed.
- `npm run test:full` passed (`38/38` files, `288/288` tests).
- `npm run typecheck` passed.
- `npx vitest run src/renderer/stores/chatStore.test.ts` passed with stream-error assistant-mapping regression.
- `npx eslint src/renderer/stores/chat/chatStreamSlice.ts src/renderer/stores/chatStore.test.ts` passed.
- `npm run test:full` passed (`38/38` files, `289/289` tests).
- `npm run typecheck` passed.
