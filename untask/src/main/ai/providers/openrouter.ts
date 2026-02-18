import { createOpenAI } from '@ai-sdk/openai';

import type { ProviderInstance } from './types';

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/**
 * Creates an OpenRouter provider instance.
 * OpenRouter is OpenAI-compatible so we use @ai-sdk/openai with a custom baseURL.
 */
export function createOpenRouterProviderInstance(apiKey: string): ProviderInstance {
  const normalized = apiKey.trim();

  if (normalized.length === 0) {
    throw new Error(
      'OpenRouter API key is missing. Set OPENROUTER_API_KEY or save the key via App settings.',
    );
  }

  const provider = createOpenAI({
    baseURL: OPENROUTER_BASE_URL,
    apiKey: normalized,
  });

  return {
    languageModel: (modelId: string) => provider.chat(modelId),
    tools: provider.tools,
  };
}
