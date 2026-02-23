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
| TASK-014 | `completeChildren` undo restored parent but not all completed subtasks | Fixed |
| TASK-015 | Stale task confirm triggers could reopen delete/complete popovers unexpectedly | Fixed |
| TASK-016 | Chat stream indicator could revert to "Thinking" after token output started | Fixed |
| TASK-017 | Chat note-image draft access used dynamic notes-store import and triggered persistent build warning | Fixed |
| TASK-018 | Stale scheduled focus callbacks could fire after rapid view/task/search transitions | Fixed |
| TASK-019 | Editor interaction latency had no direct dev-time measurement signal | Fixed |
| TASK-020 | JSON editor content paid an unnecessary post-mount hydration pass | Fixed |
| TASK-021 | Dev-only latency probes still contributed a production runtime chunk | Fixed |
| TASK-022 | Slash-menu query path rebuilt default/custom items on every query update | Fixed |
| TEST-001 | Core task service recursion tests are skipped in default suite | Fixed |

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

## TASK-014: `completeChildren` undo did not always restore child task completion state atomically

Flow
- Task lifecycle: complete parent with subtasks, then undo via toast/undo action.

Repro steps
1. Create a parent task with multiple active subtasks.
2. Complete the parent with `completeChildren`.
3. Trigger undo for the completion action.

Expected
- Parent and all children completed by that action should revert together.

Actual (before fix)
- Parent could revert to active while one or more children remained done.

Fix
- Grouped recursive `completeChildren` user events under the parent completion event.
- Extended grouped-child undo restoration to non-delete actions so `complete` undo is atomic.

Status
- Fixed in `src/main/services/taskService.ts`.

## TASK-015: Stale confirmation triggers could reopen delete/complete popovers during later remounts

Flow
- Task keyboard interactions (`Cmd+Backspace`, `Space`) combined with reorder/remount behavior.

Repro steps
1. Trigger task delete or complete confirmation for a task.
2. Perform interactions that remount/re-render task rows (for example reordering with `Option+Arrow`).
3. Observe unexpected confirm popover reopening (including delete confirm in unrelated moment).

Expected
- Confirmation popovers should open only for the explicit trigger action that requested them.

Actual (before fix)
- Trigger state remained set after consumption, so later row remounts could reopen stale confirmations.

Fix
- Added one-shot trigger handling in `TaskItem` with consumption callbacks to `TaskList`.
- `TaskList` now clears matching trigger state immediately after the row consumes it.

Status
- Fixed in `src/renderer/components/tasks/TaskItem.tsx` and `src/renderer/components/tasks/TaskList.tsx`.

## TASK-016: Stream indicator phase could flip back to "Thinking" after streaming text had already started

Flow
- Chat streaming with mixed `token` and `reasoning` events.

Repro steps
1. Start assistant response stream and receive token text output.
2. Receive additional reasoning event for the same request.
3. Observe streaming indicator phase.

Expected
- Once token output has started, indicator should no longer show "Thinking" for that stream.

Actual (before fix)
- Reasoning events unconditionally set `streamPhase` to `thinking`, even after token output started.

Fix
- Reasoning handler now keeps `streamPhase` unset once any text step exists in the in-flight stream.

Status
- Fixed in `src/renderer/stores/chat/chatStreamSlice.ts`.

## TASK-017: Chat note draft image lookup used dynamic notes-store import and emitted persistent build warning

Flow
- Notes -> AI handoff with note image attachment extraction during `sendMessage`.

Repro steps
1. Run renderer production build (`vite.renderer.config.ts`).
2. Inspect Rollup/Vite warnings for module loading.

Expected
- No avoidable dynamic/static import warning for core stores.

Actual (before fix)
- `notesStore.ts` was dynamically imported by `chatMessageSlice.ts` but also statically imported across notes UI modules, producing a persistent warning and eliminating intended split.

Fix
- Added a small `notesDraftBridge` module to expose active note draft content without direct chat->notes store dynamic import.
- `notesStore` now syncs active draft state into the bridge; chat message path reads from the bridge.

Status
- Fixed in `src/renderer/stores/notesDraftBridge.ts`, `src/renderer/stores/notesStore.ts`, and `src/renderer/stores/chat/chatMessageSlice.ts`.

## TASK-018: Scheduled focus callbacks could outlive interaction state and cause focus jumps

Flow
- Rapid interaction transitions across task navigation, view switching, and search modal open/close.

Repro steps
1. Trigger task navigation/select transitions quickly (or switch views quickly).
2. Open/close search quickly or change views while pending focus callbacks are queued.
3. Observe focus occasionally moving to stale targets after transition state changed.

Expected
- Focus scheduling should respect current UI state and cancel stale queued callbacks when the owning effect tears down.

Actual (before fix)
- Some `requestAnimationFrame`-scheduled focus callbacks were not cancelled on teardown, allowing stale callbacks to run after state/unmount transitions.

Fix
- Added `requestAnimationFrame` teardown/cancellation in:
  - `AppShell` view-focus effect,
  - `TaskList` selected-task navigation scheduling,
  - `SearchModal` open-focus effect.

Status
- Fixed in `src/renderer/components/layout/AppShell.tsx`, `src/renderer/components/tasks/TaskList.tsx`, and `src/renderer/components/search/SearchModal.tsx`.

## TASK-019: Editor interaction latency lacked direct measurement in development

Flow
- Note and task editor open/edit interaction performance validation.

Repro steps
1. Open note/task editors repeatedly in local development builds.
2. Attempt to compare interaction responsiveness before/after chunking/font/runtime optimizations.

Expected
- Consistent, low-friction dev signal for "editor opened -> first user change" latency across key editor flows.

Actual (before fix)
- No standardized metric existed; performance changes required ad hoc/manual timing guesses.

Fix
- Added `devLatencyMetrics` utility (dev-only) with keyed `start`/`end`/`cancel` tracking and periodic aggregate logging.
- Instrumented:
  - `NoteEditor`: active note ready -> first change (`note-editor-open`)
  - `TaskBody`: expanded editor -> first change (`task-editor-open`)

Status
- Fixed in `src/renderer/lib/devLatencyMetrics.ts`, `src/renderer/components/notes/NoteEditor.tsx`, and `src/renderer/components/tasks/TaskBody.tsx`.

## TASK-020: JSON editor content used post-mount full replace instead of initial content hydration

Flow
- Note/task editor open for persisted JSON-backed content.

Repro steps
1. Open a note or task body already stored as BlockNote JSON.
2. Observe editor initialization path in `BlockEditor`.

Expected
- JSON content should hydrate as initial editor content during editor creation (single-pass init).

Actual (before fix)
- Editor was created empty, then all blocks were replaced in a post-mount effect for JSON content.

Fix
- Added `resolveInitialEditorContent()` helper in `editorUtils`.
- `BlockEditor` now passes JSON blocks into `useCreateBlockNote({ initialContent })`.
- Legacy markdown conversion remains in a dedicated markdown-only migration effect.

Status
- Fixed in `src/renderer/components/editor/BlockEditor.tsx` and `src/renderer/components/editor/editorUtils.ts`.

## TASK-021: Dev-only latency probes still contributed a production runtime chunk

Flow
- Production renderer bundling after adding development-only editor latency probes.

Repro steps
1. Run production renderer build.
2. Inspect generated chunk list for instrumentation artifacts.

Expected
- Development probes should add no production runtime chunk.

Actual (before fix)
- Probe module (`devLatencyMetrics`) appeared as a standalone production chunk due static imports in editor components.

Fix
- Switched probe integration in note/task editors to dev-only dynamic import guarded by `import.meta.env.DEV`.
- Added no-op runtime fallback so production code paths stay inert without loading probe module.

Status
- Fixed in `src/renderer/components/notes/NoteEditor.tsx` and `src/renderer/components/tasks/TaskBody.tsx`.

## TASK-022: Slash-menu query path rebuilt full item lists on each query update

Flow
- Editor slash-menu typing interactions (`/` query updates).

Repro steps
1. Open editor slash menu.
2. Type query characters repeatedly.
3. Observe `BlockEditor` slash-menu item handling path.

Expected
- Query updates should filter from stable slash-menu items, not rebuild item definitions each time.

Actual (before fix)
- Each query update rebuilt default slash items and recomposed custom item arrays before filtering.

Fix
- `BlockEditor` now memoizes composed slash-menu items per editor instance and filters that memoized list per query.

Status
- Fixed in `src/renderer/components/editor/BlockEditor.tsx`.

## TEST-001: Task service recursion tests could be skipped when native ABI mismatched

Flow
- Developer verification flow.

Repro steps
1. Run `npm test`.
2. Observe skipped `taskService` tests.

Expected
- Critical task recursion paths covered in active test suite.

Actual (before fix)
- Service-level task recursion suites were conditionally skipped when `better-sqlite3` failed to load for the running Node ABI.

Root cause
- `better-sqlite3` native module in this local environment targets `NODE_MODULE_VERSION 143`, while current Node runtime requires `127`, so native SQLite probes fail and conditional suites skip.

Fix
- Added `scripts/ensure-better-sqlite3.cjs` to auto-verify and rebuild `better-sqlite3` before test runs.
- Updated `npm test` to run `ensure:sqlite-native` first so the default suite is ABI-guarded.
- Kept `npm run test:full` as an explicit robust full-suite entrypoint.

Status
- Fixed. Default `npm test` now enforces native ABI alignment before executing suites.

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
  - Reasoning events no longer flip stream indicator back to thinking after token output starts.
- `src/renderer/lib/devLatencyMetrics.test.ts`
  - Records and aggregates open-latency samples with configurable logging cadence.
  - Cancelled pending measurements are excluded from samples.
  - Disabled mode is a no-op.
- `src/renderer/components/editor/editorUtils.test.ts`
  - Blank content resolves to empty initialization.
  - BlockNote JSON resolves to `initialBlocks`.
  - Non-JSON and non-BlockNote JSON arrays resolve to legacy markdown path.
- `src/main/services/taskService.test.ts`
  - `completeChildren` undo restores parent and child completion states atomically.
- `src/renderer/hooks/useTaskListKeyboard.test.ts`
  - `Option+Arrow` reorder path does not route to delete handler.
  - `Cmd+Backspace` still routes to delete handler.
