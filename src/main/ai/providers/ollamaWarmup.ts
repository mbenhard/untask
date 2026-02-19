import { app } from 'electron';

import { resolveBaseUrl } from './ollamaDetection';
import { OLLAMA_KEEP_ALIVE, OLLAMA_NUM_CTX } from './ollama';

/**
 * Preloads an Ollama model into GPU/RAM by sending an empty chat request.
 * Ollama responds with `done_reason: "load"` and keeps the model warm.
 *
 * CRITICAL: The `num_ctx` value MUST match what is used during actual chat
 * requests. If they differ, Ollama fully reloads the model, defeating the
 * preloading purpose entirely.
 */
export async function warmOllamaModel(
  modelId: string,
  baseUrl?: string,
): Promise<{ ok: boolean; error?: string }> {
  const resolved = baseUrl?.trim() || resolveBaseUrl();
  const isDev = !app.isPackaged;
  const t0 = isDev ? performance.now() : 0;

  if (isDev) {
    console.log(`[ollama-warmup] starting: model=${modelId} num_ctx=${OLLAMA_NUM_CTX}`);
  }

  try {
    const response = await fetch(`${resolved.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelId,
        messages: [],
        keep_alive: OLLAMA_KEEP_ALIVE,
        options: { num_ctx: OLLAMA_NUM_CTX },
        stream: false,
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      const error = `Ollama warmup failed (${response.status}): ${text}`;
      if (isDev) {
        console.log(`[ollama-warmup] failed: ${(performance.now() - t0).toFixed(0)}ms — ${error}`);
      }
      return { ok: false, error };
    }

    if (isDev) {
      console.log(`[ollama-warmup] done: ${(performance.now() - t0).toFixed(0)}ms`);
    }
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const fullError = `Ollama warmup error: ${message}`;
    if (isDev) {
      console.log(`[ollama-warmup] error: ${(performance.now() - t0).toFixed(0)}ms — ${fullError}`);
    }
    return { ok: false, error: fullError };
  }
}
