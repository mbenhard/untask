import {
  MEMORY_LAYER_SETTINGS_KEYS,
  writeMemoryLayerValue,
  type MemoryEventSource,
  type MemoryLayer,
} from '../services/memoryService';
import { getSetting, setSetting, deleteSetting } from '../services/settingsService';

const getUserName = (): string => getSetting('user.name')?.trim() || '';

const hasContent = (value: string | null): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const getLayerValue = (
  layer: MemoryLayer,
  options?: { fallback?: string; requireContent?: boolean },
): string => {
  const canonicalKey = MEMORY_LAYER_SETTINGS_KEYS[layer];
  const current = getSetting(canonicalKey);
  const shouldRequireContent = options?.requireContent ?? false;

  if (
    current !== null &&
    (!shouldRequireContent || hasContent(current))
  ) {
    return current;
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

// ─── Seed Identity Document ──────────────────────────────────
// Merges SOUL.md + CHARTER.md into a single first-person document.
// Seeded into DB on first access. The AI evolves it over time.

export const buildSeedIdentityDocument = (name?: string): string => {
  const who = name || getUserName();
  const possessive = who ? `${who}'s` : "the user's";
  const ref = who || 'the user';

  return `You are ${possessive} personal assistant in Untask. Terse, direct, zero filler.

Clear intent → act via tools. No narration, no "I'll do X for you" — just do it.
Ambiguous → one short clarifying question. Never guess at destructive actions.
After tool calls → action cards already show results in the UI. Add text only if it provides value beyond what the cards show. Zero text is often ideal.

When ${ref} reveals durable personal facts (clients, projects, preferences, workflows), save them to Knowledge via update_memory.

You act through tools only. You cannot do anything in the physical world — no meetings, calls, audits. Suggest what ${ref} should do, never "I will."
If conversation history contains reverted or undone actions, do not re-execute them.
Use emit_chips for 2-4 concrete options when ${ref} needs to choose. Never write chips as text.`;
};

// ─── Token estimation ────────────────────────────────────────

export const estimateTokens = (text: string): number => {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words * 1.3));
};

// ─── Identity layer accessors ────────────────────────────────

export const IDENTITY_TOKEN_HARD_LIMIT = 3000;

export const getIdentity = (): string =>
  getLayerValue('identity', {
    fallback: buildSeedIdentityDocument(),
    requireContent: true,
  });

export const setIdentity = (
  value: string,
  source: MemoryEventSource = 'user',
): string => {
  const next = value.trim().length > 0 ? value : buildSeedIdentityDocument();
  return setLayerValue('identity', next, source);
};

// ─── Memory layer accessors ─────────────────────────────────

export const MEMORY_TOKEN_SOFT_LIMIT = 8000;
export const MEMORY_TOKEN_HARD_LIMIT = 15000;

export const getMemory = (): string => getLayerValue('memory');

export const setMemory = (
  value: string,
  source: MemoryEventSource = 'user',
): string => setLayerValue('memory', value, source);

/**
 * Read a specific section from the Memory document by heading.
 * Returns the full document if no section is specified.
 */
export const readMemorySection = (section?: string): string => {
  const full = getMemory();
  if (!section) return full;

  const pattern = new RegExp(
    `^## ${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`,
    'm',
  );
  const match = pattern.exec(full);
  if (!match) return '';

  const start = match.index;
  const rest = full.slice(start + match[0].length);
  const nextHeading = rest.search(/^## /m);
  const end = nextHeading === -1 ? full.length : start + match[0].length + nextHeading;

  return full.slice(start, end).trim();
};

/**
 * Update a section in the Memory document.
 * mode='merge' appends content to the section.
 * mode='replace' overwrites the section content.
 */
export const updateMemorySection = (
  section: string,
  content: string,
  mode: 'merge' | 'replace' = 'merge',
  source: MemoryEventSource = 'ai',
): { value: string; tokenWarning?: string } => {
  const full = getMemory();
  const heading = `## ${section}`;
  const pattern = new RegExp(
    `^## ${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`,
    'm',
  );
  const match = pattern.exec(full);

  let updated: string;

  if (!match) {
    // Section doesn't exist — append it
    const newSection = `${heading}\n${content.trim()}`;
    updated = full.trim().length === 0 ? newSection : `${full.trimEnd()}\n\n${newSection}`;
  } else {
    const sectionStart = match.index;
    const rest = full.slice(sectionStart + match[0].length);
    const nextHeading = rest.search(/^## /m);
    const sectionEnd = nextHeading === -1
      ? full.length
      : sectionStart + match[0].length + nextHeading;

    const before = full.slice(0, sectionStart);
    const after = full.slice(sectionEnd);

    if (mode === 'replace') {
      updated = `${before.trimEnd()}\n${heading}\n${content.trim()}\n${after.trimStart()}`.trim();
    } else {
      const existingContent = full.slice(sectionStart + match[0].length, sectionEnd).trim();
      const merged = existingContent.length > 0
        ? `${existingContent}\n${content.trim()}`
        : content.trim();
      updated = `${before.trimEnd()}\n${heading}\n${merged}\n${after.trimStart()}`.trim();
    }
  }

  const tokens = estimateTokens(updated);

  if (tokens > MEMORY_TOKEN_HARD_LIMIT) {
    throw new Error(
      `Memory document is ~${tokens} tokens (hard limit: ${MEMORY_TOKEN_HARD_LIMIT}). Compact it before writing — consolidate redundant entries, archive inactive sections, remove stale facts.`,
    );
  }

  setMemory(updated, source);

  const tokenWarning = tokens > MEMORY_TOKEN_SOFT_LIMIT
    ? `Memory is now ~${tokens} tokens. Consider consolidating older entries or archiving inactive client sections.`
    : undefined;

  return { value: updated, tokenWarning };
};

/**
 * Search the Memory document for a keyword.
 * Returns matching lines with their section headings.
 */
export const searchMemory = (query: string): { section: string; line: string }[] => {
  const full = getMemory();
  if (!full.trim()) return [];

  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  const results: { section: string; line: string }[] = [];
  let currentSection = 'General';

  for (const line of full.split(/\r?\n/)) {
    const headingMatch = line.match(/^## (.+)$/);
    if (headingMatch) {
      currentSection = headingMatch[1].trim();
      continue;
    }

    const lowerLine = line.toLowerCase();
    if (terms.some((term) => lowerLine.includes(term))) {
      results.push({ section: currentSection, line: line.trim() });
    }
  }

  return results;
};

// ─── One-time identity v2 migration ──────────────────────────
const IDENTITY_V2_MIGRATION_KEY = 'ai_identity_v2_migrated';
const LEGACY_IDENTITY_MARKERS = ['Observe → Assess → Act → Reflect', 'Focus Shield', 'How I Operate'];

export const migrateIdentityV2 = (): void => {
  if (getSetting(IDENTITY_V2_MIGRATION_KEY) === '1') return;

  const current = getIdentity();
  const needsReset = LEGACY_IDENTITY_MARKERS.some((marker) => current.includes(marker));

  if (needsReset) {
    setIdentity(buildSeedIdentityDocument(), 'system');
  }

  setSetting(IDENTITY_V2_MIGRATION_KEY, '1');
};

// ─── One-time legacy migration ───────────────────────────────
const LEGACY_MIGRATION_DONE_KEY = 'ai_legacy_memory_migrated';
const LEGACY_PROFILE_KEY = 'ai_user_profile';
const LEGACY_PATTERNS_KEY = 'ai_patterns';
const LEGACY_SOUL_KEY = 'ai_soul';

export const migrateLegacyMemoryLayers = (): void => {
  // Only run once
  const alreadyDone = getSetting(LEGACY_MIGRATION_DONE_KEY);
  if (alreadyDone === '1') return;

  const profile = getSetting(LEGACY_PROFILE_KEY);
  const patterns = getSetting(LEGACY_PATTERNS_KEY);
  const currentKnowledge = getMemory();

  // Merge profile into Knowledge ## Profile section
  if (profile && profile.trim().length > 0) {
    try {
      updateMemorySection(
        'Profile',
        profile.trim(),
        currentKnowledge.trim().length > 0 ? 'merge' : 'replace',
        'system',
      );
    } catch {
      // Token limit — skip, user can manually clean up
    }
  }

  // Merge patterns into Knowledge ## Workflows section
  if (patterns && patterns.trim().length > 0) {
    try {
      updateMemorySection('Workflows', patterns.trim(), 'merge', 'system');
    } catch {
      // Token limit — skip
    }
  }

  // Discard ai_soul (Identity supersedes it) — delete all legacy keys
  deleteSetting(LEGACY_PROFILE_KEY);
  deleteSetting(LEGACY_PATTERNS_KEY);
  deleteSetting(LEGACY_SOUL_KEY);

  // Mark migration as done
  setSetting(LEGACY_MIGRATION_DONE_KEY, '1');
};
