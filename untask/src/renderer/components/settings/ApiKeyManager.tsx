import { Button } from '../ui/button';
import { Input } from '../ui/input';

type ProviderType = 'openrouter' | 'openai' | 'anthropic' | 'ollama';

const PROVIDER_LABELS: Record<ProviderType, string> = {
  openrouter: 'OpenRouter',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  ollama: 'Ollama',
};

const PROVIDER_KEY_LINKS: Record<ProviderType, string | null> = {
  openrouter: 'https://openrouter.ai/keys',
  openai: 'https://platform.openai.com/api-keys',
  anthropic: 'https://console.anthropic.com/settings/keys',
  ollama: 'https://ollama.com/download',
};

const PROVIDER_KEY_PLACEHOLDER: Record<ProviderType, string> = {
  openrouter: 'sk-or-...',
  openai: 'sk-...',
  anthropic: 'sk-ant-...',
  ollama: '',
};

// ─── Keyed Provider (API Key) ────────────────────────────────────────────────

type KeyedApiKeyManagerProps = {
  provider: ProviderType;
  apiKeyInput: string;
  onApiKeyInputChange: (value: string) => void;
  hasApiKey: boolean;
  isLoadingApiKey: boolean;
  isSavingApiKey: boolean;
  apiKeyValid: boolean | null;
  apiKeyValidating: boolean;
  apiKeyError: string | null;
  onValidate: () => void;
  onSave: () => void;
  onClear: () => void;
};

const KeyedApiKeyManager = ({
  provider,
  apiKeyInput,
  onApiKeyInputChange,
  hasApiKey,
  isLoadingApiKey,
  isSavingApiKey,
  apiKeyValid,
  apiKeyValidating,
  apiKeyError,
  onValidate,
  onSave,
  onClear,
}: KeyedApiKeyManagerProps) => {
  const keyLink = PROVIDER_KEY_LINKS[provider];

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Input
          type="password"
          value={apiKeyInput}
          onChange={(event) => onApiKeyInputChange(event.target.value)}
          placeholder={
            isLoadingApiKey
              ? 'Checking...'
              : hasApiKey
                ? 'Saved key (enter to replace)'
                : PROVIDER_KEY_PLACEHOLDER[provider]
          }
          disabled={isLoadingApiKey || isSavingApiKey}
          className="h-7 flex-1 text-[11px]"
          aria-label={`${PROVIDER_LABELS[provider]} API key`}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onValidate}
          disabled={isLoadingApiKey || isSavingApiKey || apiKeyValidating || apiKeyInput.trim().length === 0}
          className="h-7 text-[11px]"
        >
          {apiKeyValidating ? 'Checking...' : 'Validate'}
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={onSave}
          disabled={isLoadingApiKey || isSavingApiKey || apiKeyInput.trim().length === 0}
          className="h-7 text-[11px]"
        >
          Save
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onClear}
          disabled={isLoadingApiKey || isSavingApiKey || !hasApiKey}
          className="h-7 text-[11px]"
        >
          Clear
        </Button>
      </div>

      {/* Status line */}
      <div className="flex items-center gap-1.5">
        {apiKeyValid === true ? (
          <span className="text-[11px] text-green-600 dark:text-green-400">Key is valid.</span>
        ) : apiKeyError ? (
          <span className="text-[11px] text-destructive">{apiKeyError}</span>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            {isLoadingApiKey
              ? 'Checking key status...'
              : hasApiKey
                ? 'A key is currently saved.'
                : 'No key saved yet.'}
          </p>
        )}
      </div>

      {/* "Where do I get a key?" link */}
      {keyLink ? (
        <p className="text-[11px] text-muted-foreground">
          <a
            href={keyLink}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Where do I get a {PROVIDER_LABELS[provider]} key?
          </a>
        </p>
      ) : null}
    </div>
  );
};

// ─── Ollama Connection ───────────────────────────────────────────────────────

type OllamaConnectionManagerProps = {
  ollamaBaseUrl: string;
  onOllamaBaseUrlChange: (value: string) => void;
  isLoadingOllamaUrl: boolean;
  isSavingOllamaUrl: boolean;
  defaultOllamaBaseUrl: string;
  onSave: () => void;
};

const OllamaConnectionManager = ({
  ollamaBaseUrl,
  onOllamaBaseUrlChange,
  isLoadingOllamaUrl,
  isSavingOllamaUrl,
  defaultOllamaBaseUrl,
  onSave,
}: OllamaConnectionManagerProps) => {
  const keyLink = PROVIDER_KEY_LINKS.ollama;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Input
          type="text"
          value={ollamaBaseUrl}
          onChange={(event) => onOllamaBaseUrlChange(event.target.value)}
          placeholder={defaultOllamaBaseUrl}
          disabled={isLoadingOllamaUrl || isSavingOllamaUrl}
          className="h-7 flex-1 text-[11px]"
          aria-label="Ollama base URL"
        />
        <Button
          type="button"
          size="sm"
          onClick={onSave}
          disabled={isLoadingOllamaUrl || isSavingOllamaUrl}
          className="h-7 text-[11px]"
        >
          Save
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Ollama runs locally. No API key required.{' '}
        {keyLink ? (
          <a
            href={keyLink}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Install Ollama
          </a>
        ) : null}
      </p>
    </div>
  );
};

// ─── Combined Export ─────────────────────────────────────────────────────────

export type ApiKeyManagerProps = {
  provider: ProviderType;
  // Keyed provider props
  apiKeyInput: string;
  onApiKeyInputChange: (value: string) => void;
  hasApiKey: boolean;
  isLoadingApiKey: boolean;
  isSavingApiKey: boolean;
  apiKeyValid: boolean | null;
  apiKeyValidating: boolean;
  apiKeyError: string | null;
  onValidateApiKey: () => void;
  onSaveApiKey: () => void;
  onClearApiKey: () => void;
  // Ollama props
  ollamaBaseUrl: string;
  onOllamaBaseUrlChange: (value: string) => void;
  isLoadingOllamaUrl: boolean;
  isSavingOllamaUrl: boolean;
  defaultOllamaBaseUrl: string;
  onSaveOllamaUrl: () => void;
};

export const ApiKeyManager = (props: ApiKeyManagerProps) => {
  const isKeyedProvider = props.provider !== 'ollama';

  return (
    <div className="px-2 py-2">
      {isKeyedProvider ? (
        <KeyedApiKeyManager
          provider={props.provider}
          apiKeyInput={props.apiKeyInput}
          onApiKeyInputChange={props.onApiKeyInputChange}
          hasApiKey={props.hasApiKey}
          isLoadingApiKey={props.isLoadingApiKey}
          isSavingApiKey={props.isSavingApiKey}
          apiKeyValid={props.apiKeyValid}
          apiKeyValidating={props.apiKeyValidating}
          apiKeyError={props.apiKeyError}
          onValidate={props.onValidateApiKey}
          onSave={props.onSaveApiKey}
          onClear={props.onClearApiKey}
        />
      ) : (
        <OllamaConnectionManager
          ollamaBaseUrl={props.ollamaBaseUrl}
          onOllamaBaseUrlChange={props.onOllamaBaseUrlChange}
          isLoadingOllamaUrl={props.isLoadingOllamaUrl}
          isSavingOllamaUrl={props.isSavingOllamaUrl}
          defaultOllamaBaseUrl={props.defaultOllamaBaseUrl}
          onSave={props.onSaveOllamaUrl}
        />
      )}
    </div>
  );
};
