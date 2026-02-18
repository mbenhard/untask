import type { LanguageModel } from 'ai';

export type ProviderType = 'openrouter' | 'openai' | 'anthropic' | 'ollama';

export interface ProviderConfig {
  type: ProviderType;
  apiKey?: string;
  baseUrl?: string;
}

/**
 * A unified provider interface: given a config and a model ID string,
 * returns a Vercel AI SDK LanguageModel ready for streamText/generateText.
 *
 * Uses the `LanguageModel` union type from `ai`, which covers all current
 * SDK model protocol versions (V2, V3).
 */
export type CreateProviderModel = (
  config: ProviderConfig,
  modelId: string,
) => LanguageModel;

/**
 * A provider instance that can create language models and optionally
 * exposes provider-specific tools (e.g. web search).
 */
export interface ProviderInstance {
  /** Create a language model for the given model ID string. */
  languageModel: (modelId: string) => LanguageModel;
  /**
   * Provider-specific tools namespace. Present on OpenAI-compatible
   * providers that support native tool injection (e.g. web search).
   * May be undefined for providers that don't support it.
   */
  tools?: Record<string, unknown>;
}
