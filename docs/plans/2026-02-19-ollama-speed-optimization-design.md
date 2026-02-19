# Ollama Speed Optimization Design

**Date**: 2026-02-19
**Goal**: Make the Ollama integration fast, reliable, and focused on quick task utility.

## Context

The Ollama assistant is a local-first quick task utility — querying tasks, creating/updating tasks, simple day planning. Speed is the priority. Cloud providers handle deep reasoning and complex work.

Current problems:
- Thinking mode can't be disabled for Qwen3 (`think: false` is unreliable per Ollama GitHub issues)
- `lfm2.5-thinking` outputs raw `<think>` tags as message text instead of using native reasoning API
- `emit_chips` tool calls rendered as raw text (small models can't reliably tool-call for chips)
- qwen3:4b with thinking takes 171s for a trivial query (4334 reasoning tokens, unlimited output)
- Recommended models list is outdated (includes thinking variants, poor tool-callers)
- No `num_predict` cap — Ollama defaults to unlimited token generation
- No `temperature` tuning — Ollama defaults to 0.8, too high for reliable tool calling

## 1. Update Recommended Models

Replace `RECOMMENDED_OLLAMA_MODELS` in `ModelCatalogView.tsx`.

**Old list**:
- `qwen3` (8B, thinking variant — can't disable thinking)
- `qwen3:4b` (thinking variant — 171s for simple queries)
- `llama3.1:8b` (decent but not top-tier for tool calling)
- `mistral` (7B, mediocre tool calling)
- `granite4-dense` (8B, poor tool calling benchmark)
- `lfm2.5-thinking` (outputs raw `<think>` tags)

**New list** (verified exact Ollama pull tags):

| Model | Tag | Size | Why |
|-------|-----|------|-----|
| LFM 2.5 Thinking | `lfm2.5-thinking` | 1.2B | #1 tool calling benchmark, ultra-fast, <1GB. Thinking output handled by our `<think>` tag parser (Section 3). |
| Phi-4 Mini | `phi4-mini` | 3.8B | #1 tool calling, no thinking mode at all, Microsoft |
| Qwen3 4B Instruct | `qwen3:4b-instruct` | 4B | #1 tool calling, instruct-2507 variant = never thinks |
| Qwen3 8B | `qwen3:8b` | 8B | Best quality at medium size. Original 2504 hybrid model; `think: false` works here. |
| Qwen3 30B MoE Instruct | `qwen3:30b-instruct` | 30B MoE (3B active) | 30B quality at 3B speed, ~68 tok/s, 19GB. instruct-2507 = never thinks. |

**Tag verification notes:**
- `lfm2.5:1.2b` (non-thinking) does NOT exist in Ollama's official library. Only `lfm2.5-thinking` is available. The `<think>` tag parser in Section 3 handles its thinking output gracefully.
- `qwen3:8b-instruct-2507` does NOT exist — the 2507 update only covers 4B, 30B-A3B, and 235B-A22B.
- `qwen3:4b` (default) points to the **thinking** variant. Must use `qwen3:4b-instruct` for non-thinking.
- `qwen3:30b` (default) points to the **thinking** variant. Must use `qwen3:30b-instruct`.

## 2. Disable Thinking for Ollama

Always pass `think: false` to the Ollama API. Remove all thinking configuration UI and logic.

**Remove**:
- `getOllamaThinkingSettings()` / `setOllamaThinkingSettings()` from `settingsService.ts`
- 4 IPC handlers for thinking settings in `ipc/settings.ts`
- Preload bridge: `ollama.getThinkingSettings` / `setThinkingSettings` / `getThinkingDefault` / `setThinkingDefault`
- Thinking mode/intensity UI section in `SettingsAI.tsx` (state: `thinkingEnabled`, `thinkingIntensity`, `isLoadingThinking`)
- `isThinkingCapableOllamaModel()` and `THINKING_MODEL_PATTERNS` from `models.ts`
- `SETTING_KEY_AI_OLLAMA_THINKING_DEFAULT` from `defaultSettings.ts`
- Related types in `ipc.ts`: `OllamaThinkingSettings`, `OllamaGetThinkingSettingsRequest`, `OllamaSetThinkingSettingsRequest`, `OllamaGetThinkingDefaultResult`, `OllamaSetThinkingDefaultRequest`, and 4 IPC channel constants
- Related types in `preload.d.ts`

**Change in `ollama.ts`**:
- Always set `think: false` (belt-and-suspenders; instruct models ignore it, hybrid models like qwen3:8b respect it)
- Remove all `getOllamaThinkingSettings()` / intensity logic
- Simplify to just:
  ```typescript
  return provider(modelId, {
    think: false,
    keep_alive: OLLAMA_KEEP_ALIVE,
    options: { num_predict: 1024, temperature: 0.2 },
  });
  ```

**Keep**: The `'reasoning'` stream event type and reasoning UI — cloud providers still use it, and the `<think>` tag parser (Section 3) feeds into it.

## 3. Add Ollama Inference Parameters (NEW)

Add `num_predict` and `temperature` to the Ollama provider options via the `options` field on `OllamaChatSettings`.

**`num_predict: 1024`** — Cap output tokens to prevent runaway generation.
- Ollama defaults to unlimited (`-1`). This is why qwen3:4b generated 4,334 reasoning tokens for "what's due today?"
- 1024 tokens (~750 words) is more than enough for task management responses
- Tool call JSON naturally completes well before this limit

**`temperature: 0.2`** — Low temperature for reliable tool calling.
- Ollama defaults to 0.8, which is too high for structured output and tool calls
- Lower temperature = more deterministic = fewer tool-calling errors = fewer retries = faster perceived speed
- 0.2 still allows slight variation in conversational responses

**No `num_ctx` change** — keep omitting it. Auto-sizing (32K on M2 Max 32GB) is correct. Explicitly setting it risks model reloads when switching between Ollama clients.

**Note**: `ai-sdk-ollama` already has `reliableToolCalling: true` as the default when tools are provided (maxRetries=2, forceCompletion=true, normalizeParameters=true). Our `experimental_repairToolCall` in streamOrchestration is complementary, not redundant.

## 4. Parse `<think>` Tags from Text into Reasoning UI

**Problem**: Some models (e.g., `lfm2.5-thinking`) output `<think>...</think>` tags as **regular text**, not through Ollama's native `message.thinking` field. The `ai-sdk-ollama` SDK only reads `message.thinking` for reasoning — it does NOT parse `<think>` tags from content text. So these tags show up as visible text in the chat message.

**Solution**: A text-to-reasoning reclassification state machine in `streamOrchestration.ts`, specifically in the `text-delta` handler (not `reasoning-delta` — that already works correctly for native reasoning).

**Implementation in `streamOrchestration.ts`** — in the `case 'text-delta':` block:

State machine with two states:
- `normal`: accumulate text, emit as `'token'` events
- `inThinking`: accumulate text, emit as `'reasoning'` events

Transitions:
- `normal` → `inThinking`: when `<think>` tag detected in accumulated text buffer
- `inThinking` → `normal`: when `</think>` tag detected

Edge cases:
- **Partial tags split across chunks**: buffer the last few characters when a `<` is seen but the tag isn't complete yet. Flush when tag completes or turns out not to be a think tag.
- **Unclosed `<think>`**: if stream ends while `inThinking`, treat remaining as reasoning (it's still valid thinking content)
- **Tag at stream start**: some models output `<think>` as the very first token. Handle by checking buffer before first emit.

The tag content (between `<think>` and `</think>`) is emitted as `'reasoning'` events, which the existing `chatStreamSlice.ts` already handles — it creates `{ kind: 'thinking', content }` steps displayed in the collapsible `ThinkingStep` UI component in `ChatView.tsx`.

**Strip the tags themselves** — neither `<think>` nor `</think>` should appear in any emitted event.

## 5. Better emit_chips for Ollama

### Inline Fallback Parsing (in `streamOrchestration.ts`)

The existing `extractInlineEmitChipsJson()` only matches `[emit_chips:{...}]` format. Add parsing for the `<emit_chips>...</emit_chips>` XML format that small models actually produce:

```typescript
// NEW: XML format
const xmlPattern = /<emit_chips>\s*(\{[\s\S]*?\})\s*<\/emit_chips>/;
```

Apply this in the same post-stream chip extraction phase where `extractInlineEmitChipsJson()` runs. Try JSON format first, then XML format, then fall back to the existing section heading + bullet list format.

Also strip the matched XML block from the output text (same as the existing JSON block stripping).

**Don't add more formats** — three is enough (JSON inline, XML, section heading). More would be overengineering.

### Prompting (no code change needed)

The current `emit_chips` tool description in `contextTools.ts` is already detailed. Small models fail at tool calling structure, not because they don't understand the intent. The inline parser is the real fix.

## 6. Warmup Cooldown

**Problem**: Logs show 3+ redundant warmup calls between requests. The warmup is triggered from `ChatView.tsx` on chat open/focus.

**Solution**: Add a simple timestamp cache in `ollamaWarmup.ts`:

```typescript
const lastWarmupAt = new Map<string, number>();
const WARMUP_COOLDOWN_MS = 60_000; // 60 seconds

export async function warmOllamaModel(modelId, baseUrl?) {
  const now = Date.now();
  const lastTime = lastWarmupAt.get(modelId) ?? 0;
  if (now - lastTime < WARMUP_COOLDOWN_MS) {
    return { ok: true }; // Model is still hot from keep_alive
  }
  // ... existing warmup logic ...
  lastWarmupAt.set(modelId, now);
}
```

The `keep_alive: '30m'` setting means the model stays loaded for 30 minutes after any request. A 60-second cooldown between warmups is conservative and safe.

## 7. Server-Side Optimization Hint (OPTIONAL)

Two Ollama server environment variables dramatically improve performance but can only be set by the user:

- **`OLLAMA_FLASH_ATTENTION=1`** — reduces VRAM usage, increases speed, zero quality loss
- **`OLLAMA_KV_CACHE_TYPE=q8_0`** — halves KV cache memory (requires flash attention)

Consider adding a small info tooltip or link in the Ollama settings section pointing users to these. Not a code change — just a UI hint. Low priority, can be done later.

## Files to Change

| File | Change |
|------|--------|
| `src/main/ai/models.ts` | Remove `isThinkingCapableOllamaModel()`, `THINKING_MODEL_PATTERNS` |
| `src/main/ai/providers/ollama.ts` | Always `think: false`, add `options: { num_predict: 1024, temperature: 0.2 }`, remove thinking settings logic |
| `src/main/ai/providers/ollamaWarmup.ts` | Add cooldown timestamp cache (60s) to skip redundant warmups |
| `src/main/ai/streamOrchestration.ts` | Add `<think>` tag state machine in `text-delta` handler, add XML `<emit_chips>` parsing in chip extraction |
| `src/main/defaultSettings.ts` | Remove `SETTING_KEY_AI_OLLAMA_THINKING_DEFAULT` |
| `src/main/ipc/settings.ts` | Remove 4 thinking IPC handlers + imports |
| `src/main/services/settingsService.ts` | Remove `OllamaThinkingSettings` type, 4 thinking functions |
| `src/preload/index.ts` | Remove `ollama.getThinkingSettings/setThinkingSettings/getThinkingDefault/setThinkingDefault` |
| `src/renderer/components/settings/SettingsAI.tsx` | Remove thinking state + UI section (`thinkingEnabled`, `thinkingIntensity`, `isLoadingThinking`) |
| `src/renderer/components/settings/ModelCatalogView.tsx` | Update `RECOMMENDED_OLLAMA_MODELS` to new list |
| `src/types/ipc.ts` | Remove 4 thinking IPC channels, 5 thinking types |
| `src/types/preload.d.ts` | Remove thinking type imports and `ollama.*` thinking methods |

**Files NOT changed** (confirmed no changes needed):
- `chatStreamSlice.ts` — already handles `'reasoning'` events correctly
- `chatStoreTypes.ts` — types are fine as-is
- `ChatView.tsx` — `ThinkingStep` and `StreamingIndicator` components work correctly
- `contextTools.ts` — emit_chips tool definition stays as-is
- `tools/index.ts` — tool registry stays as-is
- `ipc/chat.ts` — warmup call flow stays as-is

## Implementation Order

1. **Inference params** (Section 3) — `num_predict` + `temperature` in `ollama.ts`. Immediate speed win.
2. **Remove thinking** (Section 2) — delete code across 10+ files. Big cleanup.
3. **`<think>` tag parser** (Section 4) — state machine in `streamOrchestration.ts`. Handles `lfm2.5-thinking`.
4. **Update model list** (Section 1) — update `ModelCatalogView.tsx`.
5. **Warmup cooldown** (Section 6) — timestamp cache in `ollamaWarmup.ts`.
6. **XML chip parsing** (Section 5) — regex in `streamOrchestration.ts`.
