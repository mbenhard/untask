# AI Chat Reliability, Tool Quality, and UX Recovery Design

## Objective

Stabilize Flusk chat so each user turn produces exactly one coherent assistant outcome, tool actions are intent-correct and safe, OpenRouter streaming failures are observable and recoverable, and the chat UX reflects trustworthy execution behavior.

This design focuses on fixing the defects shown in current runtime behavior:

- Duplicate assistant/tool results shown for one user message.
- Low-quality task creation triggered from ambiguous language (example: task title `"for me?"`).
- Streaming failures from provider path that are currently hard to diagnose and recover from in-app.

## Scope

- Main process chat orchestration (`flusk/src/main/ai/chat.ts`).
- OpenRouter request reliability and error classification (`flusk/src/main/ai/openrouter.ts`, `flusk/src/main/ai/chat.ts`).
- Tool-call confidence and fallback behavior (`flusk/src/main/ai/tools.ts`, `flusk/src/main/ai/systemPrompt.ts`, `flusk/src/main/ai/chat.ts`).
- Renderer stream state lifecycle and idempotent message handling (`flusk/src/renderer/stores/chatStore.ts`).
- Chat UX improvements for stream status, retries, and action-card clarity (`flusk/src/renderer/components/chat/ChatView.tsx`).
- Test coverage for chat orchestration/store behavior.

## Non-Goals

- Replacing OpenRouter or changing AI SDK stack.
- Rebuilding autonomy mode architecture.
- Full redesign of memory/kernel pipelines outside chat reliability/performance concerns.
- Broad UI theming redesign unrelated to chat reliability and clarity.

## Constraints

- Preserve process boundaries: main owns provider/tool execution/database; renderer remains IPC-only.
- Keep identity kernel and Soul/Charter context integration on every turn.
- Keep high-risk/destructive action confirmation guarantees.
- Preserve auditable task mutation behavior (`task_events`).
- Avoid broad refactors outside chat/tool pipeline and chat UI.

## Architecture

Adopt a three-layer hardening model:

1. Stream Determinism Layer
- Make chat initialization idempotent and concurrency-safe in renderer store.
- Ensure only one active stream listener registration per renderer lifecycle.
- Make stream event application idempotent by `requestId` + stable entity identity (`assistantMessage.id`, `actionCard.id`).

2. Tool Intent Quality Layer
- Remove unsafe heuristic fallback execution for ambiguous text.
- Replace with confidence-gated command parsing (only explicit command forms auto-execute).
- Strengthen prompt policy: require clarification for missing required mutation details.
- Add guardrails for `create_task` titles so weak conversational fragments are rejected with clarification text, not persisted.

3. Reliability + UX Layer
- Add provider/network error taxonomy and mapped user-facing recovery actions.
- Add retry strategy for transient OpenRouter streaming errors (bounded retry/backoff).
- Improve transcript UX for errors and retries without duplicating messages/cards.
- Add lightweight instrumentation for timing and failure rates.

## Components and Interfaces

### Main Chat Orchestration (`chat.ts`)

- Introduce turn telemetry object:
  - `requestId`, `modelId`, `startedAt`, `firstTokenAt`, `completedAt`, `failureType`.
- Normalize errors into typed classes:
  - `config_error`, `provider_error`, `network_error`, `tool_error`, `unknown_error`.
- Replace fallback path:
  - Remove broad `inferFallbackToolCall`.
  - Add strict command parser used only for explicit imperative formats.
  - If low-confidence intent: emit assistant text requesting missing details.
- Use conversation window:
  - Include recent chat messages in model input instead of single-prompt-only calls to improve response quality and tool consistency.

### Tool Execution (`tools.ts`)

- Add `create_task` quality validator:
  - Reject ambiguous titles (`for me?`, `a task`, etc.) and return clarification-required envelope.
- Keep mutation safety and autonomy gates unchanged.

### System Prompt (`systemPrompt.ts`)

- Update policy language:
  - Do not force mutation tools when required fields are missing.
  - Prefer clarification over low-confidence writes.
  - Maintain concise, direct style from identity constraints.

### Renderer Store (`chatStore.ts`)

- Add `initializePromise` and `isInitializing` guard to prevent concurrent init races.
- Before registering a listener, always dispose existing listener safely.
- Add helper `upsertByMessageId` for `assistant_done` event handling.
- Dedupe action cards per message by `card.id`.
- Keep `inFlightByRequestId` authoritative for streaming placeholders.

### Chat UI (`ChatView.tsx`)

- Add retry affordance for failed turns (resend last user message).
- Show precise error messaging from taxonomy rather than generic fallback.
- Ensure action cards show once per executed action and lifecycle updates remain stable.

## Data Flow

1. Renderer sends message via `chat:send`; user message persisted immediately.
2. Main builds identity-aware context + recent message window.
3. Main opens OpenRouter stream with retry policy for transient failures.
4. Stream emits ordered events (`token`, `tool_call_*`, `assistant_done` or typed `error`).
5. Renderer applies events idempotently; placeholder replaced exactly once by final assistant message.
6. Action cards are deduped by id and associated with one assistant message.
7. On recoverable failure, UI offers retry; on non-recoverable failure, shows actionable configuration/provider message.

## Error Handling

- Configuration errors:
  - Missing/invalid API key, unsupported model selection.
  - Immediate fail with explicit configuration message.
- Provider/network transient errors:
  - Retry up to bounded attempts with jittered backoff.
  - If still failing, preserve partial streamed content and show retry action.
- Tool validation errors:
  - Never persist mutation.
  - Return tool result that explains required fields.
- Cancellation:
  - Preserve existing cancel semantics and suppress stale finalization.

## Testing Strategy

- Unit tests:
  - `chatStore.initialize` idempotency under concurrent calls.
  - `assistant_done` dedupe by message id.
  - strict fallback parser confidence behavior.
  - `create_task` title quality guard behavior.
- Integration-style tests (mocked stream):
  - duplicate stream event delivery should still render single assistant outcome.
  - tool call completion + assistant_done should produce one action card set.
  - typed error -> retry UX state transition.
- Manual smoke:
  - `hello` turn (single assistant response).
  - ambiguous task request (asks clarification, no mutation).
  - explicit task command (creates exactly one task + one action card).
  - forced provider error (clear user-facing recovery path).
  - model switch across all supported models.

## Risks and Mitigations

- Risk: Removing broad fallback lowers automatic tool-call frequency.
  - Mitigation: use strict explicit-command parser + improved prompt policy + conversation history.
- Risk: Retry logic could create duplicate mutations if replayed improperly.
  - Mitigation: retry only provider call boundary, keep tool idempotency checks and request-scoped dedupe.
- Risk: Renderer dedupe may hide legitimate separate messages.
  - Mitigation: dedupe only by canonical persisted message id and request-scoped placeholders.

## Open Questions

- Should ambiguous task-intent turns always ask a follow-up question, or can we offer a draft-task confirmation card before persistence?
- Do we want per-model capability flags (tool-call quality tiers) to adapt tool policy by model?
