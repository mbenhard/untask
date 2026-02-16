# AI Chat Reliability and Performance Recovery Execution Plan

## Preconditions

- Current AI chat implementation is present and runnable in `flusk/src/main/ai/*` and `flusk/src/renderer/stores/chatStore.ts`.
- Identity kernel integration remains mandatory and must stay active on every response path.
- Existing autonomy/safety gates remain authoritative for mutation tools.
- OpenRouter key is available in the runtime environment for end-to-end smoke validation.

## Task List

1. Add structured chat-turn telemetry and error classification in `flusk/src/main/ai/chat.ts`.
2. Implement bounded retry/backoff for transient OpenRouter stream failures and preserve cancellation behavior.
3. Remove broad heuristic fallback mutation path and replace with strict explicit-command parsing only.
4. Update system prompt runtime tool policy to prefer clarification when required mutation inputs are missing.
5. Add `create_task` title-quality guard in `flusk/src/main/ai/tools.ts` to reject ambiguous conversational fragments.
6. Include a recent conversation window in model inputs to improve continuity and tool-call quality.
7. Refactor renderer chat initialization for idempotent listener setup (`initializePromise`, single active unsubscribe).
8. Make renderer stream application idempotent:
   - upsert `assistant_done` by persisted message id
   - dedupe action cards by `card.id`
9. Improve chat UX for failure and recovery:
   - typed error message surface
   - retry action for failed turns
   - stable action-card rendering for one-turn/one-outcome behavior
10. Add test coverage for:
    - initialize race prevention
    - assistant_done dedupe
    - strict fallback parser behavior
    - `create_task` quality guard
11. Run validation (`npm run lint`, `npm run typecheck`, targeted tests) and execute manual OpenRouter smoke matrix.
12. Update Taskmaster notes/status and write execution checkpoint summary only after acceptance gates pass.

## Verification Per Task

- Task 1:
  - Error outputs include typed reason category and requestId.
  - Turn timing fields are emitted/logged without breaking stream flow.
- Task 2:
  - Transient provider/network failure retries occur within bounded limits.
  - Canceled requests do not retry and do not emit stale finalization.
- Task 3:
  - Ambiguous prompts like "can you create a task for me?" no longer auto-mutate.
  - Explicit commands still trigger deterministic helper path when model skips tool calls.
- Task 4:
  - Prompt guidance clearly instructs clarification-first behavior for missing required fields.
- Task 5:
  - Invalid/ambiguous title attempts return clarification-required output and do not write tasks.
- Task 6:
  - Follow-up turns use prior context and improve coherence in manual checks.
- Task 7:
  - Multiple concurrent `initialize()` calls register one stream listener only.
  - StrictMode dev behavior no longer causes duplicated stream events in UI.
- Task 8:
  - Duplicate `assistant_done` events for same message id render one final assistant message.
  - Duplicate `tool_call_completed` cards do not duplicate in final message.
- Task 9:
  - Failed stream state presents actionable retry UI.
  - Successful retry produces one final assistant message and consistent action cards.
- Task 10:
  - New tests pass and catch regressions for known defects.
- Task 11:
  - `npm run lint` passes.
  - `npm run typecheck` passes.
  - Targeted test suite passes.
  - Manual smoke matrix passes on real provider.
- Task 12:
  - Taskmaster reflects implementation decisions, risks, and acceptance evidence.

## Batch Size

Default: 3 tasks per batch

Planned batches for this run:

- Batch 1 (Provider Reliability Foundations): Tasks 1-3
- Batch 2 (Tool-Intent Quality): Tasks 4-6
- Batch 3 (Renderer Determinism + UX): Tasks 7-9
- Batch 4 (Verification + Closeout): Tasks 10-12

## Blockers and Escalation

- Blocker: provider retry behavior causes duplicate side effects in tool paths.
  - Escalation: scope retries to pre-tool provider failures and enforce request-level dedupe.
- Blocker: model-specific tool-call quality remains unstable after fallback tightening.
  - Escalation: add per-model capability policy and default to clarification mode for weak models.
- Blocker: missing OpenRouter runtime key for smoke validation.
  - Escalation: run non-provider tests first, then defer final smoke gate until key is supplied.

## Completion Criteria

- One user turn yields one assistant outcome in UI (no duplicate bubbles or cards).
- Ambiguous task-creation prompts never create persisted tasks automatically.
- Streaming failures are classified and recoverable with clear retry behavior.
- Chat continuity improves via recent-history context inclusion.
- Safety and identity-kernel constraints remain enforced.
- Lint/typecheck/tests/manual smoke acceptance checks pass.
