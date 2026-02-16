import type { AssistantMemorySnapshot } from '../../types/assistant';
import { readJournalEntries } from '../services/journalService';
import {
  MEMORY_LAYER_SETTINGS_KEYS,
  writeMemoryLayerValue,
  type MemoryEventSource,
  type MemoryLayer,
} from '../services/memoryService';
import { getSetting } from '../services/settingsService';

export const CANONICAL_MEMORY_KEYS = MEMORY_LAYER_SETTINGS_KEYS;

const LEGACY_MEMORY_KEYS = {
  soul: ['assistant.memory.soul'],
  profile: ['assistant.memory.profile'],
  patterns: ['assistant.memory.patterns'],
} as const;

export const DEFAULT_SOUL_MEMORY =
  "You are a direct, helpful productivity assistant for a solo freelancer. Push me to be productive but don't be annoying. Be concise. No corporate fluff.";

const hasContent = (value: string | null): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const migrateLegacyLayer = (layer: MemoryLayer): string | null => {
  const legacyKeys = LEGACY_MEMORY_KEYS[layer];

  for (const legacyKey of legacyKeys) {
    const legacyValue = getSetting(legacyKey);
    if (legacyValue === null) {
      continue;
    }

    writeMemoryLayerValue(layer, legacyValue, 'system');
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
    writeMemoryLayerValue(layer, options.fallback, 'system');
    return options.fallback;
  }

  if (current !== null) {
    return current;
  }

  return '';
};

const setLayerValue = (
  layer: MemoryLayer,
  value: string,
  source: MemoryEventSource = 'user',
): string => writeMemoryLayerValue(layer, value, source).value;

const appendMemoryEntry = (
  read: () => string,
  write: (value: string, source?: MemoryEventSource) => string,
  entry: string,
  source: MemoryEventSource = 'user',
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
  write(next, source);
  return next;
};

export const getSoul = (): string =>
  getLayerValue('soul', {
    fallback: DEFAULT_SOUL_MEMORY,
    requireContent: true,
  });

export const setSoul = (
  value: string,
  source: MemoryEventSource = 'user',
): string => {
  const next = value.trim().length > 0 ? value : DEFAULT_SOUL_MEMORY;
  return setLayerValue('soul', next, source);
};

export const resetSoul = (source: MemoryEventSource = 'user'): string =>
  setLayerValue('soul', DEFAULT_SOUL_MEMORY, source);

export const getProfile = (): string => getLayerValue('profile');

export const setProfile = (
  value: string,
  source: MemoryEventSource = 'user',
): string => setLayerValue('profile', value, source);

export const appendProfileEntry = (
  entry: string,
  source: MemoryEventSource = 'user',
): string =>
  appendMemoryEntry(getProfile, setProfile, entry, source);

export const getPatterns = (): string => getLayerValue('patterns');

export const setPatterns = (
  value: string,
  source: MemoryEventSource = 'user',
): string => setLayerValue('patterns', value, source);

export const appendPatternEntry = (
  entry: string,
  source: MemoryEventSource = 'user',
): string =>
  appendMemoryEntry(getPatterns, setPatterns, entry, source);

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
