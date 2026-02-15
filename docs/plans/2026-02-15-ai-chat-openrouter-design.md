# AI Chat OpenRouter Integration (Task 7) Design

## Objective

Deliver Task 7 as a full MVP scope in a single focused session with a functional end-to-end demo: user can send a message, receive streamed assistant output, trigger task mutations through tools, see transparent action cards, and undo eligible actions while preserving Flusk safety and identity constraints.

## Scope

- Integrate Vercel AI SDK + OpenRouter provider in main process.
- Add three-model registry and selector:
  - `minimax/minimax-m2.5` (default)
  - `moonshotai/kimi-k2.5`
  - `z-ai/glm-5`
- Implement main AI modules under `src/main/ai/`:
  - `openrouter.ts`
  - `models.ts`
  - `tools.ts`
  - `systemPrompt.ts`
  - `chat.ts`
- Support tool calling for task, planning, and memory/journal operations listed in Task 7.
- Add streaming chat UI and action cards in renderer.
- Persist chat messages and tool metadata with retention cleanup.
- Enforce identity-kernel integration and confirmation policies on risky actions.

## Non-Goals

- Production-grade retry/backoff orchestration.
- Multi-turn transactional rollback across multiple tool calls.
- New standalone settings screen beyond what is needed for model selection and chat retention keys.
- Refactoring unrelated task/view architecture.

## Constraints

- Main process owns provider, DB, and tool execution.
- Preload exposes minimal typed APIs only.
- Renderer has no direct provider/DB access.
- IPC remains domain-first (`chat:*`, `task:*`, `settings:*`).
- Write payloads validated with zod before mutation.
- Identity kernel outputs (Soul + Charter + memory/live context) are required inputs for every AI turn.
- Charter safety rules must remain enforced regardless of autonomy mode.

## Architecture

Use a vertical-slice-first architecture. First implement one robust path (`chat:send` -> stream -> `create_task` tool -> action card -> undo metadata), then expand tool coverage in the same architecture.

### Main Process

- `openrouter.ts`: provider factory using `@ai-sdk/openai` with OpenRouter base URL.
- `models.ts`: model catalog, default model, model resolution and validation.
- `tools.ts`: zod-defined tool contracts and executors bound to existing services (`taskService`, settings, journal/memory utilities).
- `systemPrompt.ts`: compiles request context by consuming identity kernel/context compiler outputs plus live task and inbox state.
- `chat.ts`: orchestrates `streamText`, tool execution, event emission, persistence, and policy checks.

### Boundary Rules

- `chat.ts` is the only orchestration entrypoint to avoid duplicate policy paths.
- All mutation tools write through existing service functions so `task_events` audit remains canonical.
- Destructive/high-risk actions emit confirmation-needed outputs instead of direct mutation.

## Components and Interfaces

### Renderer

- Add `src/renderer/components/chat/ChatView.tsx` for chat transcript + streaming view.
- Add action-card components for tool outcomes and undo affordances.
- Add local chat state (`chatStore` or equivalent hook) tracking:
  - messages
  - in-flight stream chunks
  - selected model
  - tool action results
  - send/error states

### Preload API

Extend `window.flusk.chat` with typed methods:

- `send({ content, modelId })`
- stream subscription/event API for incremental updates
- `history()`
- `clear()`
- `undoLastAction(actionId | taskEventId)`
- `getModels()`

### Shared Types

Add discriminated unions for chat stream events:

- `token`
- `tool_call_started`
- `tool_call_completed`
- `assistant_done`
- `error`

Persisted chat message metadata should include model id and serialized tool-call outcomes.

## Data Flow

1. Renderer submits user content + selected model.
2. Main validates input and resolves model.
3. Main compiles identity-aware prompt context (kernel + live context).
4. `streamText` begins; chunk events are emitted to renderer.
5. Tool calls are validated, policy-gated, executed sequentially, and logged.
6. User and assistant messages persist to `chat_messages`; mutation details persist via existing `task_events`.
7. Renderer finalizes stream, renders action cards, and refreshes task state.
8. Retention cleanup runs on load/send using configured policy (default 30 days).

Tool expansion order for session speed:

1. `create_task` (vertical slice)
2. `update_task`, `complete_task`, `set_today`, `move_task`
3. `suggest_daily_plan`, `parse_notes`, `undo_last_action`
4. `delete_task` with explicit confirmation
5. Journal/profile/pattern tools

## Error Handling

- Provider/model misconfiguration yields structured error events and recoverable UI state.
- Tool validation failures return typed tool error payloads; no silent partial writes.
- Interrupted streams finalize with `assistant_done` + error metadata to prevent hanging UI.
- Failed tools do not corrupt renderer state; task list resync occurs after successful mutations.
- Input remains usable after errors with explicit retry path.

## Testing Strategy

Target: functional end-to-end demo quality.

- Main orchestration checks:
  - identity context compilation before model call
  - streaming event emission
  - `create_task` tool mutation + audit logging
  - provider failure path
- Renderer checks:
  - chat mode transitions
  - live stream rendering
  - action card rendering
  - undo dispatch wiring
  - model selector payload propagation
- Safety checks:
  - confirmation required for delete, bulk >5, invoice paid/overdue, completed-history rewrite
  - high-impact memory updates remain confirmation-gated
- Validation commands:
  - `npm run lint`
  - `npx tsc --noEmit`
  - manual smoke for hello/create/plan/model-switch/clear/retention/undo

## Risks and Mitigations

- Risk: streaming + Electron IPC complexity causes brittle UX.
  - Mitigation: typed event contract and single orchestration entrypoint.
- Risk: policy bypass via direct tool invocation.
  - Mitigation: centralize tool execution in `chat.ts` with policy wrappers.
- Risk: scope overload in one session.
  - Mitigation: strict vertical-slice-first sequence and defer non-critical polish.
- Risk: identity prompt budget overflow.
  - Mitigation: reuse token-budgeted context compiler and cap sections.

## Open Questions

- None blocking for plan readiness.
- Assumptions baked into this plan:
  - Model selection UI will live in chat surface for MVP.
  - Chat retention default is 30 days with settings override key.
