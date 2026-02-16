# AI Tool Redesign

**Date:** 2026-02-16
**Status:** Approved
**Scope:** Fix task blindness, improve tool-calling reliability, add web search

## Problem Statement

The AI assistant has three critical issues:

1. **Task blindness** — The live context section formats tasks without IDs. The AI cannot reference, update, complete, or delete any task it didn't create in the current conversation. 6 of 15 tools are effectively unusable on existing tasks.

2. **"Says it will but doesn't"** — The AI acknowledges requests and says it will act, but finishes the turn without calling tools. Caused by weak `toolChoice` detection and insufficient system prompt directives about action bias.

3. **Too narrow** — All tools are task/memory operations. No information retrieval capability. The assistant can't answer questions, look things up, or help with anything outside the task domain.

## Design

### 1. Fix Task Blindness

**1a. Include task IDs in live context section**

In `contextCompiler.ts`, change the task formatting from:
```
- Task title (today, priority:high, client:Acme, due:2026-02-20)
```
To:
```
- [t_abc123] Task title (today, priority:high, client:Acme, due:2026-02-20)
```

Increase the task slice from 8 to 15 items. The ID prefix adds ~12 chars per task, well within token budget.

**1b. Add `list_tasks` tool**

Read-only tool that searches/filters the full task list. Accepts optional parameters:
- `status` — filter by task status (inbox, active, in_progress, done)
- `priority` — filter by priority level
- `client` — filter by client name (case-insensitive partial match)
- `today` — filter by today flag
- `search` — fuzzy title match (case-insensitive substring)
- `limit` — max results (default 20)

Returns array of: `{ id, title, status, priority, client, dueDate, today, parentId }`.

No autonomy gate needed (read-only). The AI uses this when it needs to find a task beyond the top-15 visible in context, or when resolving a user's natural-language reference ("the Acme invoice thing") to a task ID.

**1c. Add `get_task` tool**

Read-only tool that fetches full details of a single task by ID. Returns all fields including body, notes, subtasks, invoice fields, timestamps. Used when the AI needs complete context before acting on a task.

### 2. Fix Tool-Calling Reliability

**2a. Add "Action Bias" directive to system prompt**

Add to the Runtime Tool Policy section in `systemPrompt.ts`:

```
### Action Bias
- When the user asks you to DO something (create, update, complete, delete, move, plan, remember), you MUST call the appropriate tool. Never describe what you would do — just do it.
- If you lack required information (like a task ID), call list_tasks to find it first, then call the mutation tool.
- Only respond with text (no tool call) when the user is asking a question, making conversation, or the request is genuinely ambiguous.
- NEVER say "I'll do that" or "Let me do that" without immediately calling a tool. Words without action is a failure mode.
```

**2b. Broaden mutation intent detection**

Expand `shouldRequireToolChoice` in `chat.ts`:

- Add verbs: "mark", "finish", "done", "remove", "delete", "set", "change", "rename", "prioritize", "defer", "remember", "save", "note", "log"
- Add entities: "it", "that", "this", "them" (pronoun references to previous context)
- Add follow-up confirmations: detect "yes", "yeah", "yep", "do it", "go ahead", "sure", "ok", "confirmed", "approve" after an assistant message that proposed or described an action
- Detect "search for", "look up", "find out", "what is" patterns for web search intent

**2c. Add task title → ID resolution guidance**

Add to tool policy:
```
### Task Resolution
- When the user refers to a task by name, description, or partial match, use list_tasks with a search query to find the matching task ID before calling mutation tools.
- If multiple tasks match, present the options and ask which one.
- If no tasks match, tell the user and ask for clarification.
```

### 3. Add Web Search

**3a. Model-native web search**

Add web search capability using each model's native implementation:

| Model | Method | Cost |
|-------|--------|------|
| Kimi K2.5 | `builtin_function` tool with name `$web_search` added to tools array | $0.005/call |
| Claude Haiku 4.5 | Native `web_search` tool type (`type: "web_search_20250305"`) | Included in token cost |
| Gemini 3 Flash | Not supported (OpenRouter passthrough broken) | — |
| GLM-5 | Not supported (undocumented via OpenRouter) | — |
| MiniMax M2.5 | Not supported (no native search) | — |

**3b. Implementation approach**

Add `supportsWebSearch` field to `ModelCatalogEntry` in `models.ts`.

In `chat.ts`, when building the tools for `streamText()`:
- If model is Kimi K2.5: inject `{ type: "builtin_function", function: { name: "$web_search" } }` into the tools array alongside the SDK tools
- If model is Claude Haiku 4.5: inject `{ type: "web_search_20250305", name: "web_search" }` into the tools array

The model decides autonomously when to search. No explicit `web_search` tool in our registry — the search is a model-level capability, not an application tool.

Add system prompt guidance:
```
### Web Search
- You have access to web search. Use it when the user asks about current events, facts you're unsure about, prices, weather, or anything outside your training data.
- Cite sources when presenting search results.
- For models without web search: tell the user this model doesn't support web search and suggest switching to Kimi K2.5 or Claude Haiku 4.5.
```

**3c. Add `fetch_url` tool**

Application-level tool (in our registry) that fetches a URL and returns readable content. For when the user pastes a link. Implementation: use `fetch()` + HTML-to-text extraction (e.g., `@extractus/article-extractor` or similar). Read-only, no autonomy gate.

Schema:
```typescript
{
  url: z.string().url(),
  maxLength: z.number().int().min(100).max(10000).default(3000)
}
```

Returns: `{ title, content, url }` with content truncated to maxLength.

### 4. Model Catalog Changes

Add to `ModelCatalogEntry`:
```typescript
supportsWebSearch: boolean;
webSearchMethod?: 'kimi_builtin' | 'claude_native';
```

Updated catalog:
```typescript
{ id: 'moonshotai/kimi-k2.5', supportsWebSearch: true, webSearchMethod: 'kimi_builtin' }
{ id: 'anthropic/claude-haiku-4.5', supportsWebSearch: true, webSearchMethod: 'claude_native' }
{ id: 'google/gemini-3-flash-preview', supportsWebSearch: false }
{ id: 'z-ai/glm-5', supportsWebSearch: false }
{ id: 'minimax/minimax-m2.5', supportsWebSearch: false }
```

## Files to Change

| File | Changes |
|------|---------|
| `src/main/ai/tools.ts` | Add `list_tasks`, `get_task`, `fetch_url` tools |
| `src/main/ai/chat.ts` | Broaden `shouldRequireToolChoice`, inject model-native search tools |
| `src/main/ai/systemPrompt.ts` | Add Action Bias, Task Resolution, Web Search policy sections |
| `src/main/ai/models.ts` | Add `supportsWebSearch` and `webSearchMethod` fields |
| `src/main/assistant/contextCompiler.ts` | Add task IDs to format, increase slice to 15 |
| `src/types/chat.ts` | Add web search event types if needed |

## Not Doing (YAGNI)

- No `batch_update` tool — multi-step tool loop handles this
- No OpenRouter plugin fallback — $0.02/call too expensive
- No calendar/reminder tools — post-MVP
- No email/communication drafting — post-MVP
- No Gemini/GLM-5/MiniMax web search — broken or undocumented via OpenRouter

## Testing Plan

1. **Task blindness fix**: Create tasks via UI, then ask AI to "complete the [task name]" — should resolve ID and act
2. **Tool reliability**: Say "mark my highest priority task as done" — should call list_tasks → complete_task without narrating
3. **Follow-up confirmation**: AI proposes action, user says "yes" — should execute without re-explaining
4. **Web search (Kimi)**: Ask "what's the weather in Berlin today" — should trigger $web_search
5. **Web search (Claude)**: Same query — should trigger native web_search tool
6. **Web search (unsupported model)**: Switch to MiniMax, ask same — should explain no search and suggest switching
7. **fetch_url**: Paste a URL and say "summarize this" — should fetch and return content
8. **list_tasks**: Ask "what tasks do I have for client Acme" — should call list_tasks with client filter
