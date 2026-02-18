import { createOpenAI } from '@ai-sdk/openai';

import { getSetting } from '../services/settingsService';

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
export const OPENROUTER_API_KEY_SETTING_KEY = 'ai_openrouter_key';

export type OpenRouterProvider = ReturnType<typeof createOpenAI>;

const normalizeApiKey = (apiKey: string): string => {
  const normalized = apiKey.trim();

  if (normalized.length === 0) {
    throw new Error(
      'OpenRouter API key is missing. Set OPENROUTER_API_KEY or save ai_openrouter_key in App settings.',
    );
  }

  return normalized;
};

export const resolveOpenRouterApiKey = (explicitApiKey?: string): string => {
  if (typeof explicitApiKey === 'string' && explicitApiKey.trim().length > 0) {
    return normalizeApiKey(explicitApiKey);
  }

  const envApiKey = process.env.OPENROUTER_API_KEY ?? '';
  if (envApiKey.trim().length > 0) {
    return normalizeApiKey(envApiKey);
  }

  const persistedApiKey = getSetting(OPENROUTER_API_KEY_SETTING_KEY) ?? '';
  return normalizeApiKey(persistedApiKey);
};

export const createOpenRouterProvider = (apiKey: string): OpenRouterProvider =>
  createOpenAI({
    baseURL: OPENROUTER_BASE_URL,
    apiKey: normalizeApiKey(apiKey),
  });

export const createOpenRouterProviderFromEnv = (
  explicitApiKey?: string,
): OpenRouterProvider => createOpenRouterProvider(resolveOpenRouterApiKey(explicitApiKey));
