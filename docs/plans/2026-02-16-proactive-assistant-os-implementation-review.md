# Implementation Review

## Plan Path
- `docs/plans/2026-02-16-proactive-assistant-os-design.md`

## Traceability Summary

| Task | Status | Evidence |
|---|---|---|
| 1. Seed `ai_identity` in settings | implemented | `flusk/src/main/ai/memory.ts` |
| 2. Consolidate to `ai_memory` | implemented | `flusk/src/main/ai/memory.ts` |
| 3. `update_identity` + 3000-token hard limit + journal logging | implemented | `flusk/src/main/ai/tools.ts` |
| 4. `read_memory` / `update_memory` / `search_memory` + size limits | implemented | `flusk/src/main/ai/tools.ts`, `flusk/src/main/ai/memory.ts` |
| 5. `search_journal` tool | implemented | `flusk/src/main/ai/tools.ts`, `flusk/src/main/services/journalService.ts` |
| 6. Prompt assembly from Identity + Live State + Protocol | implemented | `flusk/src/main/ai/systemPrompt.ts`, `flusk/src/main/ai/contextBuilder.ts` |
| 7. Remove scoring compiler/memory policy/soul-charter FS runtime | implemented | `flusk/src/main/assistant/contextCompiler.ts` (deleted), `flusk/src/main/assistant/memoryPolicy.ts` (deleted) |
| 8. Remove old profile/pattern tools | implemented | `flusk/src/main/ai/tools.ts` |
| 9. `emit_chips` tool wiring | implemented | `flusk/src/main/ai/tools.ts`, `flusk/src/main/ai/chat.ts` |
| 10. Add `chips` field to chat DB model | partial | Chips persist in tool metadata (`tool_calls`) instead of dedicated DB column (`flusk/src/main/db/schema.ts`, `flusk/src/renderer/stores/chatStore.ts`) |
| 11. Render chips in chat | implemented | `flusk/src/renderer/components/chat/ChatView.tsx` |
| 12. Action chip click -> tool execution | implemented | `flusk/src/renderer/components/chat/ChatView.tsx`, `flusk/src/main/ipc.ts` |
| 13. Response chip click -> user message send | implemented | `flusk/src/renderer/components/chat/ChatView.tsx` |
| 14. Chip lifecycle (single-use, deactivate, stale dim) | implemented | `flusk/src/renderer/components/chat/ChatView.tsx` |
| 15. Prompt policy updated for chips | implemented | `flusk/src/main/ai/systemPrompt.ts` |
| 16. `ProactiveLoop` class + scheduler | implemented | `flusk/src/main/assistant/proactiveLoop.ts` |
| 17. Trigger evaluation | implemented | `flusk/src/main/assistant/proactiveTriggers.ts` |
| 18. Proactive synthetic-trigger chat pipeline | implemented | `flusk/src/main/ai/chat.ts`, `flusk/src/main/assistant/proactiveLoop.ts` |
| 19. Morning briefing trigger | implemented | `flusk/src/main/assistant/proactiveLoop.ts`, `flusk/src/main/index.ts` |
| 20. Task-change-triggered evaluation | implemented | `flusk/src/main/services/taskService.ts`, `flusk/src/main/assistant/proactiveLoop.ts` |
| 21. Time-based reminder scheduling | implemented | `flusk/src/main/assistant/proactiveLoop.ts`, `flusk/src/main/services/dueDateParser.ts` |
| 22. Native notification for unfocused window | partial | Focus behavior present; message-targeted scroll and DND queue behavior are not implemented (`flusk/src/main/assistant/proactiveLoop.ts`) |
| 23. Trigger cooldowns | implemented | `flusk/src/main/assistant/proactiveLoop.ts` |
| 24. Remove LiveThought | implemented | `flusk/src/main/ai/liveThought.ts` (deleted), `flusk/src/renderer/components/layout/LiveThought.tsx` (deleted) |
| 25. Recurrence schema + migration | implemented | `flusk/src/main/db/schema.ts`, `flusk/drizzle/0002_fancy_true_believers.sql` |
| 26. Recurrence engine on completion | implemented | `flusk/src/main/services/recurrenceEngine.ts`, `flusk/src/main/services/taskService.ts` |
| 27. Date+time dueDate parsing | implemented | `flusk/src/main/services/dueDateParser.ts` |
| 28. Reminder scheduler uses time dueDates | implemented | `flusk/src/main/assistant/proactiveLoop.ts` |
| 29. Recurrence UI in task detail | implemented | `flusk/src/renderer/components/tasks/TaskBody.tsx`, `flusk/src/renderer/components/tasks/TaskItem.tsx` |
| 30. `create_task`/`update_task` accept recurrence | implemented | `flusk/src/main/ai/tools.ts`, `flusk/src/main/services/taskService.ts` |

## Findings (by severity)

- **P2**: Missing dedicated `chips` persistence column in `chat_messages`; chips are serialized in `tool_calls` metadata. This diverges from the plan’s data model and weakens queryability and schema clarity for chip analytics/history. Evidence: `flusk/src/main/db/schema.ts:62`, `flusk/src/renderer/stores/chatStore.ts:121`.
- **P2**: Journal retention/archival policy from design (90-day archive strategy) is not implemented; journal growth remains unbounded in the active table. Evidence: `flusk/src/main/services/journalService.ts:23`.
- **P3**: Native notification click focuses app window but does not route/scroll to the specific proactive message, so context jump is incomplete. Evidence: `flusk/src/main/assistant/proactiveLoop.ts:120`.

## Improvements Applied

- Wired task mutation subscription into proactive loop trigger evaluation (`taskService` listener + proactive loop subscriber).
- Fixed morning briefing day key to use local timezone date instead of UTC day.
- Enforced hard safety overrides to require confirmation in all autonomy modes.
- Upgraded identity/memory write tools to journal diffs and rollback memory updates if journal logging fails.
- Extended settings memory IPC schema/history filters to support `identity` and `memory` layers.
- Expanded settings memory UI to edit `Identity` and unified `Memory` directly.
- Hardened chat multimodal message typing and removed non-null assertion usage in key paths.
- Fixed optimistic task typing for recurrence fields and nullable `today` duplication path.

## Test Delta
- Before:
  - `npm run typecheck` failed (3 errors: chat message type mismatch, macOS dock nullable access, unused import in IPC).
  - `npm run lint` failed (1 error + 9 warnings).
  - `npm test` passed (25 files passed, 3 skipped).
- After:
  - `npm run typecheck` passes.
  - `npm run lint` passes (0 errors, 4 warnings).
  - `npm test` passes (25 files passed, 3 skipped).
- Gaps:
  - No dedicated automated coverage for proactive native notification click routing/scroll behavior.
  - `memoryService` and `taskService` test files remain skipped, so service-level regression coverage is incomplete.

## Verification Run
- `npm run typecheck`
- `npm run lint`
- `npm test`

## Verdict
PASS_WITH_CHANGES

## LESSONS_LEARNED
1. Proactive systems need domain event hooks (task mutations), not just timer loops, to feel responsive.
2. Safety invariants should be enforced centrally (`evaluateGate`) to avoid mode-specific bypass regressions.
3. Plan fidelity improves when persistence models are implemented directly instead of piggybacking on metadata blobs.
