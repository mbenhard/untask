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

## 19. Atomic undo for `completeChildren` task completion

What changed
- Added grouped user-undo support for recursive completion events in `src/main/services/taskService.ts`.
- Reused grouped-undo plumbing so grouped child events now restore for both:
  - cascade deletes, and
  - `completeChildren` completion operations.
- Added regression coverage in `src/main/services/taskService.test.ts` for parent+children complete/undo flow.

Why
- Recursive complete operations logged separate child completion events without grouping, so undo could restore only the parent completion.

Impact
- Correctness: undo now restores parent and completed children together for `completeChildren`.
- Polish: eliminates partial-restoration edge cases in subtask completion flow.
- Maintainability: recursive undo grouping behavior is centralized.

## 20. One-shot task confirmation triggers

What changed
- Extended `TaskItem` trigger props with consumption callbacks:
  - `onCompleteConfirmTriggerHandled`
  - `onDeleteConfirmTriggerHandled`
- Updated `TaskItem` effects to acknowledge trigger consumption once handled.
- Updated `TaskList` to clear matching trigger state immediately after child consumption.

Why
- Confirmation trigger state previously persisted after popover open, so later row remounts could replay stale confirmations.

Impact
- Correctness/polish: removes spurious delete/complete confirmation popovers during later navigation/reorder interactions.
- Maintainability: trigger lifecycle is now explicit and one-shot.

## 21. Chat stream-phase guard after token start

What changed
- Updated reasoning-event handler in `src/renderer/stores/chat/chatStreamSlice.ts` to keep `streamPhase` unset once text output exists for the stream.
- Added regression in `src/renderer/stores/chatStore.test.ts` for token-then-reasoning sequence.
- Added targeted keyboard regression coverage in `src/renderer/hooks/useTaskListKeyboard.test.ts` for:
  - `Option+Arrow` reorder routing,
  - `Cmd+Backspace` delete routing.

Why
- Reasoning events could arrive after token output started and incorrectly flip stream indicator back to "Thinking".

Impact
- Correctness/polish: streaming indicator now matches user-visible stream stage more reliably.
- Reliability: shortcut routing expectations are now regression-tested.

## 22. Lean smoke-gate workflow added

What changed
- Added `npm run test:smoke` script in `package.json` to run a high-signal subset:
  - `taskService` recursion/undo,
  - `taskStore` optimistic/race regressions,
  - `chatStore` stream-state regressions,
  - `useTaskListKeyboard` shortcut routing regressions.
- Added `docs/manual-smoke-checklist.md` with a 10-flow, ~15-minute manual gate.
- Added `docs/flow-coverage-matrix.md` to map each critical flow to automated/manual coverage.

Why
- Needed a practical discovery loop that improves stability without heavyweight process overhead.

Impact
- Correctness confidence: quick automated + manual gate for must-not-break flows.
- Team velocity: easier pre-merge/pre-release validation pass.

## 23. Default test gate hardening + lint baseline recovery

What changed
- Updated `npm test` in `package.json` to run `ensure:sqlite-native` before `vitest run`.
- Fixed repository lint-blocking errors in:
  - `src/main/ai/systemPrompt.ts`
  - `src/main/services/updateChecker.ts`
  - `src/renderer/components/onboarding/OnboardingIdentity.tsx`
  - `src/renderer/components/settings/ModelCatalogView.tsx`
  - `src/renderer/components/ui/tooltip.tsx`
- Expanded flow-tracking docs to explicitly include:
  - Notes -> AI handoff coverage (`notesStore`),
  - Quick-add summon/create/navigate cross-window flow (manual-critical).

Why
- The default developer command should not permit silent native-suite skips.
- Lint errors block quality gates and weaken CI confidence.
- Two critical flows from the refactor plan were underrepresented in coverage docs.

Impact
- Reliability: `npm test` now self-heals native ABI drift before running suites.
- Maintainability: lint gate is operational again (warnings remain as separate debt).
- Process quality: coverage matrix and manual checklist now represent all critical flows declared in the roadmap.

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
- `npm run ensure:sqlite-native` passed (rebuilt and loaded `better-sqlite3` for current Node ABI).
- `npm run test -- src/main/services/taskService.test.ts src/renderer/stores/chatStore.test.ts src/renderer/hooks/useTaskListKeyboard.test.ts` passed (`3/3` files, `34/34` tests).
- `npm run typecheck` passed.
- `npm run test:smoke` passed.

## 24. Renderer startup payload deferral (safe code-splitting)

What changed
- Deferred heavy BlockNote editor runtime behind lazy boundaries in:
  - `src/renderer/components/tasks/TaskBody.tsx`
  - `src/renderer/components/notes/NoteEditor.tsx`
- Deferred non-primary views in `AppShell`:
  - `NotesView`
  - `SettingsView`
  - `SearchModal`
- Kept chat modules eager after validating that lazy chunking for `ChatView` introduced a risky circular cross-chunk warning.

Why
- BlockNote and secondary views are not required for first paint in the default app flow.
- Deferring these modules reduces upfront parse/eval work without changing feature behavior.
- Chat lazy-split was intentionally rolled back to avoid potential execution-order regressions in production bundles.

Impact
- Performance: lower initial renderer work, with heavy editor/view code loaded on demand.
- Maintainability: explicit lazy boundaries for heavyweight modules.
- Safety: no UI/feature change and no new failing checks.

## 25. Footprint reality check and prioritization update

What changed
- Ran dependency and import-usage audit across app/runtime modules.
- Confirmed no obvious unused runtime dependencies remained after prior cleanup.
- Captured current renderer build output to identify actual remaining payload drivers.

Why
- Recent LOC growth was primarily reliability-oriented (tests/guards/docs), so footprint work needed direct measurement.

Impact
- Clear next focus: asset/font payload and large renderer chunks, not generic dependency deletion.
- Prevents unsafe "delete by intuition" changes.

## 26. On-demand typography assets (startup payload reduction)

What changed
- Reduced eager renderer font imports in:
  - `src/renderer/main.tsx` (kept default `Geist` + `Geist Mono` only)
  - `src/renderer/quick-add.tsx` (kept default `Geist` weights only)
- Added on-demand font family loading in `src/renderer/components/providers/TypographyProvider.tsx`:
  - Loads non-default sans/mono families only when selected.
  - Caches loaded families to avoid repeated imports.
  - Skips font-loader side effects in test mode.
- Preserved typography options/feature set; non-default families still work when selected.

Why
- Fonts dominated initial renderer CSS and startup parse/eval cost.
- Most sessions use default typography and should not pay up-front cost for every optional family.

Impact
- Performance: significantly reduced initial renderer CSS payload.
- Footprint behavior: optional font-family CSS now lives in demand-loaded chunks instead of main startup path.
- Maintainability: typography loading behavior is centralized in provider logic.
- Measured renderer build delta (`vite.renderer.config.ts`):
  - main CSS chunk: `158.71 kB` -> `80.75 kB` (gzip `48.41 kB` -> `13.47 kB`)
  - main JS chunk remained effectively flat (`1,890.45 kB` -> `1,892.35 kB`) due small loader logic.

## 27. Lazy chat panel runtime with safe chunk boundaries

What changed
- Deferred chat panel UI modules in `src/renderer/components/layout/AppShell.tsx`:
  - `ChatView`
  - `ThreadListView`
  - `ChatInput`
- Switched chat selector/store imports in:
  - `src/renderer/components/chat/ChatView.tsx`
  - `src/renderer/components/layout/ChatInput.tsx`
  from re-export path (`../../stores/chatStore`) to direct source path (`../../stores/chat`) to avoid re-export cross-chunk ordering risk.

Why
- Chat panel UI is not needed at first paint in most sessions.
- Previous lazy attempt was reverted due rollup cross-chunk warning tied to re-export boundaries; direct imports remove that risk.

Impact
- Performance: reduced initial renderer JS payload by moving chat panel code to on-demand chunks.
- Safety: production build no longer emits the prior chat re-export cross-chunk warning.
- Measured renderer build delta (`vite.renderer.config.ts`):
  - main JS chunk: `1,892.35 kB` -> `1,855.37 kB` (gzip `583.15 kB` -> `571.94 kB`)
  - chat UI now in dedicated demand-loaded chunks:
    - `ChatView` (`27.82 kB`)
    - `ThreadListView` (`4.76 kB`)
    - `ChatInput` (`4.93 kB`)

## 28. Core task view deferral (today/tasks/inbox)

What changed
- Deferred core task views behind lazy boundaries in `src/renderer/components/layout/AppShell.tsx`:
  - `TodayView`
  - `TasksView`
  - `InboxView`
- Kept existing behavior and view routing unchanged; only module load timing changed.

Why
- Before this change, all three primary task views were eagerly bundled in renderer startup path.
- In normal usage, users only need one active view at a time, so remaining views should load on demand.

Impact
- Performance: renderer startup payload is now split by view instead of eagerly including all task views.
- Measured bundle shape change (`vite.renderer.config.ts`):
  - previous single primary app chunk: `index` `1,855.37 kB` (gzip `571.94 kB`)
  - after split:
    - `index` `456.89 kB` (gzip `141.50 kB`)
    - shared `index` runtime chunk `107.29 kB` (gzip `32.75 kB`)
    - view/task chunks loaded on demand (`TodayView`, `TasksView`, `InboxView`, `TaskList`, `sortable.esm`)
- Safety: lint/typecheck/tests remained green.

## 29. Cross-store decoupling for note draft access (warning cleanup)

What changed
- Added `src/renderer/stores/notesDraftBridge.ts` as a tiny shared bridge for active note draft access.
- Wired `src/renderer/stores/notesStore.ts` to publish active note draft state (`activeNoteId` + `content`) through a store subscription.
- Updated `src/renderer/stores/chat/chatMessageSlice.ts` to read note draft content from the bridge instead of dynamically importing `notesStore`.
- Added focused unit coverage in `src/renderer/stores/notesDraftBridge.test.ts`.

Why
- Renderer build emitted a persistent warning because `notesStore` was both dynamically and statically imported.
- A direct static chat->notes store import risks tighter coupling and import-cycle fragility.
- The bridge keeps behavior (active unsaved note draft image extraction) while removing bundler ambiguity.

Impact
- Build polish: removed the `notesStore` dynamic+static import warning from `vite.renderer.config.ts` build output.
- Maintainability: cleaner boundary between chat message pipeline and notes store internals.
- Correctness: note-image extraction still uses in-memory active draft content when available.

## 30. Font asset footprint trim for Electron target (`woff2`-only)

What changed
- Added `vite.stripWoffFallbackPlugin.ts` to remove legacy `.woff` fallback entries from `@fontsource` CSS at build time.
- Enabled the plugin in:
  - `vite.renderer.config.ts`
  - `vite.quickadd-renderer.config.ts`
- Updated `tsconfig.renderer.json` includes so renderer typecheck covers both updated Vite config files and the plugin file.

Why
- Untask targets modern Electron Chromium on macOS, where `woff2` is fully supported.
- Shipping both `.woff2` and `.woff` doubles font asset variants with no runtime benefit in the supported target environment.

Impact
- Footprint: renderer build now emits `woff2` assets only (`woff_count=0`, `woff2_count=105` in current renderer build output).
- Build/output polish: removed duplicate legacy font files from packaged assets while preserving runtime typography behavior on target platform.
- Measured build-side deltas:
  - renderer main CSS `80.77 kB` -> `79.73 kB` (gzip `13.48 kB` -> `13.29 kB`)
  - quick-add CSS `78.50 kB` -> `77.90 kB` (gzip `13.29 kB` -> `13.17 kB`)

## 31. Editor runtime chunk isolation (manual chunk strategy + slash-menu decoupling)

What changed
- Moved slash-menu default item sourcing fully behind `BlockEditor` so parent modules (`TaskBody`, `NoteEditor`) no longer import runtime utilities from `@blocknote/react`.
  - Updated `BlockEditor` API to accept `{ editor, defaultItems }` in `getSlashMenuItems`.
  - Updated task/note slash customizations to consume provided defaults instead of calling BlockNote runtime helpers directly.
- Added deterministic editor vendor chunking in `vite.renderer.config.ts` via `build.rollupOptions.output.manualChunks` for:
  - `@blocknote/*`
  - `@tiptap/*`
  - `prosemirror-*`
  - `@floating-ui/*`
  - `emoji-mart` / `@emoji-mart/*`

Why
- The editor remained the largest remaining runtime hotspot.
- Without explicit chunk boundaries, editor dependencies can drift into broader app chunks, increasing startup parse/eval cost even when editor UI is not active.

Impact
- Performance: renderer startup JS path is materially smaller while editor-heavy runtime remains on-demand.
- Maintainability: editor slash-menu customization no longer depends on parent-level `@blocknote/react` runtime imports.
- Measured renderer bundle-shape deltas (`vite.renderer.config.ts`):
  - app `index` chunk: `456.36 kB` -> `261.70 kB` (gzip `141.35 kB` -> `80.79 kB`)
  - `TaskList` chunk: `163.51 kB` -> `152.33 kB` (gzip `47.78 kB` -> `43.86 kB`)
  - editor runtime now isolated into dedicated demand-loaded chunks (`editor-blocknote`, `editor-tiptap`, `editor-prosemirror`, `editor-floating`, `editor-emoji`).

## 32. BlockNote vendor sub-chunk partitioning

What changed
- Refined renderer manual chunking rules in `vite.renderer.config.ts` to split `@blocknote` runtime into separate package-level chunks:
  - `editor-bn-core`
  - `editor-bn-react`
  - `editor-bn-mantine`
  - fallback `editor-bn-vendor`
- Kept existing editor chunk families (`editor-tiptap`, `editor-prosemirror`, `editor-floating`, `editor-emoji`) unchanged.

Why
- The previous `editor-blocknote` bundle remained very large as a single cache unit.
- Splitting by package boundaries improves cache reuse and avoids one giant editor vendor artifact.

Impact
- Build/output structure: BlockNote runtime is now segmented across dedicated package chunks instead of a single mega-chunk.
- Startup path remains unchanged (editor still demand-loaded), with similar startup app chunk weight.
- Measured renderer output (`vite.renderer.config.ts`):
  - `index` chunk remains stable (`261.70 kB` -> `261.90 kB`, gzip `80.79 kB` -> `80.84 kB`)
  - BlockNote package chunks now emitted separately:
    - `editor-bn-core` `665.88 kB` (gzip `203.71 kB`)
    - `editor-bn-react` `281.66 kB` (gzip `83.53 kB`)
    - `editor-bn-mantine` `156.84 kB` (gzip `45.84 kB`)
- Remaining warning hotspot is now explicit (`editor-bn-core` > `500 kB`), clarifying the next optimization lane.

## 33. Focus-scheduling cleanup for interaction stability

What changed
- Added cleanup for view-change focus scheduling in `src/renderer/components/layout/AppShell.tsx` by cancelling pending `requestAnimationFrame` on effect teardown.
- Hardened `TaskList` selection-navigation effect in `src/renderer/components/tasks/TaskList.tsx`:
  - tracked frame IDs for navigation pulse and focus/scroll scheduling,
  - cancelled pending frames on teardown to avoid stale callbacks.
- Added `requestAnimationFrame` teardown in `src/renderer/components/search/SearchModal.tsx` when opening-focus effect is interrupted.

Why
- These flows scheduled asynchronous focus actions without teardown.
- During rapid view/task/search transitions, stale callbacks could fire after state changes or unmount, causing focus jumps and avoidable extra work.

Impact
- Correctness/polish: reduces stale focus-steal behavior under rapid interaction changes.
- Performance: avoids executing unnecessary queued frame callbacks when effects are superseded.
- Safety: no feature/UI changes; behavior is only stabilized under race-like interaction timing.

## 34. Dev-only editor interaction latency probes

What changed
- Added `src/renderer/lib/devLatencyMetrics.ts`, a small dev-only latency tracker with:
  - keyed `start` / `end` / `cancel` measurement API,
  - aggregate stats logging every N samples,
  - production-safe no-op behavior outside dev mode.
- Added unit coverage in `src/renderer/lib/devLatencyMetrics.test.ts`.
- Wired probes into editor-open flows:
  - `src/renderer/components/notes/NoteEditor.tsx` (`note-editor-open`: note active -> first change),
  - `src/renderer/components/tasks/TaskBody.tsx` (`task-editor-open`: expanded -> first change).

Why
- We have already reduced startup/editor payload significantly, but lacked direct interaction timing signal to validate user-perceived responsiveness under real usage.
- A lightweight dev-only probe enables evidence-based optimization without shipping telemetry or changing UX.

Impact
- Performance visibility: local dev now reports aggregate editor open-latency timing for note/task flows.
- Maintainability: instrumentation is centralized and testable instead of ad hoc console timing in components.
- Safety: no UI/feature change; no production logging overhead (`import.meta.env.DEV` gated).

## 35. BlockEditor JSON initialization path simplified (remove post-mount replace pass)

What changed
- Added `resolveInitialEditorContent()` in `src/renderer/components/editor/editorUtils.ts` to normalize persisted editor content into:
  - `initialBlocks` for BlockNote JSON, or
  - `legacyMarkdown` fallback for old markdown content.
- Updated `src/renderer/components/editor/BlockEditor.tsx` to pass parsed JSON blocks through `useCreateBlockNote({ initialContent })` at creation time.
- Kept legacy markdown migration behavior (markdown -> blocks -> persisted JSON) but scoped it to markdown-only input.
- Added focused unit coverage in `src/renderer/components/editor/editorUtils.test.ts`.

Why
- JSON-backed notes/tasks were initialized by creating an empty editor and then replacing all blocks in a post-mount effect.
- That extra replacement/hydration pass added unnecessary work on editor open for the dominant JSON content path.

Impact
- Performance: removes one full replace-on-mount step for JSON editor content.
- Maintainability: content initialization policy is now explicit and test-covered in one helper.
- Safety: no UI/feature change; legacy markdown migration path remains intact.

## 36. Dev-latency probe runtime removed from production bundle

What changed
- Updated probe wiring in:
  - `src/renderer/components/notes/NoteEditor.tsx`
  - `src/renderer/components/tasks/TaskBody.tsx`
- Replaced static runtime imports of `devLatencyMetrics` with dev-only dynamic imports (`if (import.meta.env.DEV) { import(...) }`) and no-op fallbacks.

Why
- The previous probe integration was dev-gated logically but still pulled a small metrics runtime chunk into production output.
- We want development observability with effectively zero production footprint.

Impact
- Footprint: production renderer build no longer emits a `devLatencyMetrics` chunk.
- Performance: no production parse/eval overhead for instrumentation runtime.
- Safety: dev behavior is unchanged; production behavior remains no-op for probe calls.
