# Scratchpad, Search, and Settings (Task 10) Execution Plan

## Preconditions
- Task dependencies (`6`, `7`, `8`) remain complete in Taskmaster.
- Current baseline commands are healthy in the `flusk/` workspace:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test -- --run`
- Existing memory settings surface (`SettingsMemory`) is treated as migration input, not a parallel settings destination.
- Existing typed IPC + preload contracts remain the only renderer bridge.
- OpenRouter key remains environment-managed at start of this plan (`OPENROUTER_API_KEY`) unless/until Phase B key-settings task is accepted.

## Task List
1. Stabilize Taskmaster and planning metadata for Task 10 phased execution
2. Implement Phase A scratchpad panel with autosave and chat handoff
3. Implement Phase A search with SQLite FTS5, triggers, IPC, and modal UX
4. Implement Phase A unified settings shell by integrating existing memory panel and current app/AI/chat controls, with explicit DB/local/env persistence boundaries
5. Add Phase A automated tests and execute manual QA acceptance matrix
6. Implement Phase B backup system (daily snapshots, keep-30 retention, export/import, optional encryption)
7. Implement Phase B shortcut refactor in main process (settings-backed accelerator resolution with safe defaults)
8. Implement Phase B shortcut settings UI + persistence hooks, then run Phase B hardening and final regression verification

## Verification Per Task
- Task 1:
  - Task 10 status and notes reflect two-phase strategy and explicit Phase A/Phase B boundaries.
  - `docs/plans/current-run.md` points to this design/execution pair.
- Task 2:
  - `Cmd+N` opens/closes scratchpad panel.
  - Scratchpad content persists across close/reopen and relaunch.
  - "Send to AI" routes content through `chat.send` and surfaces parse action cards in chat stream.
- Task 3:
  - FTS5 artifacts are created/migrated and synchronized on task create/update/delete.
  - `Cmd+F` opens search modal, query is debounced, results return grouped active-first then done.
  - Selecting a result navigates focus to the target task without crashing current view state.
- Task 4:
  - Settings opens as a tabbed shell with Memory integrated as one tab.
  - General/AI/Chat tabs bind to existing launch-at-login, model, autonomy, and retention APIs with persistence.
  - Persistence boundary is explicit and implemented as planned:
    - DB-backed: launch-at-login, model, autonomy, retention, memory.
    - Local-only: theme override.
    - Env-only: OpenRouter API key.
  - Escape layering works across chat/view/overlay states without regressions.
- Task 5:
  - New/updated unit tests pass for scratchpad/search/settings IPC contracts and overlay logic.
  - Manual QA matrix passes for Phase A critical paths twice consecutively.
- Task 6:
  - Daily backup scheduling runs and retains only 30 newest snapshots.
  - Export/import succeeds for plain and encrypted backups; restore creates safety backup first.
- Task 7:
  - Main shortcut registration no longer depends on hardcoded constants only; settings-backed values resolve with safe fallbacks.
  - Invalid accelerators are rejected or fall back without unregistering all working shortcuts.
- Task 8:
  - Shortcut settings UI persists selected accelerators and triggers runtime re-registration path.
  - Full regression command set passes (`lint`, `typecheck`, `test`).
  - Task 10 notes capture implementation decisions, trade-offs, and residual follow-ups.

## Batch Size
Default: 3 tasks per batch

Recommended batches:
- Batch A (Phase A core): Tasks 1-3
- Batch B (Phase A completion): Tasks 4-5
- Batch C (Phase B): Tasks 6-8

## Blockers and Escalation
- FTS5 not available or migration issues on user runtime DB:
  - Escalate with fallback mode (disabled search UI state + explicit error) and add repair/rebuild path.
- Overlay/shortcut conflicts introduce regression in existing chat escape behavior:
  - Escalate immediately; do not ship until layered dismiss behavior is restored.
- Backup encryption implementation risk or cross-platform file dialog inconsistencies:
  - Escalate by shipping plain export/import first under Phase B with encryption behind a guarded follow-up checkpoint.
- Shortcut remap safety risk (invalid accelerator can break summon path):
  - Escalate by enforcing immutable fallback accelerators for summon/quick-add until successful re-registration is confirmed.
- Task scope drift beyond 2-day Phase A target:
  - Escalate with explicit deferral list; preserve Phase A acceptance criteria as release gate.

## Completion Criteria
- Phase A acceptance matrix is fully passing and production-usable.
- Phase B backup + shortcut commitments are implemented or explicitly deferred with documented rationale and follow-up task linkage.
- Settings persistence boundaries (DB/local/env) are documented and reflected in implementation outcomes.
- No regressions in assistant identity/memory/chat core behavior and no violations of process boundary guardrails.
- Task 10 can be moved to `done` only after verification evidence is captured in task notes and plan artifacts.
