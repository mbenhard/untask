import { useCallback, useEffect, useState } from 'react';

import type { ChatModelCatalogEntry } from '../../../types/chat';
import { getFlusk } from '../../lib/flusk';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { SegmentedControl } from './SegmentedControl';
import { SettingsRow } from './SettingsRow';
import { SettingsSection } from './SettingsSection';
import { SettingsSelect } from './SettingsSelect';

const OPENROUTER_API_KEY_SETTING_KEY = 'ai_openrouter_key';

type SettingsAIProps = {
  setError: (error: string | null) => void;
  setNotice: (notice: string | null) => void;
};

export const SettingsAI = ({ setError, setNotice }: SettingsAIProps) => {
  const [openRouterApiKeyInput, setOpenRouterApiKeyInput] = useState('');
  const [hasOpenRouterApiKey, setHasOpenRouterApiKey] = useState(false);
  const [isLoadingOpenRouterApiKey, setIsLoadingOpenRouterApiKey] = useState(false);
  const [isSavingOpenRouterApiKey, setIsSavingOpenRouterApiKey] = useState(false);
  const [models, setModels] = useState<ChatModelCatalogEntry[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [autonomyMode, setAutonomyMode] = useState<'auto' | 'confirm'>('auto');
  const [isLoadingAutonomy, setIsLoadingAutonomy] = useState(false);
  const [retentionMode, setRetentionMode] = useState<'session' | '30d' | 'forever'>('session');
  const [isLoadingRetention, setIsLoadingRetention] = useState(false);

  const loadOpenRouterApiKey = useCallback(async () => {
    try {
      setIsLoadingOpenRouterApiKey(true);
      setError(null);
      const stored = await getFlusk().settings.get(OPENROUTER_API_KEY_SETTING_KEY);
      setHasOpenRouterApiKey(Boolean(stored && stored.trim().length > 0));
      setOpenRouterApiKeyInput('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load OpenRouter API key.');
    } finally {
      setIsLoadingOpenRouterApiKey(false);
    }
  }, [setError]);

  const loadModels = useCallback(async () => {
    try {
      setIsLoadingModels(true);
      const catalog = await getFlusk().chat.getModels();
      setModels(catalog);
      const selected = catalog.find((m) => m.selected);
      if (selected) {
        setSelectedModelId(selected.id);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load models.');
    } finally {
      setIsLoadingModels(false);
    }
  }, [setError]);

  const loadAutonomyMode = useCallback(async () => {
    try {
      setIsLoadingAutonomy(true);
      const result = await getFlusk().chat.getAutonomyMode();
      setAutonomyMode(result.mode);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load autonomy mode.');
    } finally {
      setIsLoadingAutonomy(false);
    }
  }, [setError]);

  const loadRetentionMode = useCallback(async () => {
    try {
      setIsLoadingRetention(true);
      const result = await getFlusk().chat.getRetentionMode();
      setRetentionMode(result.mode);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load retention mode.');
    } finally {
      setIsLoadingRetention(false);
    }
  }, [setError]);

  useEffect(() => {
    void loadOpenRouterApiKey();
    void loadModels();
    void loadAutonomyMode();
    void loadRetentionMode();
  }, [loadOpenRouterApiKey, loadModels, loadAutonomyMode, loadRetentionMode]);

  const handleModelChange = useCallback(
    async (modelId: string) => {
      const previousId = selectedModelId;
      setSelectedModelId(modelId);
      setNotice(null);
      setError(null);

      try {
        const result = await getFlusk().chat.setSelectedModel({ modelId });
        setSelectedModelId(result.modelId);
        setNotice('Model updated.');
      } catch (saveError) {
        setSelectedModelId(previousId);
        setError(saveError instanceof Error ? saveError.message : 'Failed to update model.');
      }
    },
    [selectedModelId, setError, setNotice],
  );

  const handleAutonomyChange = useCallback(
    async (mode: 'auto' | 'confirm') => {
      const previousMode = autonomyMode;
      setAutonomyMode(mode);
      setNotice(null);
      setError(null);

      try {
        const result = await getFlusk().chat.setAutonomyMode({ mode });
        setAutonomyMode(result.mode);
        setNotice(`Autonomy mode set to ${result.mode}.`);
      } catch (saveError) {
        setAutonomyMode(previousMode);
        setError(saveError instanceof Error ? saveError.message : 'Failed to update autonomy mode.');
      }
    },
    [autonomyMode, setError, setNotice],
  );

  const handleRetentionChange = useCallback(
    async (mode: 'session' | '30d' | 'forever') => {
      const previousMode = retentionMode;
      setRetentionMode(mode);
      setNotice(null);
      setError(null);

      try {
        const result = await getFlusk().chat.setRetentionMode({ mode });
        setRetentionMode(result.mode);
        setNotice(`Chat retention set to ${mode === '30d' ? '30 days' : mode}.`);
      } catch (saveError) {
        setRetentionMode(previousMode);
        setError(saveError instanceof Error ? saveError.message : 'Failed to update retention mode.');
      }
    },
    [retentionMode, setError, setNotice],
  );

  const saveOpenRouterApiKey = useCallback(async () => {
    const normalized = openRouterApiKeyInput.trim();
    if (normalized.length === 0) {
      setError('Enter an OpenRouter API key before saving.');
      return;
    }

    try {
      setIsSavingOpenRouterApiKey(true);
      setError(null);
      setNotice(null);
      await getFlusk().settings.set(OPENROUTER_API_KEY_SETTING_KEY, normalized);
      setHasOpenRouterApiKey(true);
      setOpenRouterApiKeyInput('');
      setNotice('OpenRouter API key saved.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save OpenRouter API key.');
    } finally {
      setIsSavingOpenRouterApiKey(false);
    }
  }, [openRouterApiKeyInput, setError, setNotice]);

  const clearOpenRouterApiKey = useCallback(async () => {
    try {
      setIsSavingOpenRouterApiKey(true);
      setError(null);
      setNotice(null);
      await getFlusk().settings.set(OPENROUTER_API_KEY_SETTING_KEY, '');
      setHasOpenRouterApiKey(false);
      setOpenRouterApiKeyInput('');
      setNotice('OpenRouter API key cleared.');
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : 'Failed to clear OpenRouter API key.');
    } finally {
      setIsSavingOpenRouterApiKey(false);
    }
  }, [setError, setNotice]);

  return (
    <div role="tabpanel" id="settings-panel-ai" className="space-y-6">
      <SettingsSection title="Model">
        <SettingsRow label="Active model" loading={isLoadingModels}>
          <SettingsSelect
            options={models.map((m) => ({ value: m.id, label: m.label }))}
            value={selectedModelId ?? ''}
            onChange={(v) => void handleModelChange(v)}
            aria-label="AI model"
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Behavior">
        <SettingsRow label="Autonomy" loading={isLoadingAutonomy}>
          <SegmentedControl
            options={[
              { value: 'auto' as const, label: 'Auto' },
              { value: 'confirm' as const, label: 'Confirm' },
            ]}
            value={autonomyMode}
            onChange={(v) => void handleAutonomyChange(v as 'auto' | 'confirm')}
          />
        </SettingsRow>
        <SettingsRow label="Chat retention" loading={isLoadingRetention}>
          <SegmentedControl
            options={[
              { value: 'session' as const, label: 'Session' },
              { value: '30d' as const, label: '30 days' },
              { value: 'forever' as const, label: 'Forever' },
            ]}
            value={retentionMode}
            onChange={(v) => void handleRetentionChange(v as 'session' | '30d' | 'forever')}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="API">
        <div className="py-2.5">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Input
                type="password"
                value={openRouterApiKeyInput}
                onChange={(event) => setOpenRouterApiKeyInput(event.target.value)}
                placeholder={hasOpenRouterApiKey ? 'Saved key (enter to replace)' : 'sk-or-...'}
                disabled={isLoadingOpenRouterApiKey || isSavingOpenRouterApiKey}
                className="h-8 flex-1 text-[12px]"
                aria-label="OpenRouter API key"
              />
              <Button
                type="button"
                size="sm"
                onClick={() => void saveOpenRouterApiKey()}
                disabled={isLoadingOpenRouterApiKey || isSavingOpenRouterApiKey}
                className="h-8 text-[11px]"
              >
                Save
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => void clearOpenRouterApiKey()}
                disabled={isLoadingOpenRouterApiKey || isSavingOpenRouterApiKey || !hasOpenRouterApiKey}
                className="h-8 text-[11px]"
              >
                Clear
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {isLoadingOpenRouterApiKey
                ? 'Checking key status...'
                : hasOpenRouterApiKey
                  ? 'A key is currently saved.'
                  : 'No key saved yet.'}
            </p>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
};
