import {
  SETTING_KEY_AI_PROVIDER,
  SETTING_KEY_AI_OLLAMA_BASE_URL,
} from '../../defaultSettings';
import { getApiKey } from '../../services/keyStorage';
import { getSetting } from '../../services/settingsService';
import { createAnthropicProviderInstance } from './anthropic';
import { createInceptionProviderInstance } from './inception';
import { createOllamaProviderInstance } from './ollama';
import { createOpenAIProviderInstance } from './openai';
import { createOpenRouterProviderInstance } from './openrouter';
import type { ProviderConfig, ProviderInstance, ProviderType } from './types';

export type { ProviderConfig, ProviderInstance, ProviderType };

// ─── Resolve active provider config from settings ─────────────────────────────

const resolveProviderType = (): ProviderType => {
  const stored = getSetting(SETTING_KEY_AI_PROVIDER)?.trim() ?? '';
  const valid: ProviderType[] = ['openrouter', 'openai', 'anthropic', 'ollama', 'inception'];
  return valid.includes(stored as ProviderType)
    ? (stored as ProviderType)
    : 'openrouter';
};

const resolveOpenRouterKey = (): string => {
  // Honour env var for backward compatibility with development setups
  const envKey = (process.env.OPENROUTER_API_KEY ?? '').trim();
  if (envKey.length > 0) return envKey;
  // Use keyStorage which supports OS-level encrypted storage
  return getApiKey('openrouter') ?? '';
};

const resolveOpenAIKey = (): string =>
  getApiKey('openai') ?? '';

const resolveAnthropicKey = (): string =>
  getApiKey('anthropic') ?? '';

const resolveOllamaBaseUrl = (): string =>
  getSetting(SETTING_KEY_AI_OLLAMA_BASE_URL) ?? '';

const resolveInceptionKey = (): string =>
  getApiKey('inception') ?? '';

// ─── Public factory ────────────────────────────────────────────────────────────

/**
 * Create a provider instance from an explicit config object.
 * Useful when you want to instantiate a provider without reading settings,
 * e.g. in tests or for one-off provider calls.
 */
export function createProviderInstance(config: ProviderConfig): ProviderInstance {
  switch (config.type) {
    case 'openrouter':
      return createOpenRouterProviderInstance(config.apiKey ?? '');
    case 'openai':
      return createOpenAIProviderInstance(config.apiKey ?? '');
    case 'anthropic':
      return createAnthropicProviderInstance(config.apiKey ?? '');
    case 'ollama':
      return createOllamaProviderInstance(config.baseUrl);
    case 'inception':
      return createInceptionProviderInstance(config.apiKey ?? '');
    default: {
      // Exhaustive check — TypeScript will flag this if ProviderType grows
      const _exhaustive: never = config.type;
      throw new Error(`Unknown provider type: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Read the active provider type and credentials from app settings,
 * then return a ready-to-use ProviderInstance.
 *
 * This is the primary entry point used by chat.ts. It reads from keyStorage
 * (encrypted on supported platforms) and falls back gracefully.
 */
export function getActiveProvider(): ProviderInstance {
  const type = resolveProviderType();

  switch (type) {
    case 'openrouter':
      return createOpenRouterProviderInstance(resolveOpenRouterKey());
    case 'openai':
      return createOpenAIProviderInstance(resolveOpenAIKey());
    case 'anthropic':
      return createAnthropicProviderInstance(resolveAnthropicKey());
    case 'ollama':
      return createOllamaProviderInstance(resolveOllamaBaseUrl());
    case 'inception':
      return createInceptionProviderInstance(resolveInceptionKey());
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown provider type: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Convenience: get the active provider's language model for a given model ID.
 * Equivalent to: getActiveProvider().languageModel(modelId)
 */
export function getActiveLanguageModel(modelId: string) {
  return getActiveProvider().languageModel(modelId);
}
