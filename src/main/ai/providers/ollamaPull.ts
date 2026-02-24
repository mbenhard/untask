import { resolveBaseUrl, clearOllamaDetectionCache } from './ollamaDetection';
import type { OllamaPullProgressPayload } from '../../../types/ipc';

// ─── State ───────────────────────────────────────────────────────────────────

let activePull: { model: string; controller: AbortController } | null = null;

// ─── Pull ────────────────────────────────────────────────────────────────────

export const pullOllamaModel = async (
  model: string,
  emit: (progress: OllamaPullProgressPayload) => void,
): Promise<{ ok: boolean; error?: string }> => {
  if (activePull) {
    return { ok: false, error: `Already pulling ${activePull.model}. Cancel it first.` };
  }

  const controller = new AbortController();
  activePull = { model, controller };

  const baseUrl = resolveBaseUrl();

  try {
    emit({ model, status: 'pulling manifest' });

    const response = await fetch(`${baseUrl}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: model }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      const error = `Ollama returned ${response.status}: ${body}`.trim();
      emit({ model, status: 'error', error });
      return { ok: false, error };
    }

    if (!response.body) {
      emit({ model, status: 'error', error: 'No response body from Ollama' });
      return { ok: false, error: 'No response body from Ollama' };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length === 0) continue;

        try {
          const json = JSON.parse(trimmed) as {
            status?: string;
            digest?: string;
            total?: number;
            completed?: number;
            error?: string;
          };

          if (json.error) {
            emit({ model, status: 'error', error: json.error });
            return { ok: false, error: json.error };
          }

          const percent =
            typeof json.total === 'number' && json.total > 0 && typeof json.completed === 'number'
              ? Math.round((json.completed / json.total) * 100)
              : undefined;

          emit({
            model,
            status: json.status ?? 'downloading',
            digest: json.digest,
            total: json.total,
            completed: json.completed,
            percent,
          });
        } catch {
          // Skip malformed JSON lines
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim().length > 0) {
      try {
        const json = JSON.parse(buffer.trim()) as { status?: string; error?: string };
        if (json.error) {
          emit({ model, status: 'error', error: json.error });
          return { ok: false, error: json.error };
        }
      } catch {
        // Ignore
      }
    }

    clearOllamaDetectionCache();
    emit({ model, status: 'success' });
    return { ok: true };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      emit({ model, status: 'error', error: 'Pull cancelled' });
      return { ok: false, error: 'Pull cancelled' };
    }
    const message = err instanceof Error ? err.message : 'Unknown error during pull';
    emit({ model, status: 'error', error: message });
    return { ok: false, error: message };
  } finally {
    activePull = null;
  }
};

// ─── Cancel ──────────────────────────────────────────────────────────────────

export const cancelOllamaPull = (): void => {
  if (activePull) {
    activePull.controller.abort();
  }
};
