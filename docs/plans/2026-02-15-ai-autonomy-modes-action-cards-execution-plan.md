# AI Autonomy Modes and Action Cards (Task 11) Execution Plan

## Preconditions

- Task 7 and Task 8 are complete and stable in current branch.
- Existing tool orchestration is functional (`flusk/src/main/ai/tools.ts`, `flusk/src/main/ai/chat.ts`).
- Existing undo plumbing through `task_events` is operational.
- Existing action cards are already rendered in `ChatView` and persisted in chat metadata.

## Task List

1. Create `flusk/src/main/ai/autonomy.ts` with risk classification, hard override rules, mode policy, and pending queue persistence helpers.
2. Add autonomy mode setting support (`ai_autonomy_mode`) with default `safe` and typed getters/setters.
3. Extend shared chat types for risk/lifecycle/pending action payloads and update IPC/preload contracts.
4. Integrate autonomy gating into mutation tools in `flusk/src/main/ai/tools.ts` using tool-first policy checks.
5. Add pending action resolve endpoints in main IPC (`approve`/`reject`) and list endpoint for queue hydration.
6. Persist and restore pending action queue across restart via settings key `ai_autonomy_pending_actions`.
7. Extend renderer chat store to load pending actions, resolve approvals/rejections, and synchronize card lifecycle state.
8. Update `ActionCard` UI with rationale, lifecycle badge, pending `Approve/Reject`, and executed `Undo` behavior.
9. Build `ConfirmationDialog` for high/critical approval path only and wire from action card approve flow.
10. Add global `Cmd+Z` in renderer keyboard hook to call global chat undo (no taskEventId).
11. Validate end-to-end behavior and run lint/typecheck + manual acceptance checks.
12. Update Task 11 notes/status in Taskmaster after acceptance checks pass.

## Verification Per Task

- Task 1:
  - Classification returns expected risk for all relevant tools/payloads.
  - Hard override flags destructive/financial/history-rewrite operations.
- Task 2:
  - Missing setting resolves to `safe`.
  - Invalid stored mode falls back safely.
- Task 3:
  - Build passes with updated type contracts across main/preload/renderer.
- Task 4:
  - Gated actions return pending action cards instead of writing.
  - Allowed actions execute with unchanged task-event logging behavior.
- Task 5:
  - Approve executes exactly once.
  - Reject never mutates tasks.
- Task 6:
  - Pending queue survives app restart.
- Task 7:
  - Chat store reflects lifecycle transitions (`pending -> executed/rejected`, `executed -> undone`).
- Task 8:
  - Pending cards show action, rationale, and state.
  - Undo only visible for executed undoable actions.
- Task 9:
  - High/critical approvals require modal confirmation.
  - Low/medium pending approvals skip modal.
- Task 10:
  - `Cmd+Z` undoes most recent executed AI action globally.
- Task 11:
  - `npm run lint` passes.
  - `npx tsc --noEmit` passes.
  - Manual Task 11 acceptance criteria pass.
- Task 12:
  - Taskmaster notes include implementation and behavior decisions.

## Batch Size

Default: 3 tasks per batch

Planned batches for this run:

- Batch 1 (Policy + Contracts): Tasks 1-3
- Batch 2 (Main Execution Path): Tasks 4-6
- Batch 3 (Renderer UX + Controls): Tasks 7-10
- Batch 4 (Validation + Closeout): Tasks 11-12

## Blockers and Escalation

- Blocker: existing tool execution shape makes gating/refactor invasive.
  - Escalation: isolate autonomy wrapper and keep tool business logic unchanged behind adapter.
- Blocker: pending queue/card lifecycle mismatch after restart.
  - Escalation: treat pending queue as source of truth and patch cards from queue on hydrate.
- Blocker: confirmation UX complexity causes scope slip.
  - Escalation: ship modal only for high/critical (already selected) and keep inline flow minimal.

## Completion Criteria

- Autonomy mode policy exists and is enforced in main process for all AI mutations.
- Hard override confirmations are enforced in every mode.
- Pending approvals persist across restarts and are user-resolvable.
- Action cards expose lifecycle (`pending`, `executed`, `rejected`, `undone`) with rationale.
- High/critical approvals require modal confirmation.
- Global `Cmd+Z` undoes last executed AI mutation and updates card state.
- Lint/typecheck/manual acceptance checks pass.
