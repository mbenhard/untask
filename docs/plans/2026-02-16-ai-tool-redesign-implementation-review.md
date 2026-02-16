# Implementation Review

## Plan Path

`docs/plans/2026-02-16-ai-tool-redesign.md`

## Traceability Summary

- `1a Fix task blindness in live context`: implemented in `flusk/src/main/assistant/contextCompiler.ts:414`, `flusk/src/main/assistant/contextCompiler.ts:433`, `flusk/src/main/assistant/contextCompiler.ts:642`.
- `1b Add list_tasks + service filters + read-only classification`: implemented in `flusk/src/main/ai/tools.ts:760`, `flusk/src/main/services/taskService.ts:77`, `flusk/src/main/ai/autonomy.ts:253`.
- `1c Add get_task`: implemented in `flusk/src/main/ai/tools.ts:793`, including subtask lookup in `flusk/src/main/ai/tools.ts:803`.
- `2a Add Action Bias directive`: implemented in `flusk/src/main/ai/systemPrompt.ts:66`.
- `2b Broaden shouldRequireToolChoice`: partially implemented in `flusk/src/main/ai/chat.ts:246` with added verb/pronoun/confirmation/web patterns.
- `2c Add task title -> ID resolution guidance`: implemented in `flusk/src/main/ai/systemPrompt.ts:83`.
- `3a/3b Model-native web search`: partial with blocking defect; model metadata and prompt wiring were added (`flusk/src/main/ai/models.ts:20`, `flusk/src/main/ai/systemPrompt.ts:46`) but tool injection in `flusk/src/main/ai/chat.ts:667` is not AI SDK-compatible.
- `3c Add fetch_url with security constraints`: partial implementation in `flusk/src/main/ai/tools.ts:845` (timeout/content-type/size checks exist, SSRF/body-limit details incomplete).
- `4 Model catalog changes`: implemented in `flusk/src/main/ai/models.ts:20`.

## Findings (by severity)

- `P0` Blocking runtime failure for web-search models.
  - Evidence: `flusk/src/main/ai/chat.ts:667` and `flusk/src/main/ai/chat.ts:673` inject raw tool objects with `type: 'builtin_function'` and `type: 'web_search_20250305'`.
  - Impact: AI SDK `streamText` rejects unsupported tool types before provider call, breaking chat turns when `supportsWebSearch` is true (default model includes this).
  - Repro evidence: `node --input-type=module ... streamText(... tools: { $web_search: { type: 'builtin_function', ... } })` throws `Unsupported tool type: builtin_function`.
  - Root cause detail: `flusk/node_modules/ai/dist/index.js:1885` throws on tool types outside `function|provider|dynamic`.

- `P1` Web-search intent forces required tool use for generic questions, including unsupported models.
  - Evidence: `flusk/src/main/ai/chat.ts:255` defines broad `"what is|who is|..."` pattern, `flusk/src/main/ai/chat.ts:285` returns `true`, and `flusk/src/main/ai/chat.ts:616` sets `toolChoice: 'required'`.
  - Impact: text-only fallback is prevented for normal Q&A; this conflicts with unsupported-model guidance in `flusk/src/main/ai/systemPrompt.ts:60` and increases spurious tool calls.

- `P1` `fetch_url` SSRF protection is bypassable via DNS-resolved hostnames.
  - Evidence: `flusk/src/main/ai/tools.ts:831` only checks literal hostname patterns and never resolves DNS.
  - Impact: attacker-controlled domains resolving to private ranges can bypass private IP guards and probe internal services.

- `P2` Response-size cap is enforced after full body download.
  - Evidence: `flusk/src/main/ai/tools.ts:875` reads full `arrayBuffer()` before checking `FETCH_MAX_BODY_BYTES` at `flusk/src/main/ai/tools.ts:876`.
  - Impact: large responses are fully downloaded into memory, violating the stated "cap before extraction" requirement and increasing memory/network risk.

- `P2` Test coverage does not cover the newly added high-risk paths.
  - Evidence: `flusk/src/main/ai/tools.test.ts:82` only exercises `create_task`; no assertions for `list_tasks`, `get_task`, `fetch_url`, SSRF guards, or web-search tool injection compatibility.
  - Impact: the blocking regression above was not caught by automated tests.

## Improvements Applied

- None in this pass (audit-only; findings require follow-up implementation decisions).

## Test Delta
- Before:
  - `npm run typecheck` (initial run): failed in `flusk/src/main/ipc.ts` with `OpenDialogOptions` type mismatch.
  - `npm run test -- src/main/ai/chat.test.ts src/main/ai/tools.test.ts`: pass (`27 passed`).
- After:
  - `npm run typecheck`: pass.
  - `npm run test -- src/main/ai/chat.test.ts src/main/ai/tools.test.ts`: pass (`27 passed`).
  - Runtime repro checks:
    - `streamText` + `builtin_function` injected tool -> `Unsupported tool type: builtin_function`.
    - `streamText` + `web_search_20250305` injected tool -> `Unsupported tool type: web_search_20250305`.
- Gaps:
  - No end-to-end tests with live OpenRouter credentials for Kimi/Claude native web-search behavior.
  - No security tests for DNS-based SSRF bypass or streaming byte-limit enforcement in `fetch_url`.

## Verification Run

- `npm run typecheck`
- `npm run test -- src/main/ai/chat.test.ts src/main/ai/tools.test.ts`
- `node --input-type=module` reproducibility probes for injected web-search tool types

## Verdict
FAIL

## LESSONS_LEARNED
1. Raw provider tool objects cannot be injected into AI SDK `ToolSet`; only supported tool types should enter `streamText`.
2. Forcing `toolChoice: required` on broad question patterns can regress normal Q&A and unsupported-model behavior.
3. SSRF controls must include hostname resolution and pre-download size enforcement, not just literal host regex checks.
