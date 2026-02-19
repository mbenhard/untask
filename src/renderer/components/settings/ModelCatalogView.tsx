import type { OllamaPullProgressPayload } from '../../../types/ipc';
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
    id: 'openai/gpt-5-mini',
    name: 'GPT-5 Mini',
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
    id: 'openai/gpt-4.1-mini',
    name: 'GPT-4.1 Mini',
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
    id: 'google/gemini-3-flash-preview',
    name: 'Gemini 3 Flash',
    provider: 'openrouter',
    costTier: 'cheap',
    capabilities: ['tools', 'vision', 'reasoning'],
    isRecommended: true,
  },
  {
    id: 'minimax/minimax-m2.5',
    name: 'MiniMax m2.5',
    provider: 'openrouter',
    costTier: 'cheap',
    capabilities: ['tools', 'vision', 'reasoning'],
    isRecommended: true,
  },
  {
    id: 'z-ai/glm-5',
    name: 'GLM-5',
    provider: 'openrouter',
    costTier: 'cheap',
    capabilities: ['tools', 'reasoning'],
    isRecommended: true,
  },
  {
    id: 'moonshotai/kimi-k2.5',
    name: 'Kimi k2.5',
    provider: 'openrouter',
    costTier: 'cheap',
    capabilities: ['tools', 'vision', 'reasoning'],
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
) => {
  const providerModels = getCuratedModelsForProvider(provider);
  if (providerModels.length > 0) {
    if (provider === 'openrouter') {
      const topIds = [
        'anthropic/claude-haiku-4-5',
        'google/gemini-3-flash-preview',
        'openai/gpt-4.1-mini',
      ];

      const recommendedModels = providerModels.filter(m => topIds.includes(m.id));
      const recommendedSorted = recommendedModels.sort((a, b) => topIds.indexOf(a.id) - topIds.indexOf(b.id));

      const otherModels = providerModels.filter(m => !topIds.includes(m.id));

      return [
        {
          label: 'Recommended',
          options: recommendedSorted.map(m => ({ value: m.id, label: buildModelLabel(m) }))
        },
        {
          label: 'Other',
          options: otherModels.map(m => ({ value: m.id, label: buildModelLabel(m) }))
        }
      ];
    }

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
  supportsTools?: boolean;
};

type OllamaStatus = OllamaConnectionStatus;

// ─── Recommended Ollama models ───────────────────────────────────────────────

const RECOMMENDED_OLLAMA_MODELS: readonly { name: string; size: string }[] = [
  { name: 'llama3.1:8b', size: '8B' },
  { name: 'llama3-groq-tool-use:8b', size: '8B' },
  { name: 'mistral:7b', size: '7B' },
  { name: 'qwen3:8b', size: '8B' },
  { name: 'qwen3:14b', size: '14B' },
  { name: 'mistral-small3:24b', size: '24B' },
  { name: 'qwen3:30b-a3b', size: '30B MoE' },
  { name: 'mixtral:8x7b', size: '47B MoE' },
];

const PULL_PREFIX = 'pull:';

const MIN_PARAMETER_SIZE_BILLIONS = 7;

const isModelLargeEnough = (modelName: string): boolean => {
  const match = modelName.match(/:?(\d+)[bB](?:\s|$|:)/);
  if (!match) return true;
  const billions = parseInt(match[1], 10);
  return billions >= MIN_PARAMETER_SIZE_BILLIONS;
};

const isModelInstalled = (modelName: string, installedModels: OllamaModelOption[]): boolean =>
  installedModels.some(
    (m) => m.name === modelName || m.name === `${modelName}:latest` || m.name.startsWith(`${modelName}:`),
  );

// ─── Ollama model view ───────────────────────────────────────────────────────

const OllamaModelView = ({
  ollamaStatus,
  ollamaModels,
  selectedModelId,
  onChange,
  pullProgress,
  onPullModel,
  onCancelPull,
}: {
  ollamaStatus: OllamaStatus;
  ollamaModels: OllamaModelOption[];
  selectedModelId: string | null;
  onChange: (modelId: string) => void;
  pullProgress: OllamaPullProgressPayload | null;
  onPullModel: (model: string) => void;
  onCancelPull: () => void;
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

  const isPulling = pullProgress !== null && pullProgress.status !== 'success' && pullProgress.status !== 'error';

  const uninstalledRecommended = RECOMMENDED_OLLAMA_MODELS.filter(
    (r) => !isModelInstalled(r.name, ollamaModels),
  );

  const handleChange = (value: string) => {
    if (value.startsWith(PULL_PREFIX)) {
      onPullModel(value.slice(PULL_PREFIX.length));
    } else {
      onChange(value);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-3 text-right">
        {selectedModelId &&
          ollamaModels.some((m) => m.name === selectedModelId && !isModelLargeEnough(m.name)) && (
            <span className="text-[10px] leading-tight text-amber-400/80">
              Too small for reliable tool use.<br />Try llama3.1:8b
            </span>
          )}
        {selectedModelId &&
          ollamaModels.some((m) => m.name === selectedModelId && isModelLargeEnough(m.name) && m.supportsTools === false) && (
            <span className="text-[10px] leading-tight text-amber-400/80">
              Doesn&apos;t support tools.<br />Try llama3.1:8b
            </span>
          )}
        {pullProgress && (
          <div className="flex flex-col items-end gap-1 min-w-[140px]">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground/60 whitespace-nowrap">
                {pullProgress.status === 'success'
                  ? `${pullProgress.model} pulled`
                  : pullProgress.status === 'error'
                    ? pullProgress.error ?? 'Pull failed'
                    : pullProgress.percent != null
                      ? `Pulling ${pullProgress.model}… ${pullProgress.percent}%`
                      : `${pullProgress.status}…`}
              </span>
              {isPulling && (
                <button
                  type="button"
                  onClick={onCancelPull}
                  className="text-[10px] text-muted-foreground/50 hover:text-foreground transition-colors underline underline-offset-2"
                >
                  Cancel
                </button>
              )}
            </div>
            {typeof pullProgress.percent === 'number' && (
              <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-foreground/60 transition-all duration-300"
                  style={{ width: `${pullProgress.percent}%` }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      <select
        value={selectedModelId ?? ''}
        onChange={(e) => handleChange(e.target.value)}
        disabled={isPulling}
        aria-label="Ollama model"
        className="h-7 rounded-md border border-border/60 bg-transparent px-2 text-[11px] max-w-[280px] disabled:opacity-60"
      >
        {ollamaModels.length === 0 && (
          <option value="" disabled>
            Select a model to pull…
          </option>
        )}
        {ollamaModels.length > 0 && (
          <optgroup label="Installed">
            {ollamaModels.map((m) => {
              const noTools = m.supportsTools === false;
              const isTooSmall = !isModelLargeEnough(m.name);
              const label = m.parameterSize ? `${m.name} (${m.parameterSize})` : m.name;
              const warningText = isTooSmall ? ' — too small' : noTools ? ' — no tool support' : '';
              return (
                <option key={m.name} value={m.name}>
                  {(isTooSmall || noTools) ? `⚠ ${label}${warningText}` : label}
                </option>
              );
            })}
          </optgroup>
        )}
        {uninstalledRecommended.length > 0 && (
          <optgroup label="Recommended — select to pull">
            {uninstalledRecommended.map((r) => (
              <option key={r.name} value={`${PULL_PREFIX}${r.name}`}>
                ↓ {r.name} · {r.size}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </div>
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
  pullProgress?: OllamaPullProgressPayload | null;
  onPullModel?: (model: string) => void;
  onCancelPull?: () => void;
};

export const ModelCatalogView = ({
  provider,
  selectedModelId,
  loading,
  onChange,
  ollamaModels,
  ollamaStatus,
  pullProgress,
  onPullModel,
  onCancelPull,
}: ModelCatalogViewProps) => {
  if (provider === 'ollama') {
    return (
      <SettingsRow label="Active model" loading={loading}>
        <OllamaModelView
          ollamaStatus={ollamaStatus ?? 'loading'}
          ollamaModels={ollamaModels ?? []}
          selectedModelId={selectedModelId}
          onChange={onChange}
          pullProgress={pullProgress ?? null}
          onPullModel={onPullModel ?? (() => { })}
          onCancelPull={onCancelPull ?? (() => { })}
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
