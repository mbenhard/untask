import { createAnthropic } from '@ai-sdk/anthropic';

import type { ProviderInstance } from './types';

/**
 * Creates an Anthropic provider instance using @ai-sdk/anthropic.
 * Supports Claude model family.
 */
export function createAnthropicProviderInstance(apiKey: string): ProviderInstance {
  const normalized = apiKey.trim();

  if (normalized.length === 0) {
    throw new Error(
      'Anthropic API key is missing. Save ai_anthropic_key in App settings.',
    );
  }

  const provider = createAnthropic({
    apiKey: normalized,
  });

  return {
    languageModel: (modelId: string) => provider.languageModel(modelId),
    // Anthropic provider does not expose a .tools namespace in the same way
    tools: undefined,
  };
}
