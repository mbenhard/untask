# AI Chat Simplification Design

**Date:** 2026-02-17
**Status:** Approved
**Goal:** Fix three pain points — redundant proactive messages, stuck streaming indicator, and unclear loading feedback.

## Problem

1. **Redundant proactive messages** — The proactive loop fires `onTaskChange()` 2 seconds after any task mutation. When the user interacts via chat and the assistant completes a task, the proactive loop re-evaluates and fires a `deadline_approaching` or `overdue_accumulation` trigger that duplicates what the assistant just said.

2. **Stuck 3-dots indicator** — `runAssistantStream` iterates the LLM stream with no inactivity timeout. A hung provider connection keeps the streaming placeholder (bouncing dots) visible forever. No cleanup mechanism exists.

3. **No clear loading feedback** — When the user sends a message, the only visual change is the send button becoming a stop icon. The bouncing dots are inside a chat bubble that may not be visible without scrolling.

## Design

### 1. Strip Proactive System to Time Reminders Only

**Remove:**
- 30-minute `setInterval` evaluation loop in `ProactiveLoop`
- `evaluate()` method and all its supporting logic
- `onTaskChange()` task-mutation-triggered re-evaluation (but keep task change subscription for rescheduling reminders only)
- `onAppOpen()` morning briefing logic + activation handler calls in `index.ts`
- Trigger types: `morning_briefing`, `overdue_accumulation`, `empty_today_list`, `deadline_approaching`
- Cooldown system for removed trigger types (keep only `time_reminder` per-task cooldown)
- `TRIGGER_TEMPLATES` for removed triggers (keep only `time_reminder`)
- `LAST_MORNING_BRIEFING_KEY` setting constant and its usage

**Keep:**
- `time_reminder` trigger — fires at exact due date/time
- `scheduleUpcomingReminders()` — setTimeout per task with due date
- Native OS notifications for reminders
- In-chat proactive message rendering (chatStore proactive placeholder logic)
- Task change subscription — but ONLY for rescheduling reminders
- `fireProactiveMessage()` for time_reminder only
- Singleton init/stop lifecycle

**Files to delete:**
- `flusk/src/main/assistant/proactiveTriggers.ts` — evaluation logic, fully replaced
- `flusk/src/main/assistant/proactiveTriggers.test.ts` — tests for deleted file
- `flusk/src/main/assistant/proactivePolicy.ts` — parallel evaluation system only handles `empty_today_list` and `overdue_accumulation`, both removed

**Files to modify:**
- `flusk/src/main/assistant/proactiveLoop.ts` — simplify: remove interval, evaluate(), onAppOpen(), removed triggers/templates/cooldowns
- `flusk/src/main/index.ts` — remove `onAppOpen()` calls (lines 194, 206-209), simplify activation handler
- `flusk/src/main/ipc.ts` — remove `SETTINGS_EVALUATE_PROACTIVE_TRIGGERS` handler (lines 420-427) and its import of `evaluateProactiveTriggerPolicy`
- `flusk/src/preload/index.ts` — remove `evaluateProactiveTriggers` function (lines 128-134) and type imports (lines 43-44)
- `flusk/src/types/preload.d.ts` — remove type declarations (lines 40-41, 93-94)
- `flusk/src/types/ipc.ts` — remove `SETTINGS_EVALUATE_PROACTIVE_TRIGGERS` channel constant (line 58) and payload type aliases (lines 127-128)
- `flusk/src/types/assistant.ts` — narrow `ProactiveTriggerType` to just `'time_reminder'`; remove dead types: `ProactiveTriggerAction`, `ProactiveTriggerRecommendation`, `ProactiveTriggerEvaluation`, `ProactiveTriggerRequest`, `ProactiveTriggerResult`
- `flusk/src/main/ai/systemPrompt.ts` — clean up minor "proactive interventions" reference (line 240)

### 2. Fix Stuck Streaming Indicator

**Stream inactivity timeout (main process):**
- Add 90-second inactivity timeout in `runAssistantStream`
- On each chunk from `fullStream`, reset a timer
- If 90s pass with no chunks, abort and emit error event
- Error classification: `provider_error`, retryable

**Placeholder cleanup guard (renderer):**
- When a proactive streaming placeholder is created in `applyStreamEvent`, start a 2-minute setTimeout
- If placeholder still exists with no content after 2 minutes, auto-remove it
- Belt-and-suspenders for edge cases (main process crash, IPC break)

**Files changed:**
- `flusk/src/main/ai/chat.ts` — add inactivity timeout to `runAssistantStream` for-await loop
- `flusk/src/renderer/stores/chatStore.ts` — add placeholder cleanup timer for proactive inFlight entries

### 3. Subtle Input Loading Indicator

**Change:**
- When `isSending` is true, show a pulsing "Thinking..." label in the input footer
- Positioned near the input area, always visible without scrolling
- Uses existing `isSending` state, no new state needed
- Disappears when response completes or stream is canceled

**Files changed:**
- `flusk/src/renderer/components/layout/ChatInput.tsx` — add thinking indicator when `isSending`

## Non-Goals

- Not changing the chat UI layout or message rendering
- Not adding new proactive trigger types
- Not changing the AI model or prompt structure
- Not modifying the tool execution pipeline

## Full File Impact Summary

| File | Action |
|------|--------|
| `main/assistant/proactiveTriggers.ts` | Delete |
| `main/assistant/proactiveTriggers.test.ts` | Delete |
| `main/assistant/proactivePolicy.ts` | Delete |
| `main/assistant/proactiveLoop.ts` | Simplify (keep reminders only) |
| `main/index.ts` | Remove onAppOpen calls |
| `main/ipc.ts` | Remove evaluate-proactive-triggers handler |
| `main/ai/chat.ts` | Add stream inactivity timeout |
| `main/ai/systemPrompt.ts` | Minor prompt text cleanup |
| `preload/index.ts` | Remove evaluateProactiveTriggers + imports |
| `types/preload.d.ts` | Remove proactive trigger type declarations |
| `types/ipc.ts` | Remove channel constant + payload types |
| `types/assistant.ts` | Narrow ProactiveTriggerType, remove dead types |
| `renderer/stores/chatStore.ts` | Add placeholder cleanup timer |
| `renderer/components/layout/ChatInput.tsx` | Add thinking indicator |

## Testing

1. **Proactive simplification:** Verify no proactive messages fire except time reminders. Complete a task via chat and confirm no duplicate assistant messages.
2. **Stuck dots:** Simulate a provider timeout (disconnect network mid-stream) and verify dots clear after 90s with an error message.
3. **Loading indicator:** Send a message and verify "Thinking..." appears near input, disappears on response.
4. **Type check:** Run `tsc --noEmit` to confirm no broken imports from deleted files.
