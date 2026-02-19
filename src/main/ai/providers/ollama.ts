import { createOllama } from 'ai-sdk-ollama';

import type { ProviderInstance } from './types';

export const OLLAMA_DEFAULT_BASE_URL = 'http://localhost:11434';

/** Context window size used for all Ollama model instances. */
export const OLLAMA_NUM_CTX = 16_384;

/** Keep-alive duration passed to Ollama (model stays loaded this long). */
export const OLLAMA_KEEP_ALIVE = '30m';

/**
 * Creates a local Ollama provider instance using the native Ollama API
 * via ai-sdk-ollama. This gives us access to num_ctx, keep_alive,
 * cascade JSON repair for tool calls, and native Ollama options.
 */
export function createOllamaProviderInstance(baseUrl?: string): ProviderInstance {
  const resolvedBaseUrl = (baseUrl?.trim() ?? '').length > 0
    ? baseUrl!.trim()
    : OLLAMA_DEFAULT_BASE_URL;

  const provider = createOllama({
    baseURL: resolvedBaseUrl.replace(/\/$/, ''),
  });

  return {
    languageModel: (modelId: string) =>
      provider(modelId, {
        options: { num_ctx: OLLAMA_NUM_CTX },
        keep_alive: OLLAMA_KEEP_ALIVE,
      }),
    // Ollama does not support provider-defined tools like web search
    tools: undefined,
  };
}
