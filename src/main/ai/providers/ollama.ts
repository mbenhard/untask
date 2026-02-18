import { createOpenAI } from '@ai-sdk/openai';

import type { ProviderInstance } from './types';

export const OLLAMA_DEFAULT_BASE_URL = 'http://localhost:11434';

/**
 * Creates a local Ollama provider instance.
 * Ollama exposes an OpenAI-compatible API, so we use @ai-sdk/openai
 * with a custom baseURL pointing to the local Ollama server.
 * No API key is required.
 */
export function createOllamaProviderInstance(baseUrl?: string): ProviderInstance {
  const resolvedBaseUrl = (baseUrl?.trim() ?? '').length > 0
    ? baseUrl!.trim()
    : OLLAMA_DEFAULT_BASE_URL;

  // Ollama's OpenAI-compatible endpoint is at /v1
  const apiBase = resolvedBaseUrl.endsWith('/v1')
    ? resolvedBaseUrl
    : `${resolvedBaseUrl.replace(/\/$/, '')}/v1`;

  const provider = createOpenAI({
    baseURL: apiBase,
    // Ollama does not require a real API key — use a placeholder
    apiKey: 'ollama',
  });

  return {
    languageModel: (modelId: string) => provider.chat(modelId),
    // Ollama does not support provider-defined tools like web search
    tools: undefined,
  };
}
