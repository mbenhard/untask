import { SETTING_KEY_AI_MODEL, SETTING_KEY_AI_PROVIDER } from '../defaultSettings';
import { getSetting, setSetting } from '../services/settingsService';
import type { ProviderType } from './providers/types';

// ─── Supported model ID registry ─────────────────────────────────────────────

export const SUPPORTED_MODEL_IDS = [
  // OpenRouter models
  'openai/gpt-5-mini',
  'openai/gpt-4.1-mini',
  'anthropic/claude-sonnet-4-6',
  'anthropic/claude-haiku-4-5',
  'google/gemini-3-flash-preview',
  'minimax/minimax-m2.5',
  'z-ai/glm-5',
  'moonshotai/kimi-k2.5',
  // OpenAI direct models
  'gpt-4o-mini',
  'gpt-4o',
  // Anthropic direct models
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
  // Inception Labs models
  'mercury-coder-small',
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

/** Per-provider default model IDs. Ollama is empty — resolved dynamically. */
const PROVIDER_DEFAULT_MODEL_IDS: Record<ProviderType, string> = {
  openrouter: 'openai/gpt-5-mini',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-4-6',
  ollama: '',
  inception: 'mercury-coder-small',
};

const MODEL_SETTING_KEY = SETTING_KEY_AI_MODEL;

// ─── Curated model list ───────────────────────────────────────────────────────

const CURATED_MODELS: readonly CuratedModel[] = [
  // GPT-5 Mini — OpenRouter
  {
    id: 'openai/gpt-5-mini',
    name: 'GPT-5 Mini',
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
  // GPT-4.1 Mini — OpenRouter
  {
    id: 'openai/gpt-4.1-mini',
    name: 'GPT-4.1 Mini',
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
  // MiniMax m2.5 — OpenRouter
  {
    id: 'minimax/minimax-m2.5',
    name: 'MiniMax m2.5',
    provider: 'openrouter',
    contextWindow: 196_608,
    costTier: 'cheap',
    capabilities: ['tools', 'vision', 'reasoning'],
    isRecommended: true,
  },
  // GLM-5 — OpenRouter
  {
    id: 'z-ai/glm-5',
    name: 'GLM-5',
    provider: 'openrouter',
    contextWindow: 128_000,
    costTier: 'cheap',
    capabilities: ['tools', 'reasoning'],
    isRecommended: true,
  },
  // Kimi k2.5 — OpenRouter
  {
    id: 'moonshotai/kimi-k2.5',
    name: 'Kimi k2.5',
    provider: 'openrouter',
    contextWindow: 262_144,
    costTier: 'cheap',
    capabilities: ['tools', 'vision', 'reasoning'],
    isRecommended: true,
  },
  // Mercury Coder Small — Inception Labs
  {
    id: 'mercury-coder-small',
    name: 'Mercury Coder Small',
    provider: 'inception',
    contextWindow: 128_000,
    costTier: 'cheap',
    capabilities: ['tools'],
    isDefault: true,
    isRecommended: true,
  },
] as const;

// ─── Legacy catalog (used by IPC / renderer) ──────────────────────────────────

const MODEL_CATALOG: readonly ModelCatalogEntry[] = [
  {
    id: 'openai/gpt-5-mini',
    label: 'GPT-5 Mini (OpenRouter)',
    inputCostPerMillion: 0.15,
    outputCostPerMillion: 0.6,
    defaultSelected: true,
    supportsReasoning: false,
    supportsWebSearch: false,
    supportsVision: true,
  },
  {
    id: 'openai/gpt-4.1-mini',
    label: 'GPT-4.1 Mini (OpenRouter)',
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
    id: 'minimax/minimax-m2.5',
    label: 'MiniMax m2.5 (OpenRouter)',
    inputCostPerMillion: 0.3,
    outputCostPerMillion: 1.1,
    defaultSelected: false,
    supportsReasoning: true,
    supportsWebSearch: false,
    supportsVision: true,
  },
  {
    id: 'z-ai/glm-5',
    label: 'GLM-5 (OpenRouter)',
    inputCostPerMillion: 0.8,
    outputCostPerMillion: 2.56,
    defaultSelected: false,
    supportsReasoning: true,
    supportsWebSearch: false,
    supportsVision: false,
  },
  {
    id: 'moonshotai/kimi-k2.5',
    label: 'Kimi k2.5 (OpenRouter)',
    inputCostPerMillion: 0.5,
    outputCostPerMillion: 2.8,
    defaultSelected: false,
    supportsReasoning: true,
    supportsWebSearch: true,
    supportsVision: true,
    webSearchMethod: 'kimi_builtin',
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
    id: 'mercury-coder-small',
    label: 'Mercury Coder Small',
    inputCostPerMillion: 0.25,
    outputCostPerMillion: 1.0,
    defaultSelected: true,
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

// ─── Ollama provider check ────────────────────────────────────────────────────

export const isOllamaProvider = (): boolean => {
  const stored = getSetting(SETTING_KEY_AI_PROVIDER)?.trim() ?? '';
  return stored === 'ollama';
};

export const isInceptionProvider = (): boolean => {
  const stored = getSetting(SETTING_KEY_AI_PROVIDER)?.trim() ?? '';
  return stored === 'inception';
};

// ─── Legacy accessors (used by IPC, chat.ts) ───────────

export const getDefaultModelId = (): string => {
  const storedProvider = getSetting(SETTING_KEY_AI_PROVIDER)?.trim() ?? '';
  const validProviders: ProviderType[] = ['openrouter', 'openai', 'anthropic', 'ollama', 'inception'];
  const provider = validProviders.includes(storedProvider as ProviderType)
    ? (storedProvider as ProviderType)
    : 'openrouter';
  if (provider === 'ollama') {
    // For Ollama, return stored model or empty string (resolved dynamically)
    const stored = getSetting(SETTING_KEY_AI_MODEL)?.trim() ?? '';
    return stored.length > 0 ? stored : '';
  }
  return PROVIDER_DEFAULT_MODEL_IDS[provider] as ChatModelId;
};

export const getModels = (): ModelCatalogEntry[] => [...MODEL_CATALOG];

export const modelSupportsReasoning = (modelId: string): boolean =>
  MODEL_CATALOG.find((entry) => entry.id === modelId)?.supportsReasoning ?? false;

export const modelSupportsVision = (modelId: string): boolean =>
  MODEL_CATALOG.find((entry) => entry.id === modelId)?.supportsVision ?? false;

export const getModelWebSearchConfig = (modelId: string): {
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

export const resolveModelId = (value?: string | null): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return getDefaultModelId();
  }

  const trimmed = value.trim();

  // Ollama: accept any non-empty model string
  if (isOllamaProvider()) {
    return trimmed;
  }

  if (isSupportedModelId(trimmed)) {
    return trimmed;
  }

  // Stale or removed model ID in settings — fall back to provider default.
  return getDefaultModelId();
};

export const getSelectedModelId = (): string => {
  const stored = getSetting(MODEL_SETTING_KEY);
  return resolveModelId(stored);
};

export const setSelectedModelId = (value: string): string => {
  const trimmed = value.trim();

  // Ollama: skip validation, store any non-empty model string
  if (isOllamaProvider()) {
    if (trimmed.length === 0) {
      throw new Error('Model ID cannot be empty.');
    }
    setSetting(MODEL_SETTING_KEY, trimmed);
    return trimmed;
  }

  const selected = assertModelId(trimmed);
  setSetting(MODEL_SETTING_KEY, selected);
  return selected;
};
