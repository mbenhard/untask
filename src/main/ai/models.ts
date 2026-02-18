import { SETTING_KEY_AI_MODEL, SETTING_KEY_AI_PROVIDER } from '../defaultSettings';
import { getSetting, setSetting } from '../services/settingsService';
import type { ProviderType } from './providers/types';

// ─── Supported model ID registry ─────────────────────────────────────────────

export const SUPPORTED_MODEL_IDS = [
  // OpenRouter models
  'openai/gpt-4o-mini',
  'openai/gpt-4o',
  'anthropic/claude-sonnet-4-6',
  'anthropic/claude-haiku-4-5',
  'google/gemini-2.5-flash-preview',
  'google/gemini-3-flash-preview',
  'z-ai/glm-4.7-flash',
  // OpenAI direct models
  'gpt-4o-mini',
  'gpt-4o',
  // Anthropic direct models
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
  // Ollama models
  'llama3.3:70b',
  'qwen3:8b',
] as const;

export type ChatModelId = (typeof SUPPORTED_MODEL_IDS)[number];

// ─── Legacy catalog entry (used by IPC and renderer) ─────────────────────────

export type ModelCatalogEntry = {
  id: ChatModelId;
  label: string;
  inputCostPerMillion: number | null;
  outputCostPerMillion: number | null;
  defaultSelected: boolean;
  supportsReasoning: boolean;
  supportsWebSearch: boolean;
  supportsVision: boolean;
  webSearchMethod?: 'kimi_builtin' | 'claude_native';
};

// ─── Curated model interface ──────────────────────────────────────────────────

export interface CuratedModel {
  id: ChatModelId;
  name: string;
  provider: ProviderType;
  contextWindow: number;
  costTier: 'free' | 'cheap' | 'moderate' | 'premium';
  capabilities: ('tools' | 'vision' | 'reasoning')[];
  isDefault?: boolean;
  isRecommended?: boolean;
}

// ─── Per-provider defaults ────────────────────────────────────────────────────

/** Per-provider default model IDs. */
const PROVIDER_DEFAULT_MODEL_IDS: Record<ProviderType, ChatModelId> = {
  openrouter: 'openai/gpt-4o-mini',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-4-6',
  ollama: 'llama3.3:70b',
};

const MODEL_SETTING_KEY = SETTING_KEY_AI_MODEL;

// ─── Curated model list ───────────────────────────────────────────────────────

const CURATED_MODELS: readonly CuratedModel[] = [
  // GPT-4o Mini — OpenRouter
  {
    id: 'openai/gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openrouter',
    contextWindow: 128_000,
    costTier: 'cheap',
    capabilities: ['tools', 'vision'],
    isDefault: true,
    isRecommended: true,
  },
  // GPT-4o Mini — OpenAI direct
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    contextWindow: 128_000,
    costTier: 'cheap',
    capabilities: ['tools', 'vision'],
    isDefault: true,
    isRecommended: true,
  },
  // GPT-4o — OpenRouter
  {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    provider: 'openrouter',
    contextWindow: 128_000,
    costTier: 'moderate',
    capabilities: ['tools', 'vision', 'reasoning'],
    isRecommended: true,
  },
  // GPT-4o — OpenAI direct
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    contextWindow: 128_000,
    costTier: 'moderate',
    capabilities: ['tools', 'vision', 'reasoning'],
    isRecommended: true,
  },
  // Claude Sonnet 4.6 — OpenRouter
  {
    id: 'anthropic/claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    provider: 'openrouter',
    contextWindow: 200_000,
    costTier: 'moderate',
    capabilities: ['tools', 'vision', 'reasoning'],
    isRecommended: true,
  },
  // Claude Sonnet 4.6 — Anthropic direct
  {
    id: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    provider: 'anthropic',
    contextWindow: 200_000,
    costTier: 'moderate',
    capabilities: ['tools', 'vision', 'reasoning'],
    isDefault: true,
    isRecommended: true,
  },
  // Claude Haiku 4.5 — OpenRouter
  {
    id: 'anthropic/claude-haiku-4-5',
    name: 'Claude Haiku 4.5',
    provider: 'openrouter',
    contextWindow: 200_000,
    costTier: 'cheap',
    capabilities: ['tools'],
    isRecommended: true,
  },
  // Claude Haiku 4.5 — Anthropic direct
  {
    id: 'claude-haiku-4-5-20251001',
    name: 'Claude Haiku 4.5',
    provider: 'anthropic',
    contextWindow: 200_000,
    costTier: 'cheap',
    capabilities: ['tools'],
    isRecommended: true,
  },
  // Gemini 2.5 Flash — OpenRouter
  {
    id: 'google/gemini-2.5-flash-preview',
    name: 'Gemini 2.5 Flash',
    provider: 'openrouter',
    contextWindow: 1_048_576,
    costTier: 'free',
    capabilities: ['tools', 'vision', 'reasoning'],
    isRecommended: true,
  },
  // Gemini 3 Flash — OpenRouter
  {
    id: 'google/gemini-3-flash-preview',
    name: 'Gemini 3 Flash',
    provider: 'openrouter',
    contextWindow: 1_048_576,
    costTier: 'cheap',
    capabilities: ['tools', 'vision', 'reasoning'],
    isRecommended: true,
  },
  // GLM 4.7 Flash — OpenRouter
  {
    id: 'z-ai/glm-4.7-flash',
    name: 'GLM 4.7 Flash',
    provider: 'openrouter',
    contextWindow: 128_000,
    costTier: 'free',
    capabilities: ['tools', 'reasoning'],
    isRecommended: true,
  },
  // Llama 3.3 70B — Ollama
  {
    id: 'llama3.3:70b',
    name: 'Llama 3.3 70B',
    provider: 'ollama',
    contextWindow: 128_000,
    costTier: 'free',
    capabilities: ['tools'],
    isDefault: true,
    isRecommended: true,
  },
  // Qwen 3 8B — Ollama
  {
    id: 'qwen3:8b',
    name: 'Qwen 3 8B',
    provider: 'ollama',
    contextWindow: 32_768,
    costTier: 'free',
    capabilities: ['tools'],
    isRecommended: true,
  },
] as const;

// ─── Legacy catalog (used by IPC / renderer) ──────────────────────────────────

const MODEL_CATALOG: readonly ModelCatalogEntry[] = [
  {
    id: 'openai/gpt-4o-mini',
    label: 'GPT-4o Mini (OpenRouter)',
    inputCostPerMillion: 0.15,
    outputCostPerMillion: 0.6,
    defaultSelected: true,
    supportsReasoning: false,
    supportsWebSearch: false,
    supportsVision: true,
  },
  {
    id: 'openai/gpt-4o',
    label: 'GPT-4o (OpenRouter)',
    inputCostPerMillion: 2.5,
    outputCostPerMillion: 10.0,
    defaultSelected: false,
    supportsReasoning: true,
    supportsWebSearch: false,
    supportsVision: true,
  },
  {
    id: 'anthropic/claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6 (OpenRouter)',
    inputCostPerMillion: 3.0,
    outputCostPerMillion: 15.0,
    defaultSelected: false,
    supportsReasoning: true,
    supportsWebSearch: false,
    supportsVision: true,
  },
  {
    id: 'anthropic/claude-haiku-4-5',
    label: 'Claude Haiku 4.5 (OpenRouter)',
    inputCostPerMillion: 0.8,
    outputCostPerMillion: 4.0,
    defaultSelected: false,
    supportsReasoning: false,
    supportsWebSearch: true,
    supportsVision: true,
    webSearchMethod: 'claude_native',
  },
  {
    id: 'google/gemini-2.5-flash-preview',
    label: 'Gemini 2.5 Flash (OpenRouter)',
    inputCostPerMillion: null,
    outputCostPerMillion: null,
    defaultSelected: false,
    supportsReasoning: true,
    supportsWebSearch: false,
    supportsVision: true,
  },
  {
    id: 'google/gemini-3-flash-preview',
    label: 'Gemini 3 Flash (OpenRouter)',
    inputCostPerMillion: 0.5,
    outputCostPerMillion: 3.0,
    defaultSelected: false,
    supportsReasoning: true,
    supportsWebSearch: false,
    supportsVision: true,
  },
  {
    id: 'z-ai/glm-4.7-flash',
    label: 'GLM 4.7 Flash (OpenRouter)',
    inputCostPerMillion: null,
    outputCostPerMillion: null,
    defaultSelected: false,
    supportsReasoning: true,
    supportsWebSearch: false,
    supportsVision: false,
  },
  {
    id: 'gpt-4o-mini',
    label: 'GPT-4o Mini',
    inputCostPerMillion: 0.15,
    outputCostPerMillion: 0.6,
    defaultSelected: false,
    supportsReasoning: false,
    supportsWebSearch: false,
    supportsVision: true,
  },
  {
    id: 'gpt-4o',
    label: 'GPT-4o',
    inputCostPerMillion: 2.5,
    outputCostPerMillion: 10.0,
    defaultSelected: false,
    supportsReasoning: true,
    supportsWebSearch: false,
    supportsVision: true,
  },
  {
    id: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    inputCostPerMillion: 3.0,
    outputCostPerMillion: 15.0,
    defaultSelected: false,
    supportsReasoning: true,
    supportsWebSearch: false,
    supportsVision: true,
  },
  {
    id: 'claude-haiku-4-5-20251001',
    label: 'Claude Haiku 4.5',
    inputCostPerMillion: 0.8,
    outputCostPerMillion: 4.0,
    defaultSelected: false,
    supportsReasoning: false,
    supportsWebSearch: true,
    supportsVision: true,
    webSearchMethod: 'claude_native',
  },
  {
    id: 'llama3.3:70b',
    label: 'Llama 3.3 70B',
    inputCostPerMillion: null,
    outputCostPerMillion: null,
    defaultSelected: false,
    supportsReasoning: false,
    supportsWebSearch: false,
    supportsVision: false,
  },
  {
    id: 'qwen3:8b',
    label: 'Qwen 3 8B',
    inputCostPerMillion: null,
    outputCostPerMillion: null,
    defaultSelected: false,
    supportsReasoning: false,
    supportsWebSearch: false,
    supportsVision: false,
  },
] as const;

// ─── Error class ──────────────────────────────────────────────────────────────

export class InvalidModelSelectionError extends Error {
  public readonly code = 'INVALID_MODEL_SELECTION';

  public readonly attemptedId: string;

  constructor(attemptedId: string) {
    super(
      `Unsupported model id "${attemptedId}". Supported models: ${SUPPORTED_MODEL_IDS.join(', ')}.`,
    );
    this.name = 'InvalidModelSelectionError';
    this.attemptedId = attemptedId;
  }
}

// ─── Curated model accessors ──────────────────────────────────────────────────

/**
 * Returns the curated model list, optionally filtered to a specific provider.
 */
export const getCuratedModels = (provider?: ProviderType): CuratedModel[] =>
  provider
    ? CURATED_MODELS.filter((m) => m.provider === provider)
    : [...CURATED_MODELS];

/**
 * Returns a curated model by its exact model ID, or undefined if not found.
 */
export const getCuratedModelById = (id: string): CuratedModel | undefined =>
  CURATED_MODELS.find((m) => m.id === id);

// ─── Legacy accessors (used by IPC, chat.ts, knowledgeExtractor.ts) ───────────

export const getDefaultModelId = (): ChatModelId => {
  const storedProvider = getSetting(SETTING_KEY_AI_PROVIDER)?.trim() ?? '';
  const validProviders: ProviderType[] = ['openrouter', 'openai', 'anthropic', 'ollama'];
  const provider = validProviders.includes(storedProvider as ProviderType)
    ? (storedProvider as ProviderType)
    : 'openrouter';
  return PROVIDER_DEFAULT_MODEL_IDS[provider];
};

export const getModels = (): ModelCatalogEntry[] => [...MODEL_CATALOG];

export const modelSupportsReasoning = (modelId: ChatModelId): boolean =>
  MODEL_CATALOG.find((entry) => entry.id === modelId)?.supportsReasoning ?? false;

export const modelSupportsVision = (modelId: ChatModelId): boolean =>
  MODEL_CATALOG.find((entry) => entry.id === modelId)?.supportsVision ?? false;

export const getModelWebSearchConfig = (modelId: ChatModelId): {
  supportsWebSearch: boolean;
  webSearchMethod?: 'kimi_builtin' | 'claude_native';
} => {
  const entry = MODEL_CATALOG.find((e) => e.id === modelId);
  return {
    supportsWebSearch: entry?.supportsWebSearch ?? false,
    webSearchMethod: entry?.webSearchMethod,
  };
};

export const isSupportedModelId = (value: string): value is ChatModelId =>
  SUPPORTED_MODEL_IDS.includes(value as ChatModelId);

export const assertModelId = (value: string): ChatModelId => {
  if (!isSupportedModelId(value)) {
    throw new InvalidModelSelectionError(value);
  }

  return value;
};

export const resolveModelId = (value?: string | null): ChatModelId => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return getDefaultModelId();
  }

  const trimmed = value.trim();
  if (isSupportedModelId(trimmed)) {
    return trimmed;
  }

  // Stale or removed model ID in settings — fall back to provider default.
  return getDefaultModelId();
};

export const getSelectedModelId = (): ChatModelId => {
  const stored = getSetting(MODEL_SETTING_KEY);
  return resolveModelId(stored);
};

export const setSelectedModelId = (value: string): ChatModelId => {
  const selected = assertModelId(value.trim());
  setSetting(MODEL_SETTING_KEY, selected);
  return selected;
};
