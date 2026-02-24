import { app } from 'electron';

import { resolveBaseUrl } from './ollamaDetection';
import { OLLAMA_KEEP_ALIVE } from './ollama';

const inflight = new Map<string, Promise<{ ok: boolean; error?: string }>>();
const lastWarmupAt = new Map<string, number>();
const WARMUP_COOLDOWN_MS = 60_000; // 60 seconds — model stays loaded via keep_alive: 30m

/**
 * Preloads an Ollama model into GPU/RAM by sending an empty chat request.
 * Ollama responds with `done_reason: "load"` and keeps the model warm.
 *
 * Uses deduplication: concurrent warmup calls for the same model reuse a
 * single Ollama request. A 60-second cooldown skips redundant warmups since
 * the model stays loaded via keep_alive.
 *
 * CRITICAL: num_ctx is intentionally omitted to match chat requests (letting
 * Ollama auto-size). If they differ, Ollama fully reloads the model.
 */
export async function warmOllamaModel(
  modelId: string,
  baseUrl?: string,
): Promise<{ ok: boolean; error?: string }> {
  const resolved = baseUrl?.trim() || resolveBaseUrl();
  const isDev = !app.isPackaged;
  const t0 = isDev ? performance.now() : 0;
  const key = `${modelId}@${resolved}`;

  // Cooldown: skip if model was warmed up recently
  const now = Date.now();
  const lastTime = lastWarmupAt.get(key) ?? 0;
  if (now - lastTime < WARMUP_COOLDOWN_MS) {
    if (isDev) {
      console.log(`[ollama-warmup] cooldown skip: model=${modelId} (${Math.round((now - lastTime) / 1000)}s ago)`);
    }
    return { ok: true };
  }

  const existing = inflight.get(key);
  if (existing) {
    if (isDev) {
      console.log(`[ollama-warmup] reusing in-flight: model=${modelId}`);
    }
    return existing;
  }

  if (isDev) {
    console.log(`[ollama-warmup] starting: model=${modelId} num_ctx=auto`);
  }

  const doWarmup = async (): Promise<{ ok: boolean; error?: string }> => {
    try {
      const response = await fetch(`${resolved.replace(/\/$/, '')}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelId,
          messages: [],
          keep_alive: OLLAMA_KEEP_ALIVE,
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
      lastWarmupAt.set(key, Date.now());
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const fullError = `Ollama warmup error: ${message}`;
      if (isDev) {
        console.log(`[ollama-warmup] error: ${(performance.now() - t0).toFixed(0)}ms — ${fullError}`);
      }
      return { ok: false, error: fullError };
    }
  };

  const promise = doWarmup();
  inflight.set(key, promise);
  promise.finally(() => inflight.delete(key));
  return promise;
}
