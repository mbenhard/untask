# AI Chat Fix — Design Doc

**Date:** 2026-02-16
**Problem:** AI assistant is slow, loops on simple requests, leaks control tokens, and cannot be stopped.

## Root Cause

The system gives budget models bad feedback loops (title validation rejects simple input → model spirals trying to fix it) and no programmatic guardrails (`prepareStep` not used). The default model (MiniMax M2.5) leaks internal control tokens.

## Changes

### 1. Kill Title Quality Gate

**File:** `src/main/ai/tools.ts`

Remove `assessCreateTaskTitle` and all references. The `create_task` tool should accept whatever title the model sends. If the user says "do laundry", that's the title.

- Delete `assessCreateTaskTitle` function
- Delete `AMBIGUOUS_TASK_TITLE_SET` constant
- Delete `TASK_ACTION_VERBS` constant
- Remove the quality check from `createTaskTool.execute` — go straight to `createTask(input, 'ai')`

### 2. Fix Error Formatting

**File:** `src/main/ai/tools.ts`

In `createSdkTools`, change the error return to include an anti-retry instruction:

```typescript
// Before
return { status: 'error', message: result.error.message };

// After
return { status: 'error', message: `${result.error.message} — Do not retry this tool. Tell the user what happened.` };
```

### 3. Add `prepareStep` to `streamText`

**File:** `src/main/ai/chat.ts`

Add a `prepareStep` hook to the `streamText` call that:

1. **Tracks failed tools** — if any tool errored (via `tool-error` part or `output.status === 'error'`), force `toolChoice: 'none'` so the model responds with text.
2. **Detects same-tool repeats** — if the same tool was called in two consecutive steps, force `toolChoice: 'none'`.
3. **Relaxes `toolChoice`** — after the first step, switch from `'required'` to `'auto'`.

### 4. Add Tool Error Policy to System Prompt

**File:** `src/main/ai/systemPrompt.ts`

Add a "Tool Error Policy" section:
- If a tool call fails, do NOT retry it. Tell the user what happened.
- Never create and then delete the same resource in one turn.
- After completing a tool action, summarize the result and stop.

### 5. Switch Default Model to Kimi K2.5

**File:** `src/main/ai/models.ts`

Change `DEFAULT_MODEL_ID` from `minimax/minimax-m2.5` to `moonshotai/kimi-k2.5`. Set `defaultSelected: true` on Kimi, `false` on MiniMax.

### 6. Add Cancel/Stop Button

**Files:** `src/types/ipc.ts`, `src/main/ipc.ts`, `src/preload/index.ts`, `src/types/preload.d.ts`, `src/renderer/stores/chatStore.ts`, `src/renderer/components/chat/ChatView.tsx`

Wire the existing `cancelActiveChatTurns()` to the UI:

1. Add `CHAT_CANCEL` to IPC channels
2. Register `ipcMain.handle` for it in ipc.ts
3. Expose `chat.cancel()` in preload bridge
4. Add type definition
5. Add `cancelStream` action to chatStore
6. Add stop button to ChatView (visible during streaming, replaces "Streaming..." text)

### 7. Update Tests

Update `chat.test.ts` — remove any tests that reference `assessCreateTaskTitle`. Add test for the `prepareStep` logic if feasible. Update `chatStore.test.ts` mock to include `cancel` method.
