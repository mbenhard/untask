# AI Chat Quality & Performance Overhaul

**Date**: 2026-02-17
**Status**: Planning (reviewed)

## Goal

Cut system prompt from ~4K to ~800 tokens, reduce tools from 21 to 9, simplify autonomy to 2 modes, kill journal system, fix history pollution. Result: faster responses, better decision quality, less confusion.

**Estimated token savings: ~5,000 per turn**

---

## Task 1: Shared Types Update

Update the shared type definitions that cascade everywhere. Do this first so downstream tasks have correct types.

### Files

- `flusk/src/types/chat.ts`

### Changes

**1a. `AutonomyMode` type** (line 17)

```typescript
// Before
export type AutonomyMode = 'manual' | 'safe' | 'autopilot';
// After
export type AutonomyMode = 'auto' | 'confirm';
```

**1b. Keep `RiskLevel` type** (line 19)

Do NOT remove. It's embedded in `ChatActionCard.riskLevel` and `ChatPendingActionEntry.riskLevel`. Existing pending actions in user DBs use it. Keep the type definition as-is for backwards compatibility.

**1c. Remove `memory_updated` from `ChatStreamEvent` union** (line ~123)

Remove the `{ type: 'memory_updated'; requestId: string }` variant from the discriminated union. Audit confirmed nothing emits this event — it's dead code.

**1d. `ChatPendingActionEntry.modeAtCreation`** (line 239)

Type changes from old `AutonomyMode` to new. Existing pending actions in DB may have old values ('manual', 'safe', 'autopilot'). The Zod schema in `loadPendingActions()` (autonomy.ts) must accept both old and new values during parsing — see Task 2.

---

## Task 2: Simplify Autonomy (3 modes → 2)

### Files

- `flusk/src/main/ai/autonomy.ts`
- `flusk/src/main/ipc.ts`
- `flusk/src/renderer/components/settings/SettingsAI.tsx`
- `flusk/src/renderer/components/settings/SettingsMemory.tsx`
- `flusk/src/renderer/stores/chatStore.ts`
- `flusk/src/renderer/stores/chatStore.test.ts`

### Changes in `autonomy.ts`

**2a. Update `AutonomyMode` type** (line 9)

```typescript
export type AutonomyMode = 'auto' | 'confirm';
```

**2b. Simplify `classifyRisk` — keep as stub** (line 90)

Do NOT remove — it's called in `executeToolCall` (tools.ts line 1660). Simplify to:
```typescript
export const classifyRisk = (hint: ToolRiskHint): RiskLevel => {
  if (HARD_OVERRIDE_TOOLS.has(hint.toolName)) return 'critical';
  return 'low';
};
```

Remove all the internal helpers: `isCompletedRewrite`, `isBulkWrite`, `noteEditAction`, and the entire `switch` body. Keep `ToolRiskHint` type (used by callers). Keep `RiskLevel` type.

**2c. Keep `requiresHardConfirmation`** (line 123)

Already does what we want: `return HARD_OVERRIDE_TOOLS.has(hint.toolName)` — only `delete_task`. No change needed.

**2d. Simplify `evaluateGate` — keep 3-param signature** (line 134)

Keep the same signature `(mode, risk, hardOverride)` so callers don't change. Simplify body:

```typescript
export const evaluateGate = (
  mode: AutonomyMode,
  risk: RiskLevel,
  hardOverride: boolean,
): GateDecision => {
  if (hardOverride) {
    return { action: 'pending', reason: 'Confirm delete?' };
  }
  if (mode === 'confirm') {
    return { action: 'pending', reason: 'Approval needed.' };
  }
  // mode === 'auto'
  return { action: 'execute' };
};
```

**2e. Update `DEFAULT_MODE`** (line 41)

```typescript
const DEFAULT_MODE: AutonomyMode = 'auto';
```

**2f. Update `VALID_MODES`** (line 39)

```typescript
const VALID_MODES: ReadonlySet<AutonomyMode> = new Set(['auto', 'confirm']);
```

**2g. Add migration in `getAutonomyMode()`** (line 43)

Map old persisted values: `'manual'` → `'confirm'`, `'safe'` → `'confirm'`, `'autopilot'` → `'auto'`. If raw value matches old mode, map it and persist the new value.

```typescript
export const getAutonomyMode = (): AutonomyMode => {
  const raw = getSetting(SETTINGS_KEY_AUTONOMY_MODE);
  if (raw && VALID_MODES.has(raw as AutonomyMode)) {
    return raw as AutonomyMode;
  }
  // Migrate old values
  const MIGRATION_MAP: Record<string, AutonomyMode> = {
    manual: 'confirm', safe: 'confirm', autopilot: 'auto',
  };
  if (raw && raw in MIGRATION_MAP) {
    const mapped = MIGRATION_MAP[raw];
    setSetting(SETTINGS_KEY_AUTONOMY_MODE, mapped);
    return mapped;
  }
  return DEFAULT_MODE;
};
```

**2h. Update `loadPendingActions` Zod schema** (line 167)

The `modeAtCreation` field needs to accept old values during parsing:
```typescript
modeAtCreation: z.enum(['auto', 'confirm', 'manual', 'safe', 'autopilot']),
```
This ensures existing pending actions in the user's DB don't fail Zod parsing.

**2i. Update `READ_ONLY_TOOLS` set** (line 258)

Remove entries for tools deleted in Task 4: `suggest_daily_plan`, `read_journal`, `search_journal`, `search_chat_history`, `improve_task`, `get_task`, `fetch_url`.

### Changes in renderer

**2j. `SettingsAI.tsx`** — Update autonomy mode UI

Change the `SegmentedControl` options from 3 to 2:
```tsx
options={[
  { value: 'auto' as const, label: 'Auto' },
  { value: 'confirm' as const, label: 'Confirm' },
]}
```
Update state type from `'manual' | 'safe' | 'autopilot'` to `'auto' | 'confirm'`. Update the `handleAutonomyChange` callback type.

**2k. `SettingsMemory.tsx`** — Update legacy autonomy UI

Same changes as SettingsAI.tsx but for the legacy embedded version (lines 259, 824, 1097-1120). Change the `(['manual', 'safe', 'autopilot'] as const).map(...)` to `(['auto', 'confirm'] as const).map(...)`. Update labels.

**2l. `chatStore.ts`** — Update default + type

Change default `autonomyMode: 'safe'` → `autonomyMode: 'auto'`. The `AutonomyMode` import comes from `types/chat.ts` which was updated in Task 1.

**2m. `chatStore.test.ts`** — Update mock

Change `getAutonomyMode: vi.fn(async () => ({ mode: 'safe' as const }))` → `'auto'`. Update `setAutonomyMode` mock type.

**2n. `ChatView.tsx`** — Simplify riskLevel confirmation modal

Currently gates on `card.riskLevel === 'high' || card.riskLevel === 'critical'` (line 418) to show a modal. Since `classifyRisk` now only returns `'low'` or `'critical'` (delete_task), simplify:
- `delete_task` → goes through hard override path (always pending, shown with confirm modal)
- Everything else → `riskLevel` is always `'low'`, so the modal never triggers

The "Requires confirmation" sub-text (line 159, `card.riskLevel !== 'low'`) stays — it will only appear for delete_task cards which is correct.

---

## Task 3: Kill Journal System

### Files

- `flusk/src/main/ai/tools.ts`
- `flusk/src/main/ai/chat.ts`
- `flusk/src/main/services/journalService.ts` (NOT memory.ts — journal lives here)
- `flusk/src/renderer/stores/chatStore.ts`
- `flusk/src/renderer/components/chat/ChatView.tsx`
- `flusk/src/renderer/components/settings/SettingsJournal.tsx` (delete)
- `flusk/src/renderer/components/settings/SettingsView.tsx`
- `flusk/src/renderer/components/settings/SettingsMemory.tsx`

### Changes

**3a. `tools.ts`** — Remove 4 tool registry entries + handlers

Remove from `AI_TOOL_REGISTRY`:
- `write_journal` (schema ~line 949, handler, registry entry line 1491)
- `read_journal` (schema ~line 964, handler, registry entry line 1492)
- `search_journal` (schema ~line 357, handler ~line 1085, registry entry line 1495)
- `update_identity` (schema ~line 349, handler ~line 981, registry entry line 1493)

Remove the `writeJournalEntry` import from `../services/journalService`.

**Critical**: `update_memory` handler (~line 1043) calls `writeJournalEntry()` internally. Remove that journal write call. The memory update should succeed without journaling. Remove the journal rollback logic too (if journal write fails, it currently rolls back the memory update).

**Critical**: `update_identity` handler (~line 998) also calls `writeJournalEntry()` internally. Since we're removing the whole `update_identity` tool, this goes away with it.

**3b. `chat.ts`** — Remove auto-journaling

- Remove `maybeWriteMeaningfulInteractionJournal()` function definition (lines 657-705)
- Remove its call site (lines 1243-1247)
- Remove `writeJournalEntry` import from `../services/journalService` (line 27)
- Remove `TOOL_MUTATION_NAMES` set (lines 51-62) — only used by auto-journaling
- Remove `AUTO_JOURNAL_COOLDOWN_MS` constant if present

**3c. `chatStore.ts`** — Remove `memory_updated` handling

- Remove the `if (event.type === 'memory_updated')` handler block (lines 1253-1268)
- Remove `memoryUpdated?: boolean` from the `ChatUiMessage` type (line 35)

**3d. `ChatView.tsx`** — Remove `memoryUpdated` rendering

Remove both `{message.memoryUpdated ? <span>Memory updated</span> : null}` blocks (lines 563-567 and 590-594).

**3e. `SettingsJournal.tsx`** — Delete entire file

The whole component (149 lines) renders journal entries with filters. Delete it.

**3f. `SettingsView.tsx`** — Remove journal tab

- Remove `import { SettingsJournal } from './SettingsJournal'`
- Remove `'journal'` from `SettingsTab` type union
- Remove `'journal'` from `TAB_ORDER` array
- Remove `journal: 'Journal'` from `TAB_LABELS`
- Remove `case 'journal': return <SettingsJournal ... />`

**3g. `SettingsMemory.tsx`** — Remove embedded journal UI

This legacy component has a full duplicate journal UI inline:
- Remove `'journal'` from its internal `SettingsTab` type (line 38), `TAB_ORDER` (line 40), `TAB_LABELS` (line 46)
- Remove all journal state: `journalEntries`, `journalFilters`, `loadJournal` handler (lines 209-235, 315-326, 568-571)
- Remove the journal tab panel (lines 1282-1348)
- Remove journal service imports

**3h. `journalService.ts`** — Keep file but stop using it

Don't delete the service file yet — the DB tables (`ai_journal`, `ai_journal_archive`) still exist with data. Just ensure nothing imports from it. The service becomes dead code. Can be cleaned up in a future migration that drops the tables.

**3i. `memory.ts`** — Remove `setIdentity` export

Keep `getIdentity()` (read-only). Remove `setIdentity()` since the AI can no longer write to identity. Note: `ipc.ts` imports `setIdentity` — keep it for the settings UI (user can still edit identity manually). Actually, keep `setIdentity` for human edits via settings. Just remove the AI's ability to call it via tools.

---

## Task 4: Consolidate Tools (21 → 9)

### Files

- `flusk/src/main/ai/tools.ts`
- `flusk/src/main/ai/chat.ts`
- `flusk/src/renderer/components/chat/ChatView.tsx`

### Keep (9 tools)

| Tool | Changes |
|------|---------|
| `create_task` | None |
| `update_task` | Add `project?: string`, `today?: boolean` |
| `complete_task` | None |
| `delete_task` | None |
| `list_tasks` | Add `id?: string` |
| `update_memory` | Remove internal journal write (done in Task 3a) |
| `edit_note` | None |
| `emit_chips` | None |
| `undo_last_action` | None |

### Remove (8 tools — 4 already removed in Task 3)

Remove from `AI_TOOL_REGISTRY` (entry + handler + helpers):
- `get_task` — folded into `list_tasks`
- `move_task` — folded into `update_task`
- `set_today` — folded into `update_task`
- `suggest_daily_plan` — AI can suggest plans in natural text
- `improve_task` — AI can rewrite task descriptions naturally
- `parse_notes` — complex, unreliable
- `search_chat_history` — conversation history already in context
- `fetch_url` — rarely used, SSRF attack surface

### Consolidation details

**4a. `update_task`** — absorb `move_task` + `set_today`

Add to schema:
```typescript
project: z.string().optional().describe('Move task to this project'),
today: z.boolean().optional().describe('Set or unset today flag'),
```

In execute handler:
- If `input.project` is provided: apply the move logic from current `move_task` handler (call `moveTask()` or `updateTask({ project })` from taskService)
- If `input.today` is provided: call `updateTask({ id, today: input.today })` — use explicit set, NOT `toggleToday()`. The AI must specify the desired state.
- Both work alongside existing title/description/priority/dueDate/status updates

**4b. `list_tasks`** — absorb `get_task`

Add to schema:
```typescript
id: z.string().optional().describe('Return a single task by ID'),
```

In execute handler:
- If `input.id`: call `getTaskById(input.id)`, return single task with full details (same format as current `get_task`)
- Otherwise: existing search/filter logic unchanged

**4c. Remove `fetch_url` infrastructure** (tools.ts)

This is ~235 lines of SSRF protection code. Also remove:
- Orphaned Node.js imports: `node:dns/promises`, `node:net` (lines 2-3)
- `@extractus/article-extractor` import (line 7)
- All private helpers: DNS resolution, private IP checks, streaming body fetch

**4d. Remove `parse_notes` and its helpers**

Remove the tool entry, handler, and the `isBulkWrite` helper in `autonomy.ts` (line 73-77) which is 100% `parse_notes`-specific.

**4e. Update `chat.ts`**

- **`generateToolCallDescription()`** (lines 558-617): Remove all 12 switch cases for deleted tools. Add/update cases for `update_task` to mention project/today when those params are present.
- **`PROACTIVE_ALLOWED_TOOLS`**: Remove `move_task`, `set_today`, `get_task`. Keep: `create_task`, `update_task`, `complete_task`, `list_tasks`, `emit_chips`.
- **`parseExplicitFallbackToolCall()`**: No changes — only references `create_task` which stays.

**4f. Update `tools.ts` internals**

- **`buildPendingRationale()`** (~line 1577): Remove switch cases for deleted tools. Update `update_task` case to include project/today in rationale text.
- **`PROACTIVE_ALLOWED_TOOLS`** constant: Update to match kept tools.

**4g. Update `ChatView.tsx` — `VISIBLE_TOOL_NAMES`** (line 95)

Remove from set: `move_task`, `set_today`, `parse_notes`, `update_identity`, `write_journal`.

Final set:
```typescript
const VISIBLE_TOOL_NAMES = new Set([
  'create_task',
  'update_task',
  'complete_task',
  'delete_task',
  'edit_note',
  'update_memory',
  'undo_last_action',
]);
```

---

## Task 5: Rewrite System Prompt

### Files

- `flusk/src/main/ai/systemPrompt.ts`
- `flusk/src/main/ai/memory.ts`

### New prompt structure (4 sections, ~800 tokens)

```
## Now
{timestamp} ({timezone})

---

## You
{identity_document}

---

## Knowledge
{knowledge_document}

---

## Today
{today_tasks_list}

Active: {n} | Inbox: {n} | Overdue: {n} | Due soon: {n}
```

### Changes in `systemPrompt.ts`

**5a. Remove `buildProtocolSection()`** (lines 162-273)

Delete the entire function and all 9 protocol subsections (~112 lines). Remove its call at lines 304-313 and the `protocolSection` variable from `compiledSections`.

**5b. Remove `inferDaySegment()`** (lines 63-68)

Delete the function. Also remove the `Day segment:` line from `buildMetaSection()` (line 91).

**5c. Simplify `buildMetaSection()`** (line 87)

```typescript
const buildMetaSection = (now: Date, timezone: string): string =>
  `## Now\n${formatLocalTimestamp(now, timezone)} (${timezone})`;
```

**5d. Simplify `buildLiveStateSection()` → rename to `buildTodaySection()`** (line 96)

Keep task sorting logic. Remove:
- Risk level calculation (lines 121-126)
- Momentum / "completed today" section (lines 114-119, 155-157)
- Verbose headers ("Your Current State", "Situation")

New function:
```typescript
const buildTodaySection = (liveContext: AssistantLiveContext, now: Date): string => {
  const activeTasks = sortTasks(liveContext.tasks.filter((t) => t.status !== 'done'));
  const todayTasks = activeTasks.filter((t) => t.today);
  const overdueTasks = activeTasks.filter((t) => {
    const dueAt = toIsoDate(t.dueDate);
    return dueAt !== null && dueAt < now.getTime();
  });
  const dueSoonTasks = activeTasks.filter((t) => {
    const dueAt = toIsoDate(t.dueDate);
    if (dueAt === null) return false;
    const hours = (dueAt - now.getTime()) / (1000 * 60 * 60);
    return hours > 0 && hours <= 24;
  });

  const todayLines = todayTasks.slice(0, 10).map((t) => {
    const tags = [
      t.priority && t.priority !== 'none' ? t.priority : null,
      t.dueDate ? `due:${t.dueDate}` : null,
      overdueTasks.some((o) => o.id === t.id) ? 'OVERDUE' : null,
    ].filter(Boolean).join(', ');
    return `- [${t.id}] ${t.title}${tags ? ` (${tags})` : ''}`;
  });

  return [
    '## Today',
    ...(todayLines.length > 0 ? todayLines : ['- (empty)']),
    '',
    `Active: ${activeTasks.length} | Inbox: ${liveContext.inboxCount} | Overdue: ${overdueTasks.length} | Due soon: ${dueSoonTasks.length}`,
  ].join('\n');
};
```

**5e. Remove unused imports**

- Remove `getToolDefinitions` import (tool names no longer listed in prompt)
- Remove `getModelWebSearchConfig` import
- Remove `ChatModelId` from `BuildSystemPromptInput` type (if only used for web search config check)

**5f. Simplify `buildSystemPrompt()` assembly** (line 278)

```typescript
const compiledSections = [
  metaSection,        // ## Now
  '---',
  identitySection,    // ## You\n{identity}
  knowledgeSection ? '---' : null,
  knowledgeSection,   // ## Knowledge\n{knowledge} (skip if empty)
  '---',
  todaySection,       // ## Today\n{tasks}
].filter(Boolean).join('\n\n');
```

**5g. Update `IdentityContextDebugSnapshot.sections`**

4 sections: `now`, `identity`, `knowledge`, `today`. Remove `protocol`.

### Changes in `memory.ts`

**5h. Replace `SEED_IDENTITY_DOCUMENT`** (lines 49-112)

Replace the ~60-line bloated document with the optimized behavioral primer:

```typescript
export const SEED_IDENTITY_DOCUMENT = `You are Marcus's personal assistant in Flusk. Terse, direct, zero filler.

Clear intent → act via tools. No narration, no "I'll do X for you" — just do it.
Ambiguous → one short clarifying question. Never guess at destructive actions.
After tool calls → action cards already show results in the UI. Add text only if it provides value beyond what the cards show. Zero text is often ideal.

You act through tools only. You cannot do anything in the physical world — no meetings, calls, audits. Suggest what Marcus should do, never "I will."
If conversation history contains reverted or undone actions, do not re-execute them.
Use emit_chips for 2-4 concrete options when Marcus needs to choose. Never write chips as text.`;
```

**5i. Add one-time identity reset migration**

In `migrateLegacyMemoryLayers()` (or a new migration function called from `index.ts`): if the current identity doc contains a known marker string from the old seed (e.g. `"Focus Shield"` or `"Observe → Assess → Act → Reflect"`), replace it with the new seed. Guard with a `ai_identity_v2_migrated` settings flag.

---

## Task 6: Fix History Window

### Files

- `flusk/src/main/ai/chat.ts`

### Changes

**6a. Reduce `HISTORY_WINDOW_LIMIT`** (line 46)

```typescript
const HISTORY_WINDOW_LIMIT = 20;
```

Note: `getRecentConversationMessages` in chatService already caps at 50 internally — but 20 is well within that bound.

**6b. Mark undone actions in history — NO schema migration**

Instead of adding an `undone` column (which requires ALTER TABLE + new update function), cross-reference `task_events` at query time:

In `buildConversationMessages()` (or wherever history messages are formatted for the API):
1. Collect all `task_events` with action that indicates an undo occurred (look for undo events created by `undoTaskEvent`)
2. For each assistant message that contains a `toolCalls` metadata JSON, check if any of its tool execution `taskEventId`s match an undone event
3. If so, prepend `[This action was undone] ` to the message content in the API payload (don't modify the DB)

This avoids schema migration entirely. The cost is one extra query per `buildConversationMessages` call — but it's bounded to 20 messages worth of events.

**Alternative (simpler)**: Just reduce the history to 20 messages and skip the undone marking for now. The 20-message window alone dramatically reduces context pollution. The undone marking can be added later if the problem persists.

---

## Task 7: Tests & Verification

### Files

- `flusk/src/main/ai/autonomy.test.ts`
- `flusk/src/main/ai/tools.test.ts`
- `flusk/src/main/ai/chat.test.ts`
- `flusk/src/renderer/stores/chatStore.test.ts`
- `flusk/src/main/ai/knowledgeExtractor.test.ts`

### Changes

**7a. `autonomy.test.ts`** (13 tests currently)

- Update `evaluateGate` tests: replace `'manual'`/`'safe'`/`'autopilot'` with `'auto'`/`'confirm'`
- Remove tests that reference specific risk levels for non-delete tools (since `classifyRisk` always returns `'low'` now)
- Keep test for hard override (delete_task) still blocking
- Keep `isMutationTool` tests — update to remove deleted tool names from expectations

**7b. `tools.test.ts`**

Remove test blocks for deleted tools:
- `describe('suggest_daily_plan tool', ...)` (lines 288-323)
- `describe('get_task tool', ...)` (lines 532-580)
- `describe('fetch_url tool', ...)` (lines 650-696)
- Test for `parse_notes` in view intent mapping (line 418-428)

Remove orphaned mocks:
- `vi.mock('node:dns/promises', ...)` (line 4-13)
- `vi.mock('@extractus/article-extractor', ...)` (nearby)
- Remove `journalService` mock if no remaining tools use it

Add new tests:
- `update_task` with `project` param → verifies move logic
- `update_task` with `today: true` → verifies today flag set
- `list_tasks` with `id` param → verifies single task lookup

**7c. `chat.test.ts`** (16 `generateToolCallDescription` tests)

Remove tests for deleted tools:
- `suggest_daily_plan`
- `set_today`
- `write_journal`
- `read_journal`
- `search_chat_history`
- `improve_task`

Update test for `update_task` if description format changes.

**7d. `chatStore.test.ts`**

- Remove `'marks the related assistant message when memory_updated arrives'` test (lines 571-599)
- Update `autonomyMode` mock from `'safe'` to `'auto'`
- Update `setAutonomyMode` mock type
- Update any test that uses `toolName: 'set_today'` — change to a surviving tool name

**7e. `knowledgeExtractor.test.ts`**

- No journal dependencies found — no changes needed
- The `memory_updated` assertion (`expect(emit).not.toHaveBeenCalled()`) still makes sense and passes

### Verification

```bash
cd flusk && npx tsc --noEmit    # Type check passes
npx vitest run                   # All tests pass
```

Manual checks:
- Send a message → verify faster response (fewer tokens in prompt)
- Trigger a tool call in auto mode → executes immediately, no approval
- Switch to confirm mode → all actions require approval
- Delete a task → always asks confirmation regardless of mode
- Check settings → 2 autonomy modes, no journal tab
- Undo an action → verify undone card renders correctly

---

## Implementation Order

```
Task 1 (Types)      → foundational, all other tasks depend on correct types
Task 2 (Autonomy)   → small scope, self-contained
Task 3 (Journal)    → removes code, simplifies before tool consolidation
Task 4 (Tools)      → biggest task, depends on journal tools being gone
Task 5 (Prompt)     → depends on tools being finalized (no tool list in prompt)
Task 6 (History)    → independent, can go anytime after Task 1
Task 7 (Tests)      → last, validates everything compiles and passes
```

Type check + test run after EACH task to catch cascading issues early.

---

## Files Modified (complete list)

| File | Tasks | Nature |
|------|-------|--------|
| `src/types/chat.ts` | 1 | Type changes |
| `src/main/ai/autonomy.ts` | 2 | Simplify modes, gate, risk |
| `src/main/ipc.ts` | 2 | Autonomy mode handler types |
| `src/renderer/components/settings/SettingsAI.tsx` | 2 | 2 mode options |
| `src/renderer/components/settings/SettingsMemory.tsx` | 2, 3 | Autonomy + journal removal |
| `src/renderer/stores/chatStore.ts` | 2, 3 | Default mode, remove memory_updated |
| `src/renderer/stores/chatStore.test.ts` | 2, 7 | Update mocks and tests |
| `src/main/ai/tools.ts` | 3, 4 | Remove 12 tools, consolidate 3 |
| `src/main/ai/chat.ts` | 3, 4, 6 | Remove auto-journal, update descriptions, history limit |
| `src/renderer/components/chat/ChatView.tsx` | 3, 4 | Remove memoryUpdated, update VISIBLE_TOOL_NAMES |
| `src/renderer/components/settings/SettingsJournal.tsx` | 3 | DELETE |
| `src/renderer/components/settings/SettingsView.tsx` | 3 | Remove journal tab |
| `src/main/ai/systemPrompt.ts` | 5 | Rewrite prompt assembly |
| `src/main/ai/memory.ts` | 5 | New seed identity + migration |
| `src/main/ai/autonomy.test.ts` | 7 | Rewrite for 2 modes |
| `src/main/ai/tools.test.ts` | 7 | Remove deleted tool tests, add consolidation tests |
| `src/main/ai/chat.test.ts` | 7 | Remove deleted tool description tests |
