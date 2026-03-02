import { SettingsRow } from './SettingsRow';
import { SettingsSelect } from './SettingsSelect';

type ProviderType = 'openrouter' | 'openai' | 'anthropic' | 'ollama' | 'inception';

const PROVIDER_OPTIONS: { value: ProviderType; label: string }[] = [
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'ollama', label: 'Ollama (local) experimental' },
  { value: 'inception', label: 'Inception Labs experimental' },
];

type ProviderSelectorProps = {
  provider: ProviderType;
  loading: boolean;
  onChange: (value: string) => void;
};

export const ProviderSelector = ({ provider, loading, onChange }: ProviderSelectorProps) => (
  <SettingsRow label="AI provider" loading={loading}>
    <SettingsSelect
      options={PROVIDER_OPTIONS}
      value={provider}
      onChange={onChange}
      aria-label="AI provider"
    />
  </SettingsRow>
);
