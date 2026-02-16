# AI Assistant Overhaul — Visible Intelligence

## Objective

Make Flusk's AI feel like a capable personal assistant that *does things*, not a chatbot. Show reasoning, show actions, give it enough context to be smart.

## Problem

Frontier models (MiniMax M2.5 76.8% BFCL, Kimi K2.5, GLM-5 SOTA SWE-bench) are being hobbled by:

1. **Starved context** — 1,600 token system prompt budget. Identity, tasks, tool policy all truncated.
2. **Black box UX** — "Streaming..." then a result. No visibility into reasoning or tool execution.
3. **Short memory** — 12-message history window. Multi-turn conversations lose coherence.
4. **Tight tool loop** — Max 5 steps. "Plan my day" needs ~12.
5. **Sparse tool descriptions** — Models guess wrong because descriptions are one-liners.

## Scope

**In:** Context budget, reasoning visibility, inline tool steps, tool descriptions, history/loop expansion.
**Out:** Model changes, identity kernel changes, autonomy changes, new tools.

## Constraints

- Keep process boundaries (main owns AI/DB/tools, renderer is IPC-only)
- Keep identity kernel, autonomy gates, task event audit trail
- Keep existing event names and action card data model — change rendering, not plumbing
- Incremental delivery: context budget first (zero UI risk), then streaming, then UI

---

## Changes

### 1. Context Budget

```
DEFAULT_TOKEN_BUDGET:       1,600 → 12,000
HISTORY_WINDOW_LIMIT:          12 → 60
STREAM_TOOL_LOOP_MAX_STEPS:     5 → 25
```

Models support 128K+ context. 12K system prompt is <10%. Full soul, charter, tasks, profile, patterns, journal fit without truncation. 60 messages gives real conversation memory. 25 steps lets the assistant actually plan a day.

### 2. Reasoning Token Support

AI SDK 6.0.86 already emits `reasoning-start`, `reasoning-delta`, `reasoning-end` in `fullStream`. We just need to:

- Handle these parts in the stream loop in `chat.ts`
- Emit a new `reasoning` event to the renderer
- Add `supportsReasoning` flag per model in `models.ts`
- Pass OpenRouter reasoning parameter when supported

```typescript
// In stream processing — just add this case
case 'reasoning-delta':
  reasoningText += part.text;
  emit({ type: 'reasoning', requestId, text: part.text });
  break;
```

No middleware needed. The SDK handles it natively for OpenRouter.

### 3. Enhanced Tool Step Events

Keep existing event names. Add fields:

```typescript
// tool_call_started — add description field
{ type: 'tool_call_started', requestId, toolName, toolCallId, description: string }

// tool_call_completed — add summary field
{ type: 'tool_call_completed', requestId, toolName, toolCallId, status, message, summary: string, actionCard? }
```

`description` = human-readable "Creating task 'Call Acme'" generated from tool name + args.
`summary` = one-line result "Task created — priority: high, due: Feb 17".

The `actionCard` field stays for confirmation/undo flows. We change how it renders, not what it contains.

### 4. Step-Based Message Rendering

Replace the current message-bubble-plus-action-cards layout with an inline step flow:

```
[Assistant Turn]
  [Thinking] (collapsible, auto-collapsed after turn completes)
    "Looking at your tasks and priorities..."
  [Text]
    "Let me set up your day."
  [Tool Step: create_task] ✓
    Creating task "Call Acme about invoice"
    Task created — priority: high, due: Feb 17
  [Tool Step: set_today] ✓
    Adding to Today list
    Added to Today
  [Tool Step: delete_task] ⚠
    Delete "Old draft" — requires confirmation
    [Approve] [Reject]
  [Text]
    "Done. Three items on your Today list."
```

Data model for renderer state:

```typescript
type TurnStep =
  | { kind: 'thinking'; content: string }
  | { kind: 'text'; content: string }
  | { kind: 'tool'; toolName: string; toolCallId: string; description: string;
      status: 'running' | 'success' | 'error' | 'confirmation_required';
      summary?: string; actionCard?: ChatActionCard }
```

The store accumulates steps during streaming. On `assistant_done`, thinking auto-collapses.

Action cards still exist in the data model — they still power approve/reject/undo. We just render them inline within the tool step instead of as floating cards below the message.

### 5. Tool Description Enrichment

Every tool gets a 2-4 sentence description with: trigger conditions, input expectations, and behavioral guidance.

```typescript
// Before
'Create a task or subtask and log an auditable task event.'

// After
'Create a new task. Use when the user asks to add, create, or capture a task, todo, or action item. Title must be concrete and actionable (e.g., "Call Acme about invoice"). If the request is vague, ask for clarification instead. Optional: priority, dueDate, client, parentId, status.'
```

### 6. System Prompt Tool Policy

Expand the policy section to explicitly encourage multi-step thinking:

- Think before acting — assess what tools are needed
- Chain tool calls when the task requires multiple steps
- Summarize what you did after tool execution
- If unsure about intent, ask — don't guess
- Use conversation history for context continuity

### 7. Persisted Step Data

Add `reasoningText` and `steps` to the existing `PersistedChatToolMetadata`:

```typescript
type PersistedChatToolMetadata = {
  requestId: string;
  modelId: string;
  actionCards: ChatActionCard[];
  toolExecutions: ChatToolExecutionSummary[];
  telemetry?: ChatTurnTelemetry;
  reasoningText?: string;       // NEW
  stepDescriptions?: string[];  // NEW — human-readable step summaries for history replay
};
```

On history load, reconstruct `TurnStep[]` from this metadata. No schema migration needed — just new optional fields in the same JSON blob.

---

## What We're NOT Doing

- Not renaming events (`assistant_done` stays `assistant_done`)
- Not removing action cards from the data model (they power undo/approve)
- Not creating 4 new component files (one inline renderer handles all step types)
- Not adding backward-compat event handling (no breaking changes)
- Not building separate persistence schema (extend existing metadata)
- Not making reasoning a separate phase (it's 10 lines of code)

---

## File Changes

| File | Change |
|------|--------|
| `chat.ts` | Constants, reasoning handling, description/summary in events |
| `tools.ts` | Enriched descriptions for all 15 tools |
| `systemPrompt.ts` | Expanded tool policy |
| `models.ts` | `supportsReasoning` flag per model |
| `types/chat.ts` | `reasoning` event, enhanced fields on existing events, `TurnStep`, extended metadata |
| `chatStore.ts` | Step accumulation, reasoning handling, step reconstruction from history |
| `ChatView.tsx` | Step-based rendering replacing bubble+cards |

---

## Risks

| Risk | Mitigation |
|------|-----------|
| Reasoning tokens unavailable for some models | Graceful no-op: no thinking section, everything else works |
| Larger context = slightly higher latency | M2.5 does 100 tok/s. 12K prompt adds ~2s. Fine. |
| Step rendering is a UI rewrite | Phase 1 (context budget) ships with zero UI changes for immediate gain |
| 25 tool steps = more cost | $0.01-0.04/turn at these model prices. Negligible. |

## Decisions

- Thinking auto-collapses after turn completes
- Steps persist in message metadata for history replay
- Action cards stay in data model, rendered inline in tool steps
