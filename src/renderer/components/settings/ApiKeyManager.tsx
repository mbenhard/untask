import { useState } from 'react';

import { Button } from '../ui/button';
import { Input } from '../ui/input';

type ProviderType = 'openrouter' | 'openai' | 'anthropic' | 'ollama' | 'inception';

const PROVIDER_LABELS: Record<ProviderType, string> = {
  openrouter: 'OpenRouter',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  ollama: 'Ollama',
  inception: 'Inception Labs',
};

const PROVIDER_KEY_LINKS: Record<ProviderType, string | null> = {
  openrouter: 'https://openrouter.ai/keys',
  openai: 'https://platform.openai.com/api-keys',
  anthropic: 'https://console.anthropic.com/settings/keys',
  ollama: 'https://ollama.com/download',
  inception: 'https://platform.inceptionlabs.ai',
};

const PROVIDER_KEY_PLACEHOLDER: Record<ProviderType, string> = {
  openrouter: 'sk-or-...',
  openai: 'sk-...',
  anthropic: 'sk-ant-...',
  ollama: '',
  inception: 'ink-...',
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

      {/* Status line + "Where do I get a key?" link */}
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
        {keyLink ? (
          <a
            href={keyLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Where do I get a {PROVIDER_LABELS[provider]} key?
          </a>
        ) : null}
      </div>
    </div>
  );
};

// ─── Ollama Connection ───────────────────────────────────────────────────────

export type OllamaConnectionStatus = 'not_installed' | 'not_running' | 'ready' | 'loading';

type OllamaConnectionManagerProps = {
  ollamaBaseUrl: string;
  onOllamaBaseUrlChange: (value: string) => void;
  isLoadingOllamaUrl: boolean;
  isSavingOllamaUrl: boolean;
  defaultOllamaBaseUrl: string;
  onSave: () => Promise<boolean>;
  ollamaStatus?: OllamaConnectionStatus;
  detectedBaseUrl?: string;
};

const OllamaConnectionManager = ({
  ollamaBaseUrl,
  onOllamaBaseUrlChange,
  isLoadingOllamaUrl,
  isSavingOllamaUrl,
  defaultOllamaBaseUrl,
  onSave,
  ollamaStatus,
  detectedBaseUrl,
}: OllamaConnectionManagerProps) => {
  const [showCustomUrl, setShowCustomUrl] = useState(false);
  const displayUrl = detectedBaseUrl ?? defaultOllamaBaseUrl;

  const handleSave = async () => {
    const ok = await onSave();
    if (ok) setShowCustomUrl(false);
  };

  const renderStatusIndicator = () => {
    switch (ollamaStatus) {
      case 'loading':
        return (
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-muted-foreground" />
            <span className="text-[11px] text-muted-foreground">Detecting Ollama...</span>
          </div>
        );
      case 'ready':
        return (
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
            <span className="text-[11px] text-green-600 dark:text-green-400">
              Connected to {displayUrl}
            </span>
          </div>
        );
      case 'not_running':
        return (
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-yellow-500" />
            <span className="text-[11px] text-yellow-600 dark:text-yellow-400">
              Ollama not running
            </span>
          </div>
        );
      case 'not_installed':
        return (
          <p className="text-[11px] text-muted-foreground">
            Ollama not found.{' '}
            <a
              href="https://ollama.com/download"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Install Ollama
            </a>
          </p>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-1.5">
      {renderStatusIndicator()}

      {!showCustomUrl && ollamaStatus !== 'loading' && (
        <p className="text-[11px] text-muted-foreground">
          Ollama runs locally. No API key required.{' '}
          <button
            type="button"
            onClick={() => setShowCustomUrl(true)}
            className="underline underline-offset-2 hover:text-foreground"
          >
            Custom URL
          </button>
        </p>
      )}

      {showCustomUrl && (
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
            onClick={() => void handleSave()}
            disabled={isLoadingOllamaUrl || isSavingOllamaUrl}
            className="h-7 text-[11px]"
          >
            Save
          </Button>
        </div>
      )}
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
  onSaveOllamaUrl: () => Promise<boolean>;
  // Ollama detection props
  ollamaStatus?: OllamaConnectionStatus;
  detectedBaseUrl?: string;
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
          ollamaStatus={props.ollamaStatus}
          detectedBaseUrl={props.detectedBaseUrl}
        />
      )}
    </div>
  );
};
