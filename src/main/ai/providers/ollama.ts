import { createOllama } from 'ai-sdk-ollama';

import type { ProviderInstance } from './types';

export const OLLAMA_DEFAULT_BASE_URL = 'http://localhost:11434';

/** Keep-alive duration passed to Ollama (model stays loaded this long). */
export const OLLAMA_KEEP_ALIVE = '30m';

/**
 * Creates a local Ollama provider instance using the native Ollama API
 * via ai-sdk-ollama. This gives us access to keep_alive, think mode,
 * cascade JSON repair for tool calls, and native Ollama options.
 *
 * num_ctx is intentionally omitted to let Ollama auto-size based on
 * hardware (e.g., 32K for 32GB M2 Max). This prevents forced model reloads
 * when switching between the Ollama app and Untask.
 */
export function createOllamaProviderInstance(baseUrl?: string): ProviderInstance {
  const resolvedBaseUrl = (baseUrl?.trim() ?? '').length > 0
    ? baseUrl!.trim()
    : OLLAMA_DEFAULT_BASE_URL;

  const provider = createOllama({
    baseURL: resolvedBaseUrl.replace(/\/$/, ''),
  });

  return {
    languageModel: (modelId: string) => {
      return provider(modelId, {
        think: false,
        keep_alive: OLLAMA_KEEP_ALIVE,
        options: { num_predict: 1024, temperature: 0.2 },
      });
    },
    // Ollama does not support provider-defined tools like web search
    tools: undefined,
  };
}
