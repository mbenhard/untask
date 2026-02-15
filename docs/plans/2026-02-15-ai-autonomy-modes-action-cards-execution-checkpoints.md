# AI Autonomy Modes and Action Cards — Execution Checkpoints

## Batch 1: Policy + Contracts (Tasks 1-3) — COMPLETE

### Task 1: autonomy.ts
- Created `flusk/src/main/ai/autonomy.ts` with full risk classification, mode policy, gate evaluation, and pending queue persistence.
- Types: `AutonomyMode`, `RiskLevel`, `ActionLifecycle`, `PendingAction`, `ResolvedAction`, `GateDecision`.
- Classification: `create_task`/`set_today`/`update_task` = low, `move_task`/`complete_task` = medium, bulk >5 = high, `delete_task`/invoice/completed-rewrite = critical.
- Hard overrides: `delete_task`, invoice paid/overdue, completed-task rewrite, bulk >5.
- Mode policy: manual (all pending), safe (low auto), autopilot (low+medium auto).
- Queue: Zod-validated settings-based persistence with safe fallback.

### Task 2: Settings support
- Implemented within autonomy.ts. `getAutonomyMode()` defaults to `safe`, validates stored value against set of valid modes.

### Task 3: Type contracts + IPC + Preload
- Extended `types/chat.ts` with `AutonomyMode`, `RiskLevel`, `ActionLifecycle`, extended `ChatActionCard` with `actionId`, `riskLevel`, `rationale`, `lifecycle`.
- Added `ChatPendingActionEntry`, `ChatResolvePendingActionPayload`, `ChatResolvePendingActionResult`, `ChatListPendingActionsResult`.
- Added 4 IPC channels: `chat:get-autonomy-mode`, `chat:set-autonomy-mode`, `chat:resolve-pending-action`, `chat:list-pending-actions`.
- Updated `preload.d.ts` and `preload/index.ts` with typed APIs.
- Registered all 4 IPC handlers in `ipc.ts`.

**Verification:** `tsc --noEmit` pass, `lint` pass.

---

## Batch 2: Main Execution Path (Tasks 4-6) — COMPLETE

### Task 4: Autonomy gating in tools.ts
- Added `buildRiskHint()` for context-enriched risk classification (fetches task status for update_task, counts parsed titles for parse_notes).
- Added `buildPendingRationale()` for human-readable pending action descriptions.
- Modified `executeToolCall()` to gate mutation tools through autonomy before execution.
- Gated actions create pending entries and emit `confirmation_required` cards with autonomy metadata.
- Updated `createSdkTools()` to route through `executeToolCall` so AI model calls go through autonomy.
- Added `autonomyBypass` and `skipInternalConfirmation` to `ToolExecutionContext`.
- Modified `delete_task` to actually execute deletion when `skipInternalConfirmation` is set.
- Modified `update_task` and `parse_notes` to skip internal confirmation checks when bypassed.

### Task 5: IPC resolve endpoints
- Approve: removes from queue, executes with `autonomyBypass: true`, restores on failure.
- Reject: removes from queue, returns without mutation.
- List: returns full pending queue.
- Edge cases: missing action returns not-found, execution failure restores pending action.

### Task 6: Queue persistence
- `ai_autonomy_pending_actions` settings key stores JSON array.
- Zod schema validation on load with empty-array fallback.
- Survives restart via settings persistence.

**Verification:** `tsc --noEmit` pass, `lint` pass.

---

## Batch 3: Renderer UX + Controls (Tasks 7-10) — COMPLETE

### Task 7: Chat store extensions
- Added `autonomyMode` and `pendingActions` state.
- `initialize()` loads autonomy mode and pending actions in parallel.
- `approvePendingAction()` / `rejectPendingAction()` call IPC and update card lifecycle.
- `updateCardLifecycle()` patches cards across all messages by actionId.
- `undoAction()` now updates matching card lifecycle to `undone`.
- Added `setAutonomyMode()`, `refreshPendingActions()`.

### Task 8: ActionCard UI
- Lifecycle-aware badge with distinct colors per state.
- Risk level indicator shown next to badge.
- Rationale text displayed below detail.
- Pending: Approve/Reject buttons.
- Executed: Undo button (only when undoable).
- Resolved: read-only state.

### Task 9: ConfirmationDialog
- Inline in ChatView.tsx (small component, ~30 lines).
- Modal overlay for high/critical approvals.
- Shows risk level, rationale, "Confirm & Execute" button.
- Low/medium approvals skip modal.

### Task 10: Cmd+Z shortcut
- `Cmd+Z`/`Ctrl+Z` in chat mode calls `undoAction()` with no taskEventId (global undo).
- Only fires when not in a text input element.

**Verification:** `tsc --noEmit` pass, `lint` pass (0 errors, 0 warnings).

---

## Batch 4: Validation + Closeout (Tasks 11-12) — COMPLETE

### Task 11: Validation
- `npx tsc --noEmit` — clean pass
- `npm run lint` — clean pass (0 errors, 0 warnings)
- Code review against all 16 acceptance criteria — all pass
- Fixed: approval failure now restores pending action to queue for retry

### Task 12: Closeout
- Execution checkpoints documented.
- All files accounted for (10 files, +693/-75 lines).

## Implementation Decisions

1. **Tool-first gating**: Autonomy gate runs in `executeToolCall` before tool `execute()`. This keeps policy centralized and avoids scattering checks across individual tools.
2. **Dual confirmation paths**: Internal tool confirmation checks (`delete_task`, invoice, completed-rewrite) are preserved but bypassed via `skipInternalConfirmation` when autonomy has already handled gating. This maintains backward compatibility if autonomy is ever disabled.
3. **ConfirmationDialog inlined**: Kept in ChatView.tsx rather than separate file for simplicity. Component is ~30 lines. Can be extracted later for testability.
4. **Non-mutation tools skip gating**: `suggest_daily_plan`, `read_journal`, `generate_live_thought`, `improve_task`, `undo_last_action` are explicitly excluded from autonomy gating via `READ_ONLY_TOOLS` set.
5. **Approval failure recovery**: When tool execution fails after approval, the pending action is restored to the queue with the same metadata, allowing retry.
