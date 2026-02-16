# AI Chat Fix — Execution Plan

**Design:** `docs/plans/2026-02-16-ai-chat-fix-design.md`

## Batch 1: Core Fixes (can run in parallel)

### Task 1: Kill title quality gate
**File:** `src/main/ai/tools.ts`
1. Delete `AMBIGUOUS_TASK_TITLE_SET` constant (lines 124-133)
2. Delete `TASK_ACTION_VERBS` constant (lines 135-151)
3. Delete `assessCreateTaskTitle` function (lines 153-190)
4. In `createTaskTool.execute`, remove the quality check block (lines 342-352) — go straight from function start to `createTask(input, 'ai')`
5. Verify: `npx tsc --noEmit` passes

### Task 2: Fix error formatting in createSdkTools
**File:** `src/main/ai/tools.ts`
1. In `createSdkTools` (line 1048), change the error return:
   - From: `return { status: 'error', message: result.error.message };`
   - To: `return { status: 'error', message: \`\${result.error.message} — Do not retry this tool. Tell the user what happened.\` };`
2. Verify: `npx tsc --noEmit` passes

### Task 3: Add prepareStep to streamText
**File:** `src/main/ai/chat.ts`
1. Add a `prepareStep` property to the `streamText` call (after line 583):
   ```typescript
   prepareStep: async ({ steps }) => {
     const failedTools = new Set<string>();
     const toolCallsByStep: string[][] = [];

     for (const step of steps) {
       const stepToolNames: string[] = [];
       for (const part of step.content) {
         if (part.type === 'tool-call') stepToolNames.push(part.toolName);
         if (part.type === 'tool-error') failedTools.add(part.toolName);
         if (
           part.type === 'tool-result' &&
           typeof part.output === 'object' && part.output !== null &&
           'status' in part.output && part.output.status === 'error'
         ) {
           failedTools.add(part.toolName);
         }
       }
       toolCallsByStep.push(stepToolNames);
     }

     // If any tool failed, force text response
     if (failedTools.size > 0) {
       return { toolChoice: 'none' as const };
     }

     // Detect same tool in consecutive steps (spiral)
     if (toolCallsByStep.length >= 2) {
       const last = toolCallsByStep[toolCallsByStep.length - 1];
       const prev = toolCallsByStep[toolCallsByStep.length - 2];
       if (last.some(name => prev.includes(name))) {
         return { toolChoice: 'none' as const };
       }
     }

     // After first step, relax toolChoice
     if (steps.length > 0) {
       return { toolChoice: 'auto' as const };
     }

     return {};
   },
   ```
2. Verify: `npx tsc --noEmit` passes

### Task 4: Add anti-loop policy to system prompt
**File:** `src/main/ai/systemPrompt.ts`
1. Add after the "Tool Selection" subsection:
   ```
   ### Tool Error Policy
   - If a tool call returns an error, do NOT retry it. Inform the user what went wrong.
   - Never create a resource and then immediately delete or modify it in the same turn.
   - After executing a tool, summarize the result concisely and wait for user input.
   ```
2. Verify: `npx tsc --noEmit` passes

### Task 5: Switch default model to Kimi K2.5
**File:** `src/main/ai/models.ts`
1. Change `DEFAULT_MODEL_ID` from `'minimax/minimax-m2.5'` to `'moonshotai/kimi-k2.5'`
2. In `MODEL_CATALOG`, set `defaultSelected: false` on minimax entry, `defaultSelected: true` on kimi entry
3. Verify: `npx tsc --noEmit` passes

## Batch 2: Cancel/Stop Button

### Task 6: Wire cancel IPC
**Files:** `src/types/ipc.ts`, `src/main/ipc.ts`, `src/preload/index.ts`, `src/types/preload.d.ts`
1. In `src/types/ipc.ts`, add `CHAT_CANCEL: 'chat:cancel'` to `IPC_CHANNELS`
2. In `src/main/ipc.ts`, add handler:
   ```typescript
   ipcMain.handle(IPC_CHANNELS.CHAT_CANCEL, () => {
     try { cancelActiveChatTurns(); }
     catch (e) { console.error('[ipc] CHAT_CANCEL:', e); throw e; }
   });
   ```
3. In `src/preload/index.ts`, add to the chat object:
   ```typescript
   cancel: () => ipcRenderer.invoke(IPC_CHANNELS.CHAT_CANCEL),
   ```
4. In `src/types/preload.d.ts`, add `cancel: () => Promise<void>` to the chat interface
5. Verify: `npx tsc --noEmit` passes

### Task 7: Add cancelStream to chatStore + stop button to ChatView
**Files:** `src/renderer/stores/chatStore.ts`, `src/renderer/components/chat/ChatView.tsx`
1. In chatStore, add `cancelStream` action:
   ```typescript
   cancelStream: async () => {
     await window.flusk.chat.cancel();
     // Mark all in-flight messages as done
     const { inFlightByRequestId, messages } = get();
     const updatedMessages = messages.map((msg) => {
       if (msg.isStreaming) {
         return { ...msg, isStreaming: false };
       }
       return msg;
     });
     set({
       messages: updatedMessages,
       isSending: false,
       inFlightByRequestId: {},
     });
   },
   ```
2. In ChatView, add a stop button that appears when streaming:
   - Import `Square` (stop icon) from lucide-react
   - Replace the "Streaming..." / "Waiting for assistant..." indicators with a clickable stop button
   - Wire it to `useChatStore((s) => s.cancelStream)`
3. Verify: `npx tsc --noEmit` passes

## Batch 3: Tests + Cleanup

### Task 8: Update tests
**Files:** `src/main/ai/chat.test.ts`, `src/renderer/stores/chatStore.test.ts`
1. Remove any imports/tests referencing `assessCreateTaskTitle`
2. Add `cancel` mock to `createMockChatApi` in chatStore.test.ts
3. Run: `npx vitest run src/main/ai/chat.test.ts src/renderer/stores/chatStore.test.ts`
4. All tests must pass

## Verification

After all tasks:
1. `npx tsc --noEmit` (both main and renderer) — no type errors
2. `npx vitest run` — all tests pass
3. `npx eslint src/main/ai/chat.ts src/main/ai/tools.ts src/main/ai/systemPrompt.ts src/main/ai/models.ts src/renderer/stores/chatStore.ts src/renderer/components/chat/ChatView.tsx` — no lint errors
