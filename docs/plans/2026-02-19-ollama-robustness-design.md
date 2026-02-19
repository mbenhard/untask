# Ollama Integration Robustness

**Date:** 2026-02-19
**Status:** Design (reviewed)

## Problem

Ollama performance in Untask is degraded in two key ways:

1. **Slow time-to-first-token (TTFT):** Ollama unloads models after 5 minutes of inactivity (default `keep_alive`). Reloading takes 3-8+ seconds depending on model size. No preloading occurs — the first chat message eats the full cold start.

2. **Tool calling breaks on some models:** The app uses `@ai-sdk/openai` with Ollama's OpenAI-compatible `/v1` endpoint. This means:
   - No `tool_choice` support (Ollama ignores it — both on `/v1` compat AND native API)
   - No `num_ctx` control (Ollama dynamically defaults based on VRAM: <24GB → 4096, 24-48GB → 32768; most 16GB Macs get 4096, too small for 11 tools + system prompt + history)
   - No JSON repair for malformed tool call responses
   - No access to native Ollama options (`keep_alive`, `repeat_penalty`, etc.)
   - Models like LFM2.5-1.2B-Thinking support tools natively (57% BFCLv3) but Ollama's template doesn't expose it, causing hard failures

## Design

Four changes, ordered by impact:

### 1. Switch Ollama provider to `ai-sdk-ollama`

Replace `@ai-sdk/openai` (with custom baseURL) with the dedicated `ai-sdk-ollama` package for Ollama connections. Keep `@ai-sdk/openai` for OpenAI/OpenRouter and `@ai-sdk/anthropic` for Anthropic — only the Ollama code path changes.

**Why:** `ai-sdk-ollama` gives us:
- **`num_ctx` control** — set to 16384 (fits tools + system prompt + 20 messages)
- **`keep_alive` control** — managed alongside preloading (30 minutes)
- **Cascade JSON repair** — enabled by default; `jsonrepair` first, then Ollama-specific `enhancedRepairText` (handles Python constants, smart quotes, markdown code blocks, etc.)
- **Native Ollama options** — `temperature`, `repeat_penalty`, `mirostat`, etc.
- **Uses Ollama's native `/api/chat`** — bypasses OpenAI compatibility limitations

**What changes:**
- `untask/src/main/ai/providers/ollama.ts` — rewrite to use `ai-sdk-ollama`
- `package.json` — add `ai-sdk-ollama` dependency, bump `ai` to `^6.0.89`
- `ProviderInstance` interface — unchanged, `languageModel()` still returns a Vercel AI SDK `LanguageModel`

**What stays the same:**
- `streamOrchestration.ts` — mostly unchanged (add `experimental_repairToolCall`, see §4)
- All other providers — untouched
- IPC layer, preload bridge, renderer — no changes needed
- Tool definitions — unchanged

**Compatibility:**
- `ai-sdk-ollama@3.7.1` requires `ai@^6.0.89` — app must bump from `^6.0.86` to `^6.0.89`
- `ai-sdk-ollama` depends on `ollama@^0.6.3` (official Ollama JS client) — new transitive dependency
- Requires Node.js >= 22 — Electron 40 uses Node 22.x, so this is satisfied

**Provider construction:**
```ts
import { ollama, createOllama } from 'ai-sdk-ollama';

// Default Ollama (localhost:11434)
const model = ollama(modelId, {
  options: { num_ctx: 16384 },
  keep_alive: '30m',
});

// Custom base URL
const customOllama = createOllama({ baseURL: userBaseUrl });
const model = customOllama(modelId, {
  options: { num_ctx: 16384 },
  keep_alive: '30m',
});
```

**Important:** `num_ctx` and `keep_alive` are set at model-instance creation time, not per `streamText()` call. However, `providerOptions: { ollama: { ... } }` can also pass options per-call if needed in future.

**`toolChoice` note:** Ollama's native API does NOT support `tool_choice` either — this is an Ollama limitation, not a compat-layer one. The AI SDK handles `toolChoice: 'required'` at the framework level by retrying until a tool call is produced. This is the same behavior as before — no regression, no improvement.

### 2. Model preloading & memory management

Load the selected Ollama model into memory when the user opens the chat view, not when they send their first message.

**Trigger:** Chat view component mounts → IPC call → main process fires preload.

**Implementation:** New `warmOllamaModel(modelId, baseUrl)` function that calls Ollama's native `/api/chat` with:
```json
{
  "model": "<modelId>",
  "messages": [],
  "keep_alive": "30m",
  "options": { "num_ctx": 16384 }
}
```

This loads the model into GPU/RAM without generating output. Ollama responds with `done_reason: "load"`.

**Critical:** The preload request MUST include `options: { num_ctx: 16384 }` matching the value used during chat. If `num_ctx` differs between preload and first chat request, Ollama fully reloads the model (it compares runner options), which defeats the preloading purpose entirely.

**Lifecycle:**
- Chat view opens → preload fires (model loads in ~2-3s for 1.2B, ~5-8s for 8B)
- User sends message → model is already warm, sub-second TTFT
- Each chat request passes `keep_alive: '30m'` (via ai-sdk-ollama model options), resetting the timer
- User leaves chat / 30 min idle → Ollama unloads naturally
- App quits → Ollama handles cleanup

**Also fires on:** provider switch to Ollama, model change while in chat view.

**Files:**
- New: `untask/src/main/ai/providers/ollamaWarmup.ts`
- Modified: `untask/src/types/ipc.ts` — add `OLLAMA_WARMUP` channel + request/result types
- Modified: `untask/src/main/ipc/chat.ts` — register new handler for warmup
- Modified: `untask/src/preload/index.ts` — expose `warmupOllama()` in chat API
- Modified: chat view component — call warmup on mount when provider is Ollama
- Modified: `untask/src/renderer/stores/chat/` — add provider selector (currently only model ID is exposed; warmup hook needs to know if Ollama is active)

### 3. Upfront tool support detection

When a user selects an Ollama model (in settings or model catalog), check whether it supports tool calling.

**Method:** Call `/api/show` with the model name. The response includes a `capabilities` array (e.g., `["completion", "tools"]`). Check for `"tools"` in the array.

This is reliable — Ollama determines tool support by checking if the model's template references a `tools` variable or if the model has a built-in parser with tool support (confirmed in Ollama source: `server/images.go`).

**If tools not supported:**
- Show a warning badge next to the model in the catalog: "No tool support"
- Add explanatory text: "This model can't manage tasks directly. Try qwen3 or llama3.1 for full features."
- Allow selection but the user knows what they're getting
- In chat, if tools fail on first attempt, show a clear error: "This model doesn't support task actions. Switch to a compatible model in Settings."

**If tools supported:** No indicator needed, everything works normally.

**Files:**
- Modified: `untask/src/main/ai/providers/ollamaDetection.ts` — add `/api/show` calls during detection, extend `OllamaModel` type with `supportsTools: boolean` and `capabilities: string[]`
- Modified: `untask/src/renderer/components/settings/ModelCatalogView.tsx` — show warning badge for models where `supportsTools === false`
- Modified: `untask/src/main/ai/errorClassification.ts` — improve error messages for Ollama-specific failures

### 4. Error handling & tool call repair

**`experimental_repairToolCall` in `streamText()`:**
The Vercel AI SDK provides an `experimental_repairToolCall` callback that fires when tool calls have invalid JSON, wrong schema, or reference unknown tools. Add this to the `streamText()` call in `streamOrchestration.ts` as a second layer of recovery on top of `ai-sdk-ollama`'s built-in JSON repair.

Strategy: use the re-ask approach — send the failed tool call back to the model to regenerate with the correct schema. This is especially valuable for Ollama models that produce near-valid tool calls.

**Malformed tool calls (existing):** `ai-sdk-ollama`'s cascade JSON repair handles most cases automatically (enabled by default). For remaining failures, the existing `prepareStep` callback already forces `toolChoice: 'none'` after a tool error, making the model fall back to text.

**Ollama-specific error patterns:** Add new patterns to `errorClassification.ts`:
- `"model 'x' not found"` → `model_not_found` (non-retryable): "This model is not installed on Ollama. Pull it in Settings → AI → Model."
- Context window exceeded errors
- Ollama connection refused / not running errors (more specific than generic network_error)

**First-run guidance:** When Ollama is first connected successfully, show a brief inline note in settings:
> "Ollama uses your local hardware for AI. Larger models (8B+) give more reliable results for task management."

## Implementation Order

1. **ai-sdk-ollama switch** — highest impact, unblocks num_ctx and JSON repair
2. **Model preloading** — eliminates cold start TTFT
3. **Tool support detection** — prevents user confusion with incompatible models
4. **Error handling & tool repair** — better recovery and messages

## Files Changed (complete list)

| File | Change |
|------|--------|
| `package.json` | Add `ai-sdk-ollama`, bump `ai` to `^6.0.89` |
| `src/main/ai/providers/ollama.ts` | Rewrite: `@ai-sdk/openai` → `ai-sdk-ollama` |
| `src/main/ai/providers/ollamaWarmup.ts` | **New:** `warmOllamaModel()` function |
| `src/main/ai/providers/ollamaDetection.ts` | Add `/api/show` tool capability check |
| `src/main/ai/streamOrchestration.ts` | Add `experimental_repairToolCall` to `streamText()` |
| `src/main/ai/errorClassification.ts` | Add Ollama-specific error patterns |
| `src/main/ipc/chat.ts` | Register `OLLAMA_WARMUP` handler |
| `src/types/ipc.ts` | Add `OLLAMA_WARMUP` channel + types |
| `src/preload/index.ts` | Expose `warmupOllama()` in chat API |
| `src/renderer/stores/chat/` | Add active provider selector |
| `src/renderer/components/chat/ChatView.tsx` | Call warmup on mount when Ollama is active |
| `src/renderer/components/settings/ModelCatalogView.tsx` | Show "No tool support" badge |

## Assumptions

- Ollama users have 16GB+ RAM (self-selected technical audience)
- `num_ctx: 16384` is a reasonable default for task management context
- 30-minute `keep_alive` balances responsiveness with memory respect
- Tool support is non-negotiable — models without it get a warning, not a fallback mode
- `ai-sdk-ollama` is stable enough for production (very active: 5 releases in Feb 2026, 18K weekly downloads)

## Resolved Questions

- **Does `ai-sdk-ollama` stream tool calls natively?** Yes — uses Ollama's streaming API, no `simulateStreaming` flag. Tool calls arrive via `chunk.message.tool_calls` in real-time.
- **Can `/api/show` reliably detect tool support?** Yes — the `capabilities` array includes `"tools"` when supported, determined by template inspection and built-in parser checks in Ollama source.
- **Should `num_ctx` be configurable?** No — hardcode 16384 for now. Can add as advanced setting later if needed.

## Risks

- **`ai-sdk-ollama` is a community package** (not Vercel-maintained). If it breaks or gets abandoned, we'd need to fork or revert to `@ai-sdk/openai`. Mitigated by: active maintenance, small surface area, and our provider abstraction making it easy to swap.
- **`num_ctx: 16384` across all models** may use more memory than necessary for small models. On 16GB+ machines this is fine, but worth monitoring.
- **`num_ctx` mismatch causes reload** — any future code that creates model instances with different `num_ctx` will trigger slow reloads. Must be consistent everywhere.
