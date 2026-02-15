import { createOpenAI } from '@ai-sdk/openai';

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export type OpenRouterProvider = ReturnType<typeof createOpenAI>;

const normalizeApiKey = (apiKey: string): string => {
  const normalized = apiKey.trim();

  if (normalized.length === 0) {
    throw new Error('OpenRouter API key is missing. Set OPENROUTER_API_KEY.');
  }

  return normalized;
};

export const resolveOpenRouterApiKey = (explicitApiKey?: string): string => {
  if (typeof explicitApiKey === 'string' && explicitApiKey.trim().length > 0) {
    return normalizeApiKey(explicitApiKey);
  }

  return normalizeApiKey(process.env.OPENROUTER_API_KEY ?? '');
};

export const createOpenRouterProvider = (apiKey: string): OpenRouterProvider =>
  createOpenAI({
    baseURL: OPENROUTER_BASE_URL,
    apiKey: normalizeApiKey(apiKey),
  });

export const createOpenRouterProviderFromEnv = (
  explicitApiKey?: string,
): OpenRouterProvider => createOpenRouterProvider(resolveOpenRouterApiKey(explicitApiKey));
