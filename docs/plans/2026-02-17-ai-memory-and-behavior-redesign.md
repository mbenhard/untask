# AI Memory & Behavior Redesign

**Date:** 2026-02-17
**Status:** Draft (reviewed)

## Problem

The assistant has too many memory layers (Soul, Identity, Profile, Patterns, Memory, Journal) — three of which are legacy. The AI forgets context because Knowledge is off-prompt and must be actively fetched. The AI doesn't auto-update what it learns. After completing actions, the AI talks too much — repeating what action cards already show, giving unsolicited advice, asking unnecessary follow-up questions.

Chat has no thread model — "Clear" destroys all history with no way to return to past conversations.

## Implementation Phases

This redesign ships in two phases to manage risk:

**Phase 1: Memory + Behavior** (lower risk, high impact)
- Memory simplification (delete legacy, Knowledge in prompt)
- Knowledge auto-extraction
- Behavior overhaul (verbosity fixes)
- Tool fixes
- Settings UI cleanup

**Phase 2: Chat Threads** (higher risk, 15+ files affected)
- Conversations table + migration
- Thread UI (header dropdown)
- FTS5 search across threads
- `search_chat_history` AI tool
- Thread auto-naming

---

## Phase 1: Memory + Behavior

### 1. Memory Simplification

**Before:** 6 layers (Soul, Identity, Profile, Patterns, Memory, Journal) — 3 active, 3 legacy.

**After:** 2 layers + 1 background system.

| Layer | Purpose | In System Prompt | Updated By | User Access |
|-------|---------|-----------------|------------|-------------|
| Identity | Personality, rules, behavior | Always (full doc) | User edits in settings. AI updates rarely, with confirmation | Editable text in settings |
| Knowledge | Facts about the user: clients, projects, preferences, workflows | Always (full doc) | Auto-extracted after meaningful turns | Reviewable + editable in settings |
| Journal | Time-ordered log of observations, decisions, changes | Never (AI searches via tool) | Auto-journal + AI tool calls | Compact log viewer in settings |

**Deleted entirely:** Soul (`ai_soul`), Profile (`ai_user_profile`), Patterns (`ai_patterns`).

**Full file cascade for legacy deletion:**

| File | What to remove/change |
|------|----------------------|
| `flusk/src/main/ai/memory.ts` | Delete `getSoul`, `setSoul`, `resetSoul`, `getProfile`, `setProfile`, `appendProfileEntry`, `getPatterns`, `setPatterns`, `appendPatternEntry`, `migrateToUnifiedMemory`, `migrateLegacyMemoryKeys`, `buildAssistantMemorySnapshot`, `DEFAULT_SOUL_MEMORY` |
| `flusk/src/main/services/memoryService.ts` | Remove `soul`, `profile`, `patterns` from `MEMORY_LAYER_SETTINGS_KEYS` and `MemoryLayer` type |
| `flusk/src/main/ipc.ts` | Remove imports of deleted functions. Update `getMemoryState()` to return only identity + memory. Remove `SETTINGS_RESET_SOUL` handler. Update `settings:update-memory-state` handler |
| `flusk/src/types/assistant.ts` | Update `AssistantMemorySnapshot` to remove `soul`, `profile`, `patterns`. Update `MemoryLayer` type. Remove `promote_profile`, `promote_patterns` from `MemoryPromotionAction` |
| `flusk/src/types/ipc.ts` | Update `SettingsMemoryStatePayload` to remove `soul`, `profile`, `patterns`. Remove `SETTINGS_RESET_SOUL` channel. Update layer enums in event/history payloads |
| `flusk/src/preload/index.ts` | Remove `resetSoul` API |
| `flusk/src/types/preload.d.ts` | Remove `resetSoul` from type |
| `flusk/src/renderer/components/settings/SettingsMemory.tsx` | Remove soul/profile/patterns sub-tabs and editors. Rename "Memory" tab to "Knowledge" |
| `flusk/src/renderer/components/settings/SettingsMemoryTab.tsx` | Remove soul/profile/patterns labels, descriptions, tabs |
| `flusk/src/main/services/memoryService.test.ts` | Update tests to remove soul/profile/patterns writes |
| `flusk/src/main/db/schema.ts` | Keep `soul`/`profile`/`patterns` values in `memoryEvents.layer` enum for backward compat of existing rows. Stop writing new events to those layers |
| `docs/assistant/CHARTER.md` | Update Memory Contract section (remove Soul/Profile/Patterns references) |

### 2. Knowledge Always In Prompt

Knowledge moves from "AI must call `read_memory` to access" to "always present in the system prompt."

System prompt assembly becomes:

```
1. ## Now (time metadata)
2. Identity (full document)
3. Knowledge (full document)
4. ## Your Current State (live tasks, risk level)
5. ## Operating Protocol (rules, tool names)
```

**Token budget:** Knowledge has a soft limit of 8,000 tokens and a hard limit of 15,000 tokens (existing limits, unchanged). Combined with Identity (~2K tokens), protocol (~800 tokens), and live state (~600 tokens), worst case is ~18.5K tokens for the system prompt. Manageable with 128K context models.

**Tool cleanup:** With Knowledge always in prompt, these tools become redundant:
- `read_memory` — remove entirely (AI already has Knowledge in context)
- `search_memory` — remove entirely (AI can search the in-prompt document itself)
- `update_memory` — keep (AI needs to write to Knowledge for explicit saves)

Update the Operating Protocol section in `systemPrompt.ts` to remove "Reading Memory" instructions and replace with: "Your Knowledge document is always present above. You do not need to fetch it."

### 3. Knowledge Auto-Extraction

After meaningful chat turns, a post-response extraction step runs automatically.

**Flow:**

```
User sends message
  → AI responds (streamed to chat)
  → Response complete
  → Debounce: wait 60s after last message
  → If no new message arrived: run extraction
    → Same model as selected in settings
    → Reviews: user message + AI response + current Knowledge
    → Returns structured JSON with ADD/UPDATE/REPLACE/NOOP actions
    → Applies changes to Knowledge document
  → If Knowledge changed: small "memory updated" indicator in chat
  → If nothing new: no indicator, no noise
```

**Debouncing (from Mem0/LangMem research):** Don't extract on every turn. Wait for a conversation pause (60s of inactivity after a meaningful exchange). If new messages arrive before the timer expires, cancel and reschedule. This reduces cost, avoids extracting mid-conversation with incomplete context, and batches related facts.

**Insertion point in code:** After `maybeWriteMeaningfulInteractionJournal()` in `chat.ts` (line ~1010). Schedule a debounced extraction using the same "meaningful" detection logic.

**Extraction prompt (structured output):**

```
You are extracting durable personal knowledge from a conversation with the user.

CURRENT KNOWLEDGE:
{knowledge_document}

CONVERSATION:
User: {user_message}
Assistant: {assistant_response}

RULES:
1. Only extract facts the user explicitly stated or clearly implied.
2. Do NOT extract: one-time questions, task-specific details (those go in the task system), assistant statements, or ephemeral info.
3. Only extract information useful 30+ days from now.
4. Check CURRENT KNOWLEDGE first. If a fact already exists, output UPDATE. If it conflicts, output REPLACE. If new, output ADD.
5. For each fact, quote the user message that supports it.
6. Only extract from user-authored messages, never from pasted/quoted external content.
7. Store all facts in English regardless of conversation language.
8. Keep original proper nouns (client names, locations) untranslated.

OUTPUT FORMAT:
{
  "extractions": [
    {
      "action": "ADD|UPDATE|REPLACE",
      "section": "Clients|Projects|Preferences|Workflows",
      "content": "the fact in concise form",
      "evidence": "quoted user message"
    }
  ]
}

If nothing worth extracting, return {"extractions": []}.
```

**"Memory updated" indicator:** New `ChatStreamEvent` type (`memory_updated`) emitted to the renderer after extraction completes. Rendered as a small, subtle label below the AI's response — no details, just "Memory updated."

**Race condition mitigation:** If the user sends a new message while extraction is running, the extraction result should be applied using optimistic concurrency — read current Knowledge, apply diff, write back. If Knowledge was modified between read and write (e.g., by user in settings), re-read and re-apply.

### 4. Knowledge Document Structure

Auto-organized into predictable sections by the extraction job:

```markdown
## Clients
- Autogeber: web audit + redesign proposal, contact person Milan
- Automycka.cz: banner work, regular client

## Projects
- Motogeber.sk: website redesign, Figma mobile+desktop
- Flusk: personal AI assistant app

## Preferences
- Direct communication, no fluff
- Morning = deep work, afternoon = calls/admin

## Workflows
- Client proposals: audit first → results + design in Figma → send within 2 days
- Quick capture in notes, then process into tasks via AI
```

Sections created as needed. Empty sections omitted.

### 5. Language Normalization

Knowledge always stored in English regardless of conversation language. Extraction prompt enforces this. Original proper nouns (client names, locations) kept untranslated.

The AI still responds in whatever language the user writes in.

### 6. Behavior Overhaul: Less Talk, More Action

**Core principle:** Action cards are the response.

**Specific lines to change:**

| File | Line | Current | Change to |
|------|------|---------|-----------|
| `systemPrompt.ts` | 210 | "Follow with the next recommended action" | Remove entirely |
| `systemPrompt.ts` | 223 | "ALWAYS after completing an action (offer logical next steps)" | "Only when the AI cannot proceed without user input" |
| `systemPrompt.ts` | 158 | "(empty — you should propose a plan)" | "(empty)" — remove the directive |
| `systemPrompt.ts` | 277-286 | 5 proactive triggers with no throttle | Move proactive behavior entirely to the ProactiveLoop system (which already has cooldowns). Remove from system prompt. |
| `tools.ts` | 1172 | "Always 2-4 chips" in emit_chips description | "2-4 chips when used. Only emit chips at genuine decision points, not after routine actions." |
| `SEED_IDENTITY` | 230 | "I don't wait to be asked when something is urgent" | Remove — proactive behavior is handled by ProactiveLoop, not in-response nudges |
| `SOUL.md` | 42-46 | "Every response must include: what to do next" | "Include what to do next only when the user asked for guidance or the situation is genuinely ambiguous" |
| `CHARTER.md` | 33 | "Offer alternatives: quick win, strategic unblock, and primary recommendation" | "Lead with one recommendation. Offer alternatives only when tradeoffs are non-obvious." (Aligns with SEED_IDENTITY anti-pattern) |

**New rules to add to system prompt Operating Protocol:**

```
## Response Discipline

1. Action cards replace text. If tool calls produced visible action cards, do NOT
   repeat what the cards show. Zero text is acceptable when cards tell the full story.

2. Only speak when adding value:
   - The user asked a question
   - Something failed (one-line explanation)
   - Genuine ambiguity requiring one clarifying question
   - The user explicitly asked for analysis or planning

3. No unsolicited advice. Never say "we should...", "consider doing...",
   "since this is high-priority..." unless the user asked for guidance.

4. Chips only at real decision points. Not after routine actions.
   Only when you cannot proceed without user input.

5. One sentence max after routine actions. If you must speak, one sentence.

6. Never re-explain completed actions. The action cards already show what happened.

7. Do not answer questions the user did not ask.
```

### 7. Note Processing: Deterministic But Smart

When a note is attached and the user says "process" or similar:

1. Read the note content (already in system prompt via `noteContext`)
2. Extract actionable items
3. Create tasks (with correct parent/child relationships)
4. If genuinely ambiguous: ask ONE clarifying question with chip options
5. Done

The AI should NOT: explain what it extracted, suggest next steps, comment on deadlines, or ask "anything else?"

The AI SHOULD ask (with chips) when: note item is ambiguous between task/reference, multiple clients could apply, or priority is genuinely unclear.

### 8. Tool Fixes

| Tool | Problem | Fix |
|------|---------|-----|
| `create_task` | AI uses placeholder "NEW_TASK_ID" for parentId | Add to description: "To create subtasks, first create the parent task, then use its returned ID as parentId. Never use placeholder IDs." |
| `read_note` | Returns raw BlockNote JSON | Write a new `blockNoteToMarkdown()` utility in `notesService.ts` (main process). Cannot reuse renderer's `serializeNoteForProcessing` — it's renderer-only. Convert before returning to AI. |
| `parse_notes` | No `parentId` support | Add optional `parentId` parameter to schema |
| `read_note` + context | AI calls `read_note` when content is already in prompt | Add to description: "If note content is attached in the system prompt, use it directly — do not call read_note." |
| `edit_note` replace | Does string match on raw BlockNote JSON | **Deferred** — this is much harder than it appears (requires markdown↔JSON position mapping). Revisit if notes move to markdown storage. |
| `read_memory` | Redundant when Knowledge is in prompt | Remove entirely |
| `search_memory` | Redundant when Knowledge is in prompt | Remove entirely |
| `emit_chips` | Description says "Always 2-4 chips" | Change to "2-4 chips when used. Only emit at genuine decision points." |
| `suggest_daily_plan` | No action card rendered | Add action card rendering for plan output |

### 9. Settings UI Changes

**Before:** Tabs for Soul, Identity, Profile, Patterns, Memory, Journal.

**After:**

| Section | Content |
|---------|---------|
| Identity | Editable text area. "This defines who your assistant is." |
| Knowledge | Editable text area. Auto-maintained. "What your assistant knows about you." Below: compact change history (from `memory_events`, filtered to `identity` and `memory` layers only). |
| Journal | Compact log viewer. Filterable by category. Read-only. |

### 10. Migration Path

**Memory migration (one-time on first launch):**

1. If `ai_user_profile` has content AND `ai_memory` already has content → merge profile into Knowledge's `## Profile` section (don't skip — existing `migrateToUnifiedMemory` incorrectly returns early if memory exists)
2. If `ai_patterns` has content → merge into Knowledge's `## Workflows` section (same merge logic)
3. If `ai_memory` has content → preserve as-is (already Knowledge format)
4. If `ai_soul` has content → discard (Identity supersedes it)
5. Delete legacy setting keys: `ai_soul`, `ai_user_profile`, `ai_patterns`

**DB schema:** Keep `soul`/`profile`/`patterns` in `memoryEvents.layer` enum for backward compat of existing historical rows. Stop writing new events to those layers.

---

## Phase 2: Chat Threads

### 1. Data Model

```sql
CREATE TABLE conversations (
  id              TEXT PRIMARY KEY NOT NULL,
  title           TEXT NOT NULL DEFAULT 'New Thread',
  is_auto_title   INTEGER DEFAULT 1,
  created_at      TEXT,
  updated_at      TEXT,
  archived_at     TEXT
);

CREATE INDEX conversations_updated_at_idx ON conversations (updated_at);
CREATE INDEX conversations_archived_at_idx ON conversations (archived_at);

ALTER TABLE chat_messages ADD COLUMN conversation_id TEXT
  REFERENCES conversations(id) ON DELETE CASCADE;

CREATE INDEX chat_messages_conversation_id_idx
  ON chat_messages (conversation_id);
CREATE INDEX chat_messages_conversation_id_created_at_idx
  ON chat_messages (conversation_id, created_at);
```

**Migration for existing messages:**

```sql
-- Only create legacy thread if messages exist
INSERT INTO conversations (id, title, is_auto_title, created_at, updated_at)
SELECT
  'legacy-migration-thread',
  'Previous Conversation',
  0,
  MIN(created_at),
  MAX(created_at)
FROM chat_messages
WHERE EXISTS (SELECT 1 FROM chat_messages LIMIT 1);

UPDATE chat_messages
SET conversation_id = 'legacy-migration-thread'
WHERE conversation_id IS NULL
  AND EXISTS (SELECT 1 FROM chat_messages LIMIT 1);
```

### 2. FTS5 for Chat Search

Reuse existing pattern from `searchService.ts`:

```sql
CREATE VIRTUAL TABLE chat_messages_fts USING fts5(
  content,
  content='chat_messages',
  content_rowid='rowid'
);
```

With insert/update/delete triggers. Initialize with drop+recreate+rebuild on app start (matching existing task search pattern).

**`search_chat_history` AI tool:**
- Parameters: `query` (keyword), `dateFrom?`, `dateTo?`, `limit?` (default 10, max 50)
- Returns: matching messages with thread title, role, date, and `snippet()` context (32 tokens around match)
- Searches across all threads (active + archived)

### 3. Thread Auto-Naming

- Generate after first complete exchange (user message + assistant response)
- Fire-and-forget side effect when first `assistant_done` event completes on a thread with default title
- Use a cheap/fast model (not user's selected model) — e.g., `gpt-4o-mini` via OpenRouter
- Prompt: "Generate a 3-6 word title capturing the main topic. Use specific keywords, action verbs. No quotes, no period."
- Fallback: truncate first user message to 40 chars
- 5-second timeout

### 4. Thread UI — Header Dropdown

- **Trigger:** Click thread title in chat header (shows current thread name + chevron-down)
- **Width:** 280-320px
- **Max height:** ~400px with overflow scroll
- **Search:** Auto-focused input at top, filters by title match
- **"New Thread" button** at top, below search
- **Date groups:** Today / Yesterday / This Week / This Month / Older
- **Thread items:** Title (truncated ~35 chars) + relative timestamp (right-aligned)
- **Active thread:** Subtle `bg-accent` highlight
- **Initial render:** 15-20 most recent threads
- **Scroll:** Infinite scroll, load 20 more on scroll-to-bottom
- **Delete/archive:** Swipe or icon per thread
- **Keyboard:** Arrow keys + Enter to select, Escape to close

### 5. Files Affected

| File | Change |
|------|--------|
| `flusk/src/main/db/schema.ts` | Add `conversations` table, add `conversationId` to `chatMessages` |
| `flusk/src/main/services/chatService.ts` | Scope all operations to `conversationId`. Replace `clearChatHistory` with per-thread archive/delete |
| `flusk/src/main/ai/chat.ts` | Thread `conversationId` through `startChatTurn` and `runAssistantStream`. Scope `getRecentChatMessages` to active thread. Handle proactive turns (create thread if none active) |
| `flusk/src/main/ai/tools.ts` | Add `search_chat_history` tool |
| `flusk/src/main/services/searchService.ts` | Add `initChatSearchFts()` and `searchChatMessages()` |
| `flusk/src/renderer/stores/chatStore.ts` | Add `activeConversationId`, `conversations` list, thread switching, auto-title |
| `flusk/src/renderer/components/chat/ChatView.tsx` | Render messages for active thread only |
| `flusk/src/renderer/components/layout/TitleBar.tsx` or ChatHeader | Add thread dropdown trigger |
| `flusk/src/renderer/components/chat/ThreadDropdown.tsx` | New component: thread list with search and date groups |
| `flusk/src/types/chat.ts` | Add `conversationId` to `ChatSendRequestPayload` |
| `flusk/src/types/ipc.ts` | Add thread IPC channels: `CHAT_CREATE_THREAD`, `CHAT_LIST_THREADS`, `CHAT_ARCHIVE_THREAD`, `CHAT_DELETE_THREAD` |
| `flusk/src/preload/index.ts` | Expose thread APIs |
| `flusk/src/types/preload.d.ts` | Add thread API types |
| `flusk/src/main/ipc.ts` | Add thread IPC handlers |
| `flusk/drizzle/` | New migration file `0005_chat_threads.sql` |

---

## Summary of All Changes

| Area | Change |
|------|--------|
| Memory layers | 6 → 2 + journal. Delete Soul, Profile, Patterns |
| Knowledge in prompt | Off-prompt → always in prompt |
| Knowledge updates | AI must decide → auto-extracted (debounced 60s) |
| Memory indicator | None → small "memory updated" in chat |
| Language | Mixed → Knowledge always English |
| Redundant tools | Remove `read_memory`, `search_memory` |
| Chat model | Single stream + clear → threaded conversations (Phase 2) |
| Chat history | Lost on clear → persistent, searchable by AI (Phase 2) |
| Thread access | N/A → header dropdown with search (Phase 2) |
| AI verbosity | 8 specific prompt lines changed to enforce "less talk" |
| Unsolicited advice | Common → banned unless asked |
| Chips | After every action → only at real decision points |
| Note processing | Creative/verbose → deterministic, ask only when ambiguous |
| `create_task` | Placeholder ID bug → explicit parent-first instruction |
| `read_note` | Returns JSON → returns markdown (new main-process utility) |
| `parse_notes` | No subtask support → optional parentId |
| `edit_note` replace | Deferred — complexity too high for this phase |
| Settings UI | 6 sections → 3 sections (Identity, Knowledge, Journal) |
