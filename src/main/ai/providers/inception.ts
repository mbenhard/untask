import { createOpenAI } from '@ai-sdk/openai';

import { SETTING_KEY_AI_INCEPTION_DIFFUSION_MODE } from '../../defaultSettings';
import { getSetting } from '../../services/settingsService';
import type { ProviderInstance } from './types';

export const INCEPTION_BASE_URL = 'https://api.inceptionlabs.ai/v1';

/**
 * Creates an Inception Labs provider instance.
 * Inception's Mercury API is OpenAI-compatible, so we use @ai-sdk/openai
 * with a custom baseURL and a fetch middleware that injects `diffusing: true`
 * when diffusion mode is active.
 */
export function createInceptionProviderInstance(apiKey: string): ProviderInstance {
  const normalized = apiKey.trim();

  if (normalized.length === 0) {
    throw new Error(
      'Inception Labs API key is missing. Save the key via App settings.',
    );
  }

  const provider = createOpenAI({
    baseURL: INCEPTION_BASE_URL,
    apiKey: normalized,
    fetch: async (input, init) => {
      const diffusionMode = getSetting(SETTING_KEY_AI_INCEPTION_DIFFUSION_MODE) ?? 'streaming';

      if (diffusionMode === 'diffusion' && init?.body) {
        try {
          const body = JSON.parse(init.body as string);
          body.diffusing = true;
          body.stream = true;
          return globalThis.fetch(input, { ...init, body: JSON.stringify(body) });
        } catch {
          // If body parsing fails, fall through to normal fetch
        }
      }

      return globalThis.fetch(input, init);
    },
  });

  return {
    languageModel: (modelId: string) => provider.chat(modelId),
    tools: undefined,
  };
}
