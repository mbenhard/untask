# AI Chat Quality Fixes

**Date**: 2026-02-17
**Status**: Implementing

## Problems

1. **Double response** — AI produces two message bubbles per turn when multi-step streaming generates text → tool → text
2. **AI misinterprets intent** — `shouldRequireToolChoice` forces tool calls too aggressively; system prompt "Action Bias" pushes act-before-think
3. **Autopilot still asks approval** — Hard overrides fire even in autopilot mode for non-destructive actions (updating completed tasks)
4. **Approval UI is ugly** — Shows raw UUIDs, system jargon, monospace text
5. **"Memory updated" ghost** — Background knowledge extractor shows badge but AI denies updating memory
6. **Tool result noise** — Read-only tool calls (list_tasks, get_task) clutter conversation

## Fixes

### 1. Double Response (chatStore.ts)

Merge all consecutive `text` steps into a single step during finalization. Currently `collapseDuplicateTextSteps` only collapses exact duplicates — change it to merge all adjacent text steps.

### 2. AI Intent Misinterpretation (chat.ts + systemPrompt.ts)

**chat.ts**: Tighten `shouldRequireToolChoice` — only force tool use for very explicit commands where intent is unambiguous. Remove the broad TASK_MUTATION_VERB_PATTERN + TASK_ENTITY_PATTERN combo that catches too many false positives.

**systemPrompt.ts**: Rewrite "Action Bias" section to "Think, then act" — reason about intent before executing. Add instruction to confirm ambiguous requests.

### 3. Autopilot Hard Overrides (autonomy.ts)

- In autopilot mode, only `delete_task` requires hard confirmation
- Reclassify `isCompletedRewrite` (updating a completed task) from `critical` to `medium`
- Remove `isCompletedRewrite` and `isBulkWrite` from `requiresHardConfirmation`

### 4. Approval UI (ChatView.tsx)

- ToolStep pending cards: show human-readable action description with task title, not UUIDs
- Risk badge rationale: "Changing a completed task" not system jargon
- Confirmation dialog: cleaner layout, task name bold, "Do it" / "Cancel"
- No monospace for action descriptions

### 5. Memory Updated Ghost (knowledgeExtractor.ts)

Remove the `memory_updated` event emission from background knowledge extraction. The badge should only appear when the AI explicitly calls `update_memory` during a turn.

### 6. Tool Result Noise (ChatView.tsx)

Hide read-only tool steps from rendering. Only show mutation tool steps (create_task, update_task, complete_task, delete_task, move_task, set_today, edit_note, parse_notes, update_identity, update_memory, undo_last_action).
