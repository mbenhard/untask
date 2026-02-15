# AI Memory System (Task 8) Execution Plan

## Preconditions

- Task 7 and Task 13 are completed and stable in the current branch.
- Existing memory-related implementations in `chat.ts`, `tools.ts`, `contextCompiler.ts`, and services are treated as baseline to consolidate, not replace.
- SQLite schema already includes `settings` and `ai_journal` tables.
- Team agrees on 2-batch delivery this week:
  - Batch 1 success = core memory engine only.
  - Batch 2 priority = runtime behavior first, then memory UI surface.

## Task List

1. Create `flusk/src/main/ai/memory.ts` with canonical keys (`ai_soul`, `ai_user_profile`, `ai_patterns`), default soul text, and legacy key migration support.
2. Update types to include `soul` in `AssistantMemorySnapshot` and propagate type-safe usage through chat/system prompt/context inputs.
3. Refactor `flusk/src/main/ai/chat.ts` and `flusk/src/main/ai/tools.ts` to use `memory.ts` for profile/pattern/soul reads and writes.
4. Add `flusk/src/main/ai/contextBuilder.ts` adapter that assembles canonical memory and delegates snippet selection to `compileIdentityContext`.
5. Extend journal read API to support `days_back` and bounded limits needed by memory tooling.
6. Add `flusk/src/main/ai/weeklyDigest.ts` with Monday gate + once-per-week dedupe via settings key.
7. Wire weekly digest startup check in `flusk/src/main/index.ts` as non-blocking background work.
8. Add meaningful-interaction journal trigger path in chat orchestration with cooldown protection.
9. Upgrade `generate_live_thought` tool logic and wire Today view to runtime output instead of static copy.
10. Add memory settings surface (`SettingsMemory`) with editable Soul/Profile/Patterns + journal browser and required IPC/preload endpoints.
11. Run lint/typecheck and perform manual acceptance checks aligned to Task 8 tests.
12. Update Task 8 notes/status in Taskmaster only after acceptance checks pass.

## Verification Per Task

- Task 1:
  - Fresh DB returns default soul text.
  - Existing legacy memory values migrate to `ai_*` keys without data loss.
- Task 2:
  - `AssistantMemorySnapshot` compile errors resolved across main/preload/renderer boundaries.
- Task 3:
  - Memory tools mutate only canonical keys and still return valid tool envelopes/action cards.
- Task 4:
  - Prompt build path uses canonical memory snapshot and compiler token budget remains bounded.
- Task 5:
  - `read_journal` supports bounded temporal filtering and remains category-safe.
- Task 6:
  - Monday condition generates exactly one summary entry per week.
- Task 7:
  - App startup remains responsive; digest errors do not crash readiness.
- Task 8:
  - Journal entries appear for meaningful turns and do not spam on every message.
- Task 9:
  - Live thought varies by context (overdue, empty today, momentum/time-of-day).
- Task 10:
  - Soul/Profile/Patterns editable with persistence; journal list supports basic filters.
- Task 11:
  - `npm run lint` passes.
  - `npx tsc --noEmit` passes.
  - Manual Task 8 smoke checks pass.
- Task 12:
  - Taskmaster reflects implementation details and acceptance evidence.

## Batch Size

Default: 3 tasks per batch

Planned batches for this run:

- Batch 1 (Core Engine): Tasks 1-5
  - Deliverable: canonical memory service + tool/path consolidation + context builder adapter
  - Exit gate: memory storage, memory tools, and prompt-time memory assembly are stable

- Batch 2 (Runtime First + UI): Tasks 6-11
  - Deliverable order: weekly digest + journal triggers + live thought, then SettingsMemory UI
  - Exit gate: proactive runtime behavior works and memory is user-editable/browsable

## Blockers and Escalation

- Blocker: memory settings UI mount point conflicts with pending Task 10 settings architecture.
  - Escalation: ship isolated memory panel mount now; defer full settings-shell integration to Task 10.
- Blocker: unexpected regressions in chat streaming due to memory refactor.
  - Escalation: keep old key-read fallback temporarily and gate risky refactors behind adapters.
- Blocker: journal-trigger noise creates low-signal memory.
  - Escalation: tighten trigger conditions and cooldown before marking done.

## Completion Criteria

- Canonical memory layer exists and is used by chat/runtime pathways.
- Soul/Profile/Patterns are persisted, human-readable, and user-editable.
- Journal writes/reads are operational with category and time filtering.
- Weekly digest runs Monday-only with dedupe and summary persistence.
- Live thought is context-aware, not hardcoded.
- Memory context appears in compiled prompt/debug snapshot under token budget.
- Task 8 acceptance checks pass with lint/typecheck/manual validation evidence.
