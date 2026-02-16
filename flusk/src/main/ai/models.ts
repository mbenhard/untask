import { getSetting, setSetting } from '../services/settingsService';

export const SUPPORTED_MODEL_IDS = [
  'minimax/minimax-m2.5',
  'moonshotai/kimi-k2.5',
  'z-ai/glm-5',
  'anthropic/claude-haiku-4.5',
  'google/gemini-3-flash-preview',
] as const;

export type ChatModelId = (typeof SUPPORTED_MODEL_IDS)[number];

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

const DEFAULT_MODEL_ID: ChatModelId = 'moonshotai/kimi-k2.5';
const MODEL_SETTING_KEY = 'ai_selected_model';

const MODEL_CATALOG: readonly ModelCatalogEntry[] = [
  {
    id: 'minimax/minimax-m2.5',
    label: 'MiniMax M2.5',
    inputCostPerMillion: 0.3,
    outputCostPerMillion: 1.2,
    defaultSelected: false,
    supportsReasoning: true,
    supportsWebSearch: false,
    supportsVision: false,
  },
  {
    id: 'moonshotai/kimi-k2.5',
    label: 'Moonshot Kimi K2.5',
    inputCostPerMillion: 0.45,
    outputCostPerMillion: 2.8,
    defaultSelected: true,
    supportsReasoning: true,
    supportsWebSearch: true,
    supportsVision: false,
    webSearchMethod: 'kimi_builtin',
  },
  {
    id: 'z-ai/glm-5',
    label: 'Z.AI GLM-5',
    inputCostPerMillion: null,
    outputCostPerMillion: null,
    defaultSelected: false,
    supportsReasoning: false,
    supportsWebSearch: false,
    supportsVision: false,
  },
  {
    id: 'anthropic/claude-haiku-4.5',
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
    id: 'google/gemini-3-flash-preview',
    label: 'Gemini 3 Flash',
    inputCostPerMillion: null,
    outputCostPerMillion: null,
    defaultSelected: false,
    supportsReasoning: true,
    supportsWebSearch: false,
    supportsVision: true,
  },
] as const;

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

export const getDefaultModelId = (): ChatModelId => DEFAULT_MODEL_ID;

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
    return DEFAULT_MODEL_ID;
  }

  return assertModelId(value.trim());
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
