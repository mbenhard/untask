import { getSetting, setSetting } from '../services/settingsService';

export const SUPPORTED_MODEL_IDS = [
  'minimax/minimax-m2.5',
  'moonshotai/kimi-k2.5',
  'z-ai/glm-5',
] as const;

export type ChatModelId = (typeof SUPPORTED_MODEL_IDS)[number];

export type ModelCatalogEntry = {
  id: ChatModelId;
  label: string;
  inputCostPerMillion: number | null;
  outputCostPerMillion: number | null;
  defaultSelected: boolean;
  supportsReasoning: boolean;
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
  },
  {
    id: 'moonshotai/kimi-k2.5',
    label: 'Moonshot Kimi K2.5',
    inputCostPerMillion: 0.45,
    outputCostPerMillion: 2.8,
    defaultSelected: true,
    supportsReasoning: true,
  },
  {
    id: 'z-ai/glm-5',
    label: 'Z.AI GLM-5',
    inputCostPerMillion: null,
    outputCostPerMillion: null,
    defaultSelected: false,
    supportsReasoning: false,
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
