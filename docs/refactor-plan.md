# Untask Stability and Polish Refactor Plan

Date: 2026-02-23
Scope: Electron macOS app stability/polish, maintainability, performance, and footprint reduction without changing UI or feature set.

## Guardrails

- No UI redesign or feature changes.
- Bug-fix behavior changes only.
- Preserve Electron security posture (context isolation, typed IPC, schema validation).
- Prefer smallest viable change with targeted regression tests.

## Critical Flows Mapped

1. Task lifecycle flow
- Create/update/reorder/complete/delete (including nested subtasks and undo toasts).
- Main risk: optimistic renderer state diverges from recursive main-process mutations.

2. Task synchronization flow (main -> renderer)
- Main emits `TASK_DATA_CHANGED`; renderer refreshes task list.
- Main risk: out-of-order async list responses can overwrite newer state.

3. Notes -> AI handoff flow
- Note content staging into chat context and focus transitions.
- Main risk: unsaved note state and list/editor transitions under failed saves.

4. Chat streaming flow
- Stream event subscription, in-flight request state, cancellation, and overlay focus behavior.
- Main risk: duplicate event application / stale request state.

5. Window and quick-add flow
- Summon/hide lifecycle, quick-add window IPC, and cross-window task updates.
- Main risk: listener lifecycle and cross-window consistency.

## Phase Roadmap

## Phase 1: Task Flow Correctness (Current)

Milestone
- Eliminate optimistic-state mismatches for recursive task operations.

Changes
- Recursive optimistic cascade delete for all descendants.
- Recursive optimistic complete when `completeChildren` is enabled.
- Stale-response guard for concurrent task list refresh/fetch.
- Shared reminder-offset resolver to reduce duplicated branching.
- Regression tests for all three edge cases.

Risk
- Low. Changes are isolated to renderer store and covered by tests.

Exit criteria
- New task-store tests pass.
- Full existing test suite remains green.

## Phase 2: IPC and Renderer Work Reduction

Milestone
- Reduce redundant task refresh work during bursty updates while keeping behavior identical.

Planned work
- Coalesce repeated `TASK_DATA_CHANGED` refreshes into a short debounce window.
- Add instrumentation counters for refresh frequency in dev mode.
- Keep one-source-of-truth behavior in main process.

Risk
- Medium. Requires careful handling to avoid stale UI.

Exit criteria
- No regression in task freshness.
- Reduced refresh call count under synthetic burst updates.

## Phase 3: Structural Simplification and Footprint

Milestone
- Lower maintenance burden and remove obvious dead/duplicated code.

Planned work
- Consolidate repeated optimistic mutation patterns into shared helpers.
- Remove dead code/unused imports and duplicated utility logic.
- Trim dependency usage only when removal is provably safe.

Risk
- Medium. Wide-touch refactors can cause accidental behavior drift.

Exit criteria
- Equal behavior in regression tests.
- Net LOC reduction in touched modules.

## Phase 4: Hardening and Regression Nets

Milestone
- Lock in reliability with broader edge-case test coverage.

Planned work
- Expand currently skipped service tests for task service recursion/undo behaviors.
- Add focused integration tests around task tree operations and event-driven refresh.

Risk
- Low to medium. Mostly test work.

Exit criteria
- Previously skipped critical-path tests are active or replaced with equivalent coverage.

## Risks and Mitigations

- Risk: Optimistic updates differ from main-process truth.
  Mitigation: keep server-authoritative refresh path and add deterministic tests.

- Risk: Race conditions in renderer state updates.
  Mitigation: request sequencing (monotonic request IDs).

- Risk: Refactor bloat from over-engineering.
  Mitigation: only extract helpers when used by multiple flows and proven by tests.

## Milestone Snapshot

- M1 (done): task-flow correctness fixes + tests.
- M2 (done): cross-window task refresh coalescing shipped with dev diagnostics for notifications vs refreshes.
- M3 (in progress): task-store duplication reduced further; navigation logic extracted to tested helper with missing-target guard; removed unused direct dependencies (`@radix-ui/react-tooltip`, `radix-ui` umbrella package); selection-state consistency hardened for refresh and failed delete rollback; task-service undo grouping now restores `completeChildren` operations atomically; task-row confirm triggers are now one-shot to prevent stale popover reopen; chat streaming hardened against cross-thread proactive completion leakage, cancel-path stale payload retention, late assistant-done placeholder races, stream-error stale assistant-mapping retention, and post-token reasoning phase regressions; deferred heavy renderer modules (`BlockEditor`, `NotesView`, `SettingsView`, `SearchModal`) behind safe lazy boundaries; shifted non-default typography families to on-demand loading (main CSS `158.71 kB` -> `80.75 kB`); deferred chat panel UI (`ChatView`, `ThreadListView`, `ChatInput`) with direct-store imports to keep chunk ordering safe (main JS `1,892.35 kB` -> `1,855.37 kB`); deferred primary task views (`TodayView`, `TasksView`, `InboxView`) so renderer startup is split by active view instead of eager-loading all task views; replaced chat->notes dynamic store import with a shared note-draft bridge so the renderer build warning is removed while preserving active-draft image attachment behavior; trimmed legacy `woff` fallback emission for `@fontsource` assets in Electron builds (`woff2`-only output); isolated editor vendor/runtime dependencies into deterministic on-demand chunks and kept slash-menu customization behind `BlockEditor`, reducing startup app chunk weight further; further partitioned BlockNote package runtime into `editor-bn-core`/`editor-bn-react`/`editor-bn-mantine` chunks for better cache boundaries; cleaned up stale focus scheduling in AppShell/TaskList/SearchModal by cancelling queued frame callbacks on teardown; added dev-only editor open-latency probes (`note-editor-open`, `task-editor-open`) to guide next hotspot cuts with measured interaction data; switched JSON editor initialization to `useCreateBlockNote({ initialContent })` (removing post-mount full replace for JSON path) with tested content-resolution helper; moved dev-latency probe runtime behind dev-only dynamic import so production bundle stays instrumentation-free; continue with deeper asset/font payload pruning and editor-core hotspot reduction.
- M4 (done): ABI-robust test workflow added (`test:full`), default `npm test` now enforces sqlite-native alignment, and previously skipped critical suites are validated.
