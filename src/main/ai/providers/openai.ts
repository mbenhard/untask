import { createOpenAI } from '@ai-sdk/openai';

import type { ProviderInstance } from './types';

/**
 * Creates a direct OpenAI provider instance using @ai-sdk/openai.
 */
export function createOpenAIProviderInstance(apiKey: string): ProviderInstance {
  const normalized = apiKey.trim();

  if (normalized.length === 0) {
    throw new Error(
      'OpenAI API key is missing. Save ai_openai_key in App settings.',
    );
  }

  const provider = createOpenAI({
    apiKey: normalized,
  });

  return {
    languageModel: (modelId: string) => provider.chat(modelId),
    tools: provider.tools,
  };
}
