import type { AssistantMemorySnapshot } from '../../types/assistant';
import { readJournalEntries } from '../services/journalService';
import { getSetting, setSetting } from '../services/settingsService';

export const CANONICAL_MEMORY_KEYS = {
  soul: 'ai_soul',
  profile: 'ai_user_profile',
  patterns: 'ai_patterns',
} as const;

const LEGACY_MEMORY_KEYS = {
  soul: ['assistant.memory.soul'],
  profile: ['assistant.memory.profile'],
  patterns: ['assistant.memory.patterns'],
} as const;

export const DEFAULT_SOUL_MEMORY =
  "You are a direct, helpful productivity assistant for a solo freelancer. Push me to be productive but don't be annoying. Be concise. No corporate fluff.";

type MemoryLayer = keyof typeof CANONICAL_MEMORY_KEYS;

const hasContent = (value: string | null): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const migrateLegacyLayer = (layer: MemoryLayer): string | null => {
  const canonicalKey = CANONICAL_MEMORY_KEYS[layer];
  const legacyKeys = LEGACY_MEMORY_KEYS[layer];

  for (const legacyKey of legacyKeys) {
    const legacyValue = getSetting(legacyKey);
    if (legacyValue === null) {
      continue;
    }

    setSetting(canonicalKey, legacyValue);
    return legacyValue;
  }

  return null;
};

const getLayerValue = (
  layer: MemoryLayer,
  options?: { fallback?: string; requireContent?: boolean },
): string => {
  const canonicalKey = CANONICAL_MEMORY_KEYS[layer];
  const current = getSetting(canonicalKey);
  const shouldRequireContent = options?.requireContent ?? false;

  if (
    current !== null &&
    (!shouldRequireContent || hasContent(current))
  ) {
    return current;
  }

  const migrated = migrateLegacyLayer(layer);
  if (migrated !== null && (!shouldRequireContent || hasContent(migrated))) {
    return migrated;
  }

  if (typeof options?.fallback === 'string') {
    setSetting(canonicalKey, options.fallback);
    return options.fallback;
  }

  if (current !== null) {
    return current;
  }

  return '';
};

const setLayerValue = (layer: MemoryLayer, value: string): string => {
  setSetting(CANONICAL_MEMORY_KEYS[layer], value);
  return value;
};

const appendMemoryEntry = (
  read: () => string,
  write: (value: string) => string,
  entry: string,
): string => {
  const normalized = entry.trim();
  if (normalized.length === 0) {
    throw new Error('Memory entry cannot be empty.');
  }

  const existing = read();
  const lines = existing
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const bullet = normalized.startsWith('- ') ? normalized : `- ${normalized}`;

  if (lines.some((line) => line.toLowerCase() === bullet.toLowerCase())) {
    return existing;
  }

  const next = existing.trim().length === 0 ? bullet : `${existing.trimEnd()}\n${bullet}`;
  write(next);
  return next;
};

export const getSoul = (): string =>
  getLayerValue('soul', {
    fallback: DEFAULT_SOUL_MEMORY,
    requireContent: true,
  });

export const setSoul = (value: string): string => {
  const next = value.trim().length > 0 ? value : DEFAULT_SOUL_MEMORY;
  return setLayerValue('soul', next);
};

export const resetSoul = (): string => setLayerValue('soul', DEFAULT_SOUL_MEMORY);

export const getProfile = (): string => getLayerValue('profile');

export const setProfile = (value: string): string => setLayerValue('profile', value);

export const appendProfileEntry = (entry: string): string =>
  appendMemoryEntry(getProfile, setProfile, entry);

export const getPatterns = (): string => getLayerValue('patterns');

export const setPatterns = (value: string): string => setLayerValue('patterns', value);

export const appendPatternEntry = (entry: string): string =>
  appendMemoryEntry(getPatterns, setPatterns, entry);

export const migrateLegacyMemoryKeys = (): void => {
  void getSoul();
  void getProfile();
  void getPatterns();
};

export const buildAssistantMemorySnapshot = (
  options?: { journalLimit?: number },
): AssistantMemorySnapshot => ({
  soul: getSoul(),
  profile: getProfile(),
  patterns: getPatterns(),
  journalEntries: readJournalEntries({
    limit: options?.journalLimit ?? 24,
  }),
});
