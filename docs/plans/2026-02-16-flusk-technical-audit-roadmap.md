# Flusk Technical Audit and Refactoring Roadmap

## Source
Provided by user on 2026-02-16 and approved for implementation.

## Summary
Baseline audit of `/Users/marcusbenhard/Development/untitled/flusk` identified concentrated architectural risk in safety gating, task hierarchy integrity, and orchestration-module complexity.

Measured baseline:
1. Typecheck: pass.
2. Tests: pass (`22` files, `143` tests).
3. Lint: fail (`3` unresolved-import errors in BlockNote imports).
4. Duplication scan (`jscpd`): low overall duplication (`0.25%`), with local DRY hotspots.
5. Dependency graph (`madge`): `1` circular dependency in task components.
6. Size hotspots: `/Users/marcusbenhard/Development/untitled/flusk/src/main/ai/tools.ts`, `/Users/marcusbenhard/Development/untitled/flusk/src/main/ai/chat.ts`, `/Users/marcusbenhard/Development/untitled/flusk/src/main/ipc.ts`, `/Users/marcusbenhard/Development/untitled/flusk/src/renderer/components/settings/SettingsMemory.tsx`.

## Findings (Ordered by Severity)
1. [P0] Enforce hard confirmations in all autonomy modes.
2. [P1] Eliminate parent/subtask integrity holes.
3. [P1] Make memory writes auditable and reversible.
4. [P1] Restore lint health and resolver correctness.
5. [P2] Break UI circular dependency in task rendering.
6. [P2] Decompose orchestration monoliths and handler duplication.
7. [P2] Remove dead/stale code paths.
8. [P2] Push filtering/search work into SQL and stop unconditional FTS rebuilds.
9. [P3] Move backup heavy I/O off critical main-thread path.
10. [P3] Expand tests into service/IPC/data-integrity layers.

## Refactoring Roadmap
### Phase 0
1. Add characterization tests for current autonomy gate, delete/complete parent behavior, and memory writes.
2. Capture query/startup benchmarks for `listTasks`, FTS init, backup operations.
3. Add CI jobs for `npm run lint`, `npm run typecheck`, `npm test`, and circular-dependency check.

### Phase 1
1. Change `evaluateGate` to always return `pending` for `hardOverride`.
2. Remove automatic `skipInternalConfirmation` assignment from gate approval path.
3. Preserve explicit bypass only for post-approval replay (`autonomyBypass` path).
4. Add regression tests for `manual`, `safe`, and `autopilot` hard-risk behavior.

### Phase 2
1. Introduce migration to repair orphan subtasks (`parent_id` not found) by reparenting to `NULL` and logging an event.
2. Add DB-level parent integrity (FK or equivalent invariant checks with migration-safe strategy).
3. Update `deleteTask` to reject deleting parent tasks with active children unless explicit cascade mode is requested.
4. Update `completeTask` to reject completion when active subtasks remain, unless explicit child-resolution flag is provided.
5. Update AI tool contracts (`delete_task`, `complete_task`) to support explicit parent-child handling and confirmation prompts.

### Phase 3
1. Add `memory_events` table with `id`, `layer`, `before`, `after`, `source`, `created_at`.
2. Log all `soul/profile/patterns` writes through a memory service boundary.
3. Add IPC read endpoint for memory history and rollback endpoint for last N changes.
4. Update settings memory UI to surface recent changes and allow rollback actions.

### Phase 4
1. Split `/src/main/ipc.ts` into domain modules.
2. Introduce shared `registerHandle` helper for schema-validated payload parsing, error logging, and return typing.
3. Type the preload surface explicitly (`const fluskApi: FluskApi = { ... }`) and fail compile on drift.
4. Consolidate renderer `flusk()` accessor into one shared helper.

### Phase 5
1. Split `/src/main/ai/tools.ts` by domain with registry assembly in root.
2. Extract chat stream loop state machine from `/src/main/ai/chat.ts`.
3. Cache identity contracts with mtime invalidation.
4. Avoid recomputing unchanged context blocks across retry attempts.

### Phase 6
1. Break circular dependency by rendering `TaskBody` from `TaskList`.
2. Split `/src/renderer/components/settings/SettingsMemory.tsx` into tabs/hooks.
3. Remove dead code (`ProjectsView`, `ProjectGroup`) unless reinstated.
4. Remove unused exports (`prepareChatTurn`, `dispatchToolCall`, `refreshGlobalShortcuts`) or wire usage.

### Phase 7
1. Push `client/search/limit` filtering into SQL in `listTasks`.
2. Stop unconditional FTS rebuild on startup.
3. Move backup encryption/import/export into a background job boundary.
4. Add timeout/cancellation plumbing for long-running backup jobs.

### Phase 8
1. Run migration tests on seeded fixtures.
2. Run full regression across chat/tool flows, undo flows, backup restore, and settings.
3. Release behind staged feature flags for hierarchy enforcement and memory rollback.
4. Monitor telemetry for confirmation rates, mutation errors, backup durations.
