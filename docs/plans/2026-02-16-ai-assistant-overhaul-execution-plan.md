# AI Assistant Overhaul — Execution Plan

## Design Reference

`docs/plans/2026-02-16-ai-assistant-overhaul-design.md`

---

## Task List

### Phase 1: Context Intelligence (no UI changes, immediate gain)

**Task 1: Increase context budget and orchestration limits**
- `chat.ts`: `DEFAULT_TOKEN_BUDGET` → 12,000, `HISTORY_WINDOW_LIMIT` → 60, `STREAM_TOOL_LOOP_MAX_STEPS` → 25
- Verify system prompt compiles at full size without truncation
- Verify 60-message history loads correctly
- Gate: model receives full untruncated prompt. Multi-step turns allowed up to 25.

**Task 2: Enrich tool descriptions and system prompt policy**
- `tools.ts`: Rewrite all 15 tool descriptions with trigger conditions, input guidance, behavioral expectations (2-4 sentences each)
- `systemPrompt.ts`: Expand tool policy to encourage multi-step reasoning, clarification-first behavior, and outcome summaries
- Gate: each description is concrete with examples. Manual test shows improved tool selection and multi-step behavior.

### Phase 2: Streaming Enhancements (main process)

**Task 3: Add reasoning token handling**
- `chat.ts`: Handle `reasoning-start`, `reasoning-delta`, `reasoning-end` parts in `fullStream` loop
- `chat.ts`: Emit new `reasoning` event to renderer, accumulate `reasoningText` for persistence
- `models.ts`: Add `supportsReasoning` flag per model entry
- `types/chat.ts`: Add `reasoning` event type to `ChatStreamEvent` union
- Graceful no-op when model doesn't emit reasoning
- Gate: MiniMax M2.5 emits reasoning events. Other models work unchanged.

**Task 4: Enhance tool step events and persist step data**
- `chat.ts`: Add `description` field to `tool_call_started` event (generated from tool name + args)
- `chat.ts`: Add `summary` field to `tool_call_completed` event (one-line result)
- `chat.ts`: Add helper to generate human-readable descriptions from tool call args
- `types/chat.ts`: Add `description` to started event type, `summary` to completed event type
- `types/chat.ts`: Add `reasoningText` and `stepDescriptions` to `PersistedChatToolMetadata`
- `chat.ts`: Persist reasoning text and step descriptions in message metadata
- Gate: all 15 tools produce meaningful descriptions/summaries. Persisted messages contain step data.

### Phase 3: Renderer Overhaul

**Task 5: Refactor chat store for step-based state**
- `chatStore.ts`: Add `TurnStep` accumulation alongside existing placeholder pattern
- Handle `reasoning` event → append/extend thinking step
- Handle `token` event → append/extend text step
- Handle `tool_call_started` → append tool step with 'running' status
- Handle `tool_call_completed` → update tool step status, add summary and action card
- Handle `assistant_done` → finalize steps, auto-collapse thinking, persist
- Reconstruct `TurnStep[]` from persisted metadata on history load
- Gate: store accumulates steps correctly from all event types. History loads with steps.

**Task 6: Build step-based message rendering**
- `ChatView.tsx`: Replace action-card-below-message rendering with inline step rendering
- Render thinking step as collapsible section (collapsed by default, expanded during stream, auto-collapsed on done)
- Render text steps as markdown
- Render tool steps with status icon (spinner/check/x/warning), description, summary
- Render confirmation inline within tool step (approve/reject buttons) using existing action card data
- Keep undo button on successful undoable tool steps
- Remove `ActionCard` component, `ConfirmationDialog` modal, and floating card layout
- Gate: full turn renders thinking + text + tool steps inline. Confirmation works. Undo works. History shows steps.

### Phase 4: Validation

**Task 7: Test coverage**
- Unit test: reasoning event accumulation in store
- Unit test: step accumulation from mixed event sequences
- Unit test: history reconstruction from persisted metadata
- Unit test: tool description generation for all 15 tools
- Update existing chat.test.ts and chatStore.test.ts for new fields
- Gate: all tests pass.

**Task 8: Manual smoke validation**
- "Hello" → text response, optional thinking, no tools
- "Create task: Call Acme about invoice" → thinking → tool step visible → success → summary
- "Plan my day" → multiple tool steps visible in sequence
- "Delete the old project task" → inline confirmation
- Model switch across all 3 models → each works (reasoning where supported)
- 20+ message conversation → coherent
- App restart → historical turns show steps
- Gate: all scenarios pass on real provider.

**Task 9: Cleanup**
- Remove dead code (old ActionCard component, ConfirmationDialog modal, unused card dedup helpers)
- Verify lint/typecheck pass
- Gate: clean build, no dead code.

---

## Batches

- **Batch 1** (Tasks 1-2): Context intelligence. Ship immediately, zero UI risk.
- **Batch 2** (Tasks 3-4): Streaming enhancements. Main process only.
- **Batch 3** (Tasks 5-6): Renderer overhaul. The visible change.
- **Batch 4** (Tasks 7-9): Validation and cleanup.

## Completion Criteria

1. Model receives full 12K context with enriched tool descriptions
2. Reasoning visible during streaming (for supported models)
3. Tool execution visible inline with description + summary
4. Confirmation/undo works inline within tool steps
5. Historical turns show step data from persistence
6. All tests pass, lint/typecheck clean
7. Manual smoke validation passes
