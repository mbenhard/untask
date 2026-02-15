# AI Autonomy Modes and Action Cards (Task 11) Design

## Objective

Implement the Task 11 autonomy system as a durable main-process policy layer that classifies AI mutations by risk, applies mode-specific gating (`manual` / `safe` / `autopilot`), and surfaces every mutation as an actionable card with explicit lifecycle (`pending`, `executed`, `rejected`, `undone`). The design must preserve Flusk's assistant identity and safety posture: confirmations are mandatory for destructive or high-financial changes in all modes, pending approvals persist across restarts, and undo remains globally available through `Cmd+Z` as "undo most recent executed AI action".

This design uses a tool-first gating approach because it is the smallest change that keeps policy enforcement centralized in the main process instead of renderer heuristics.

## Scope

- Add `flusk/src/main/ai/autonomy.ts` as the core risk classification and mode decision engine.
- Add persistent pending action queue storage in settings.
- Gate AI mutation tools through autonomy policy before execution.
- Add mode read/write APIs and pending action approve/reject APIs.
- Extend action card model to include rationale, risk, and lifecycle state.
- Add inline Approve/Reject on pending action cards.
- Add `ConfirmationDialog` only when approving high/critical pending actions.
- Keep global undo behavior and update card state to `undone`.

## Non-Goals

- Rebuilding chat persistence architecture or adding new DB tables for autonomy history.
- Changing non-AI task mutations in task list UI flows.
- Reworking settings page architecture beyond autonomy mode controls.
- Implementing multi-action transaction rollback chains.

## Constraints

- Main process owns policy, queue, and execution decisions.
- Renderer accesses autonomy only through typed preload/IPC APIs.
- IPC remains domain-first (`chat:*`, `settings:*`, `task:*`).
- Zod validation required for mutation and approval payloads.
- Charter confirmation rules are hard overrides and cannot be bypassed by mode.
- Existing `task_events` remain the source of truth for undoable state changes.

## Architecture

### 1. Autonomy Policy Core (`autonomy.ts`)

`autonomy.ts` owns risk classification and execution gating:

- Types:
  - `AutonomyMode = 'manual' | 'safe' | 'autopilot'`
  - `RiskLevel = 'low' | 'medium' | 'high' | 'critical'`
  - `ActionLifecycle = 'pending' | 'executed' | 'rejected' | 'undone'`
- Mode policy:
  - `manual`: auto-execute none
  - `safe` (default): auto-execute `low` only
  - `autopilot`: auto-execute `low` + `medium`
- Hard safety override (always confirm):
  - `delete_task`
  - bulk writes affecting `>5` tasks
  - invoice transitions to `paid` / `overdue`
  - rewriting completed tasks

Classification decisions:

- `low`: `create_task`, non-critical `update_task` field edits, `set_today`, `parse_notes` with `<=5` writes
- `medium`: `move_task`, `complete_task`
- `high`: bulk writes `>5` tasks
- `critical`: `delete_task`, invoice paid/overdue, completed-history rewrite

### 2. Pending Action Queue Persistence

Use settings key `ai_autonomy_pending_actions` as canonical queue storage. Each pending record includes:

- `actionId`, `toolName`, `input`, `riskLevel`, `rationale`
- `requiresHardConfirmation`
- `createdAt`, `requestId?`, `modeAtCreation`
- `lifecycle: 'pending'`

Queue is loaded at startup and survives restarts. Approve/reject mutates this queue and emits updated action card state.

### 3. Tool-First Execution Pipeline

Mutation tools route through autonomy gate before executing writes:

1. Build action metadata (tool, scope, risk hints).
2. Classify risk + evaluate mode.
3. If `auto_execute` and no hard override -> execute tool mutation now.
4. Otherwise persist pending action and return `confirmation_required` envelope with pending card.

Approvals execute the stored tool payload through the same validated tool registry with autonomy bypass flag to avoid re-queuing.

### 4. Renderer Interaction Model

Action cards become lifecycle-aware:

- Pending: inline `Approve` / `Reject` buttons.
- Executed: optional `Undo` if task-event-backed.
- Undone: read-only "Undone" state.
- Rejected: read-only "Rejected" state.

For high/critical pending approvals only, clicking `Approve` opens `ConfirmationDialog` with explicit impact copy and confirm action.

## Components and Interfaces

Main process additions:

- `flusk/src/main/ai/autonomy.ts`

Main process updates:

- `flusk/src/main/ai/tools.ts`
  - risk metadata wiring
  - gate mutation tools through autonomy
- `flusk/src/main/ipc.ts`
  - add mode and pending-action handlers
- `flusk/src/main/services/settingsService.ts`
  - helper wrappers for autonomy keys (or local helpers in `autonomy.ts`)

Renderer updates:

- `flusk/src/renderer/components/chat/ChatView.tsx`
  - pending action buttons
  - lifecycle badges
- `flusk/src/renderer/components/chat/ConfirmationDialog.tsx`
- `flusk/src/renderer/stores/chatStore.ts`
  - load pending queue on init
  - approve/reject actions
  - patch card lifecycle state after resolve/undo
- `flusk/src/renderer/hooks/useKeyboardShortcuts.ts`
  - map `Cmd+Z` to global chat undo API

Type updates:

- `flusk/src/types/chat.ts`
  - autonomy mode/risk/lifecycle types
  - pending action payloads
  - card extensions (`actionId`, `riskLevel`, `rationale`, `lifecycle`)
- `flusk/src/types/ipc.ts`
  - new `chat:*` autonomy channels and payload aliases
- `flusk/src/types/preload.d.ts`
  - typed preload methods for mode + pending action resolve/list
- `flusk/src/preload/index.ts`
  - expose new chat APIs

## Data Flow

### A. AI Mutation Request

1. Model emits tool call.
2. Tool registry validates input (zod).
3. Autonomy classifies risk and checks mode + hard overrides.
4. If gated, action is stored in pending queue and pending card is emitted.
5. If allowed, mutation executes and emits executed card with task event metadata.

### B. Approve/Reject Pending Action

1. User clicks `Approve` or `Reject` on pending card.
2. Renderer calls `chat:resolve-pending-action`.
3. Main process either:
   - executes queued action and marks card `executed`, or
   - marks action `rejected` without mutation.
4. Updated lifecycle returns to renderer and chat/task stores refresh as needed.

### C. Undo

1. User clicks `Undo` or presses `Cmd+Z`.
2. Main process resolves latest executed AI event globally.
3. `task_events` undo is applied.
4. Matching action card lifecycle updates to `undone`.

## Error Handling

- Invalid mode/action payload: reject via zod error, no queue mutation.
- Missing pending action on resolve: return typed not-found response.
- Double approval/reject: return idempotent "already resolved" response.
- Execution failure after approval: keep action `pending`, attach failure reason, and allow retry or explicit reject.
- Queue deserialization failure: fallback to empty queue and log structured error.
- Undo without available event: return stable no-op response.

## Testing Strategy

Unit:

- `autonomy.ts` classification matrix by tool/payload.
- mode gate matrix (`manual`/`safe`/`autopilot`).
- hard override precedence in all modes.
- pending queue serialization/deserialization behavior.

Integration:

- tool call -> pending action creation -> approve -> execution.
- tool call -> pending action creation -> reject -> no mutation.
- restart -> pending queue restored.
- global undo updates task state and card lifecycle.

Manual acceptance (Task 11 criteria):

1. `manual` mode: all AI writes require approval.
2. `safe` mode: low auto, medium/high/critical pending.
3. `autopilot` mode: low+medium auto, high/critical pending.
4. `delete_task` always pending.
5. invoice paid/overdue update always pending.
6. execute then undo -> task restored and card shows `undone`.
7. task events logged with before/after/source for every mutation.

## Risks and Mitigations

- Risk: policy drift between tools and autonomy logic.
  - Mitigation: one classifier in `autonomy.ts`; tools call it only.
- Risk: pending queue corruption in settings.
  - Mitigation: strict schema parse + safe fallback + write-through normalization.
- Risk: renderer state desync after approve/reject.
  - Mitigation: resolve APIs return authoritative lifecycle result and trigger task refresh.

## Open Questions

None.
