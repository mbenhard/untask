import type { OllamaConnectionStatus } from './ApiKeyManager';
import { SettingsRow } from './SettingsRow';
import { SettingsSelect } from './SettingsSelect';

type ProviderType = 'openrouter' | 'openai' | 'anthropic' | 'ollama';

type CostTier = 'free' | 'cheap' | 'moderate' | 'premium';

type CuratedModel = {
  id: string;
  name: string;
  provider: ProviderType;
  costTier: CostTier;
  capabilities: ('tools' | 'vision' | 'reasoning')[];
  isDefault?: boolean;
  isRecommended?: boolean;
};

// ─── Static curated model list (mirrors main/ai/models.ts) ───────────────────

const CURATED_MODELS: readonly CuratedModel[] = [
  {
    id: 'openai/gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openrouter',
    costTier: 'cheap',
    capabilities: ['tools', 'vision'],
    isDefault: true,
    isRecommended: true,
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    costTier: 'cheap',
    capabilities: ['tools', 'vision'],
    isDefault: true,
    isRecommended: true,
  },
  {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    provider: 'openrouter',
    costTier: 'moderate',
    capabilities: ['tools', 'vision', 'reasoning'],
    isRecommended: true,
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    costTier: 'moderate',
    capabilities: ['tools', 'vision', 'reasoning'],
    isRecommended: true,
  },
  {
    id: 'anthropic/claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    provider: 'openrouter',
    costTier: 'moderate',
    capabilities: ['tools', 'vision', 'reasoning'],
    isRecommended: true,
  },
  {
    id: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    provider: 'anthropic',
    costTier: 'moderate',
    capabilities: ['tools', 'vision', 'reasoning'],
    isDefault: true,
    isRecommended: true,
  },
  {
    id: 'anthropic/claude-haiku-4-5',
    name: 'Claude Haiku 4.5',
    provider: 'openrouter',
    costTier: 'cheap',
    capabilities: ['tools'],
    isRecommended: true,
  },
  {
    id: 'claude-haiku-4-5-20251001',
    name: 'Claude Haiku 4.5',
    provider: 'anthropic',
    costTier: 'cheap',
    capabilities: ['tools'],
    isRecommended: true,
  },
  {
    id: 'google/gemini-2.5-flash-preview',
    name: 'Gemini 2.5 Flash',
    provider: 'openrouter',
    costTier: 'free',
    capabilities: ['tools', 'vision', 'reasoning'],
    isRecommended: true,
  },
  {
    id: 'google/gemini-3-flash-preview',
    name: 'Gemini 3 Flash',
    provider: 'openrouter',
    costTier: 'cheap',
    capabilities: ['tools', 'vision', 'reasoning'],
    isRecommended: true,
  },
  {
    id: 'z-ai/glm-4.7-flash',
    name: 'GLM 4.7 Flash',
    provider: 'openrouter',
    costTier: 'free',
    capabilities: ['tools', 'reasoning'],
    isRecommended: true,
  },
];

const COST_TIER_LABEL: Record<CostTier, string> = {
  free: 'Free',
  cheap: '$',
  moderate: '$$',
  premium: '$$$',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const getCuratedModelsForProvider = (provider: ProviderType): CuratedModel[] =>
  CURATED_MODELS.filter((m) => m.provider === provider);

const buildModelLabel = (model: CuratedModel): string => {
  const caps: string[] = [];
  if (model.capabilities.includes('tools')) caps.push('tools');
  if (model.capabilities.includes('vision')) caps.push('vision');
  if (model.capabilities.includes('reasoning')) caps.push('reasoning');
  const capStr = caps.length > 0 ? ` · ${caps.join(', ')}` : '';
  const costStr = ` · ${COST_TIER_LABEL[model.costTier]}`;
  return `${model.name}${capStr}${costStr}`;
};

export const buildModelOptions = (
  provider: ProviderType,
  selectedModelId: string | null,
): { value: string; label: string }[] => {
  const providerModels = getCuratedModelsForProvider(provider);
  if (providerModels.length > 0) {
    return providerModels.map((m) => ({
      value: m.id,
      label: buildModelLabel(m),
    }));
  }
  return [{ value: selectedModelId ?? '', label: selectedModelId ?? '' }];
};

// ─── Ollama model types ───────────────────────────────────────────────────────

export type OllamaModelOption = {
  name: string;
  parameterSize: string;
};

type OllamaStatus = OllamaConnectionStatus;

// ─── Ollama model view ───────────────────────────────────────────────────────

const OllamaModelView = ({
  ollamaStatus,
  ollamaModels,
  selectedModelId,
  onChange,
}: {
  ollamaStatus: OllamaStatus;
  ollamaModels: OllamaModelOption[];
  selectedModelId: string | null;
  onChange: (modelId: string) => void;
}) => {
  if (ollamaStatus === 'loading') {
    return (
      <p className="text-[11px] text-muted-foreground">
        Detecting Ollama...
      </p>
    );
  }

  if (ollamaStatus === 'not_installed') {
    return (
      <p className="text-[11px] text-muted-foreground">
        Ollama is not installed.{' '}
        <a
          href="https://ollama.com/download"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-foreground"
        >
          Download Ollama
        </a>
      </p>
    );
  }

  if (ollamaStatus === 'not_running') {
    return (
      <p className="text-[11px] text-muted-foreground">
        Ollama is installed but not running. Start it to continue.
      </p>
    );
  }

  if (ollamaModels.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground">
        No models installed. Run{' '}
        <code className="rounded bg-muted px-1 py-0.5 text-[10px]">ollama pull &lt;model&gt;</code>{' '}
        to get started.
      </p>
    );
  }

  const options = ollamaModels.map((m) => ({
    value: m.name,
    label: m.parameterSize ? `${m.name} (${m.parameterSize})` : m.name,
  }));

  return (
    <SettingsSelect
      options={options}
      value={selectedModelId ?? ''}
      onChange={onChange}
      aria-label="Ollama model"
      className="max-w-[260px]"
    />
  );
};

// ─── Component ────────────────────────────────────────────────────────────────

type ModelCatalogViewProps = {
  provider: ProviderType;
  selectedModelId: string | null;
  loading: boolean;
  onChange: (modelId: string) => void;
  ollamaModels?: OllamaModelOption[];
  ollamaStatus?: OllamaStatus;
};

export const ModelCatalogView = ({
  provider,
  selectedModelId,
  loading,
  onChange,
  ollamaModels,
  ollamaStatus,
}: ModelCatalogViewProps) => {
  if (provider === 'ollama') {
    return (
      <SettingsRow label="Active model" loading={loading}>
        <OllamaModelView
          ollamaStatus={ollamaStatus ?? 'loading'}
          ollamaModels={ollamaModels ?? []}
          selectedModelId={selectedModelId}
          onChange={onChange}
        />
      </SettingsRow>
    );
  }

  const modelOptions = buildModelOptions(provider, selectedModelId);

  return (
    <SettingsRow label="Active model" loading={loading}>
      <SettingsSelect
        options={modelOptions}
        value={selectedModelId ?? ''}
        onChange={onChange}
        aria-label="AI model"
        className="max-w-[260px]"
      />
    </SettingsRow>
  );
};
