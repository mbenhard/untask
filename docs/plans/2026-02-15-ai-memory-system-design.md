# AI Memory System (Task 8) Design

## Objective

Deliver Task 8 as a full memory-layer implementation that is consistent with the identity kernel already in place, auditable in storage, and actionable in runtime behavior. The system must support four memory layers: Soul (editable user personality overlay), Profile (durable facts/preferences), Patterns (reusable workflow templates), and Journal (time-based observations). The result should improve response quality and proactivity without introducing a parallel memory pipeline.

This design intentionally follows an incremental-consolidation approach: reuse existing Task 7/13 primitives (`contextCompiler`, `memoryPolicy`, chat tool orchestration, journal/settings services), then close Task 8 gaps with explicit APIs, keys, and runtime hooks. This minimizes churn, avoids regressions in working chat flows, and keeps dependency order intact.

## Scope

- Add canonical memory service in `flusk/src/main/ai/memory.ts`.
- Standardize memory keys to Task 8 namespace:
  - `ai_soul`
  - `ai_user_profile`
  - `ai_patterns`
- Preserve backward reads from legacy keys (`assistant.memory.profile`, `assistant.memory.patterns`) with one-way migration to new keys.
- Extend memory snapshot types and context assembly to include Soul overlay.
- Consolidate memory tools (`update_user_profile`, `update_patterns`, `write_journal`, `read_journal`) around the new service.
- Implement weekly digest generation and Monday scheduling checks.
- Upgrade `generate_live_thought` behavior and wire Today view to runtime output.
- Add a memory settings surface for editing Soul/Profile/Patterns and browsing journal entries.

## Non-Goals

- Replacing identity kernel architecture or removing Soul/Charter contracts from `docs/assistant/*`.
- Full general settings shell redesign (Task 10 scope).
- LLM-heavy digest generation that requires provider availability for baseline behavior.
- Broad renderer routing refactor unrelated to memory features.

## Constraints

- Main process remains sole owner of DB/file writes and memory mutation logic.
- Renderer consumes typed preload APIs only.
- IPC stays domain-first (`settings:*`, `chat:*`), no raw DB channels.
- Memory writes must remain attributable and reversible/auditable through existing tables and logs.
- High-risk actions retain confirmation policy regardless of autonomy mode.
- Soul/Charter runtime constraints must still be consumed on every assistant response.

## Architecture

### 1. Canonical Memory Service

Create `flusk/src/main/ai/memory.ts` as the single entrypoint for memory-layer persistence and retrieval.

Responsibilities:
- expose `getSoul`, `setSoul`, `resetSoul`, `getProfile`, `setProfile`, `getPatterns`, `setPatterns`
- expose `buildAssistantMemorySnapshot` returning `{ soul, profile, patterns, journalEntries }`
- embed default Soul text required by Task 8
- migrate legacy profile/pattern keys into `ai_user_profile` and `ai_patterns` at first read/write

Soul strategy:
- keep `docs/assistant/SOUL.md` as stable contract base
- treat `ai_soul` as editable overlay/instruction supplement
- context compilation includes both base soul contract and soul overlay section

### 2. Memory Tools Consolidation

Keep tool registration in `flusk/src/main/ai/tools.ts` for now, but route all profile/pattern reads/writes through `memory.ts`.

Tool expectations:
- `update_user_profile`: append/update structured markdown sections
- `update_patterns`: append/update named pattern blocks
- `write_journal`/`read_journal`: keep category validation and support days-back filtering
- all tool outputs remain action-card compatible and stream-safe

### 3. Context Builder Integration

Do not replace `flusk/src/main/assistant/contextCompiler.ts`; instead add `flusk/src/main/ai/contextBuilder.ts` as a compatibility adapter that:
- pulls canonical memory snapshot from `memory.ts`
- delegates ranking/selection to `compileIdentityContext`
- returns a normalized memory-context payload for system prompt assembly

This satisfies Task 8 context-builder requirements while preserving deterministic behavior already validated in Task 13.

### 4. Runtime Behavior Layer

Add `flusk/src/main/ai/weeklyDigest.ts`:
- summarize prior 7 days of journal entries by category
- persist digest as `ai_journal` category `summary`
- enforce Monday-once policy via setting key `ai_weekly_digest_last_generated_at`
- provide `checkAndGenerateWeeklyDigest()` for startup trigger

Add journal trigger hook in chat orchestration:
- on meaningful interactions (tool mutation, planning intent, or explicit reflection), write concise `progress`/`pattern`/`preference` entry
- avoid noisy writes using simple debounce/cooldown setting key

Upgrade `generate_live_thought`:
- input signals: time-of-day, overdue count/severity, today-list state, recent completion momentum, top pattern hints
- output: one concise recommendation string + suggested action intent

### 5. Renderer Memory Surface

Add `flusk/src/renderer/components/settings/SettingsMemory.tsx`:
- tabs: Soul, Profile, Patterns, Journal
- markdown textareas for editable layers (save/reset)
- read-only journal list with category/date filters

Given Task 10 (full settings shell) is pending, mount this through a minimal, isolated entry path (temporary internal route or panel trigger) without redesigning app navigation.

## Components and Interfaces

Main-process additions:
- `flusk/src/main/ai/memory.ts`
- `flusk/src/main/ai/contextBuilder.ts`
- `flusk/src/main/ai/weeklyDigest.ts`

Main-process updates:
- `flusk/src/main/ai/chat.ts` (canonical memory snapshot + journal trigger)
- `flusk/src/main/ai/tools.ts` (memory tool internals + live thought)
- `flusk/src/main/index.ts` (startup digest check)
- `flusk/src/main/ipc.ts` (memory and journal query/mutation endpoints)

Type updates:
- `flusk/src/types/assistant.ts` (`AssistantMemorySnapshot` includes `soul`)
- `flusk/src/types/ipc.ts` and `flusk/src/types/preload.d.ts` for memory/journal APIs

Renderer additions/updates:
- `flusk/src/renderer/components/settings/SettingsMemory.tsx`
- `flusk/src/renderer/components/layout/LiveThought.tsx` data wiring
- optional lightweight store/hook for memory settings state

## Data Flow

### A. Prompt-Time Memory Assembly

1. chat request enters `startChatTurn` in `chat.ts`.
2. `memory.ts` builds canonical snapshot (`soul`, `profile`, `patterns`, journal slice).
3. `contextBuilder.ts` delegates to `compileIdentityContext` with live context.
4. `systemPrompt.ts` composes model prompt from contracts + soul overlay + selected snippets.
5. model invocation proceeds with token-budgeted context.

### B. Memory Mutation

1. model triggers memory tool (`update_user_profile`/`update_patterns`/`write_journal`).
2. tool validates payload (zod) and calls `memory.ts` or `journalService`.
3. mutation is persisted in settings/`ai_journal`.
4. tool result returns structured envelope and optional action card.

### C. Runtime Proactivity

1. app startup calls `checkAndGenerateWeeklyDigest()`.
2. if Monday and digest missing for current week, digest row is created.
3. Today view requests/derives live thought via upgraded generator.
4. renderer displays contextual thought and action prompt.

## Error Handling

- Invalid memory markdown payloads: reject with typed validation issues.
- Missing/invalid legacy keys: fallback to empty/default and auto-migrate when possible.
- Digest generation failure: log error, continue app startup (non-blocking).
- Journal trigger failure: fail soft; never block chat completion.
- Live-thought generation failure: fallback deterministic baseline message.
- IPC contract mismatch: strict typing in preload/types and guarded null-safe renderer handling.

## Testing Strategy

Unit tests:
- `memory.ts`: key migration, default soul fallback, set/get/reset behavior.
- `weeklyDigest.ts`: Monday gate, once-per-week dedupe, deterministic summary output.
- `generate_live_thought`: scenario matrix (morning empty today, overdue pressure, momentum case).

Integration tests:
- chat turn uses canonical memory snapshot with `soul` present.
- memory tools update settings/journal through canonical service.
- startup digest check executes without blocking app readiness.

Manual smoke:
1. Edit Soul and verify prompt/context snapshot reflects change.
2. Trigger profile/pattern updates via chat and verify persistence.
3. Trigger meaningful interaction and verify journal entry creation.
4. Mock Monday and verify digest created once.
5. Verify Today live thought changes across context conditions.

## Risks and Mitigations

- Risk: dual-source Soul ambiguity (contract vs setting).
  - Mitigation: explicit base-contract + overlay model with deterministic order.
- Risk: Task 10 settings dependency for UI mounting.
  - Mitigation: isolated memory panel mount now; full settings integration later.
- Risk: memory noise from auto-journaling.
  - Mitigation: meaningful-event filter + cooldown threshold.
- Risk: prompt bloat from added soul/profile layers.
  - Mitigation: keep compiler token budget and section caps unchanged.

## Open Questions

None.

Implementation defaults for this plan:
- Mount `SettingsMemory` behind an internal settings trigger until Task 10 delivers the full settings shell.
- Ship deterministic weekly digest first, with optional AI-assisted summarization as a non-blocking enhancement when provider configuration is present.
