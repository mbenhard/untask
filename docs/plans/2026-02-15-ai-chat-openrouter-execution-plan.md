# AI Chat OpenRouter Integration (Task 7) Execution Plan

## Preconditions

- Task dependencies are complete:
  - Task 4 (task IPC/services/state)
  - Task 5 (main app shell + chat mode scaffold)
  - Task 13 (identity kernel and policy layers)
- Assistant identity contracts exist at:
  - `docs/assistant/SOUL.md`
  - `docs/assistant/CHARTER.md`
- Existing DB tables (`chat_messages`, `task_events`, `settings`, `ai_journal`) are migrated and available.
- OpenRouter API key is provided in environment for runtime testing.

## Task List

1. Add AI dependencies and create main AI module scaffolding (`openrouter.ts`, `models.ts`, `tools.ts`, `systemPrompt.ts`, `chat.ts`).
2. Implement OpenRouter provider + three-model registry with default selection and validation helpers.
3. Implement tool registry contracts and executors with zod validation, starting with `create_task` vertical slice.
4. Build identity-kernel-backed system prompt/context assembly in `systemPrompt.ts` and integrate into chat turn orchestration.
5. Implement `chat.ts` stream loop with `streamText`, tool dispatch, structured stream events, and message persistence.
6. Extend IPC/preload/shared types for chat streaming, model listing/selection, history, clear, and undo action endpoints.
7. Build renderer `ChatView` + chat state handling for streamed tokens, assistant completion, action cards, and undo dispatch.
8. Expand tool coverage to full Task 7 scope (task CRUD/planning/utility/journal/profile/pattern flows) with policy gates.
9. Implement chat retention sweep (default 30 days) and clear-history flow.
10. Validate and stabilize with lint/typecheck and end-to-end manual smoke checks.

## Verification Per Task

- Task 1:
  - New AI module files compile.
  - No process-boundary regressions introduced.
- Task 2:
  - `getModels()` returns exactly three supported ids.
  - Invalid model id is rejected safely.
- Task 3:
  - `create_task` tool creates a task and logs `task_events` with `source: ai`.
  - Invalid tool payload returns typed error without mutation.
- Task 4:
  - Every chat turn compiles identity context before model invocation.
  - Prompt output remains within configured token budget.
- Task 5:
  - Streaming tokens arrive in order and finalize with `assistant_done`.
  - User and assistant messages persist with tool metadata.
- Task 6:
  - Renderer can subscribe to and render stream events.
  - Model selector and undo endpoints are available through preload only.
- Task 7:
  - Chat input drives live streamed responses in chat mode.
  - Tool-driven action cards render with visible status and undo affordance.
- Task 8:
  - Full tool list is callable from orchestration layer.
  - Confirm-required actions are proposed but not auto-executed.
- Task 9:
  - Old chat rows are pruned according to retention policy.
  - Manual clear removes history predictably.
- Task 10:
  - `npm run lint` passes.
  - `npx tsc --noEmit` passes.
  - Manual smoke passes:
    - "Hello"
    - "Create task: Review proposal"
    - "Plan my day"
    - model switch
    - clear history
    - undo from action card

## Batch Size

Default: 3 tasks per batch

Recommended session batches:

- Batch 1: Tasks 1-3 (provider/models/first tool vertical slice)
- Batch 2: Tasks 4-6 (context + orchestration + IPC contracts)
- Batch 3: Tasks 7-8 (renderer + full tools + safety gating)
- Batch 4: Tasks 9-10 (retention + stabilization validation)

## Blockers and Escalation

- Blocker: OpenRouter key missing or invalid.
  - Escalation: stop live provider verification, continue with mocked stream tests, and flag for env fix.
- Blocker: AI SDK streaming incompatibility in Electron IPC.
  - Escalation: switch to buffered chunk dispatch abstraction while preserving event contract.
- Blocker: scope pressure in single session.
  - Escalation: preserve full architecture and ship with lower-risk tools first; keep destructive/financial actions confirmation-only.

## Completion Criteria

- End-to-end chat flow works in app with streamed assistant output.
- Identity kernel is consumed on every model invocation.
- Task mutations via tools are auditable and reversible through existing event history.
- High-risk actions require confirmation and are not silently executed.
- Chat history persistence, clear, and retention are functional.
- Response behavior aligns with Soul/Charter tone and decision posture during smoke prompts.
