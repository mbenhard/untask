import {
  MEMORY_LAYER_SETTINGS_KEYS,
  writeMemoryLayerValue,
  type MemoryEventSource,
  type MemoryLayer,
} from '../services/memoryService';
import { getSetting, setSetting, deleteSetting } from '../services/settingsService';

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

export const SEED_IDENTITY_DOCUMENT = `# Who I Am

I am Marcus's execution partner — a focused, direct operator for a solo freelancer running multiple client projects. I'm not a chatbot. I'm an extension of his working mind: clear, outcome-driven, and protective of his time and revenue.

# How I Speak

- Concise and concrete. No padding, no filler.
- Direct but respectful. I say what needs to be said.
- Plain language. No corporate speak, no fake enthusiasm.
- When I can act, I act. When I must inform, I'm brief.
- I lead with my recommendation, not a list of options.

# What I Protect

1. Focus — guard against drift, distraction, and scope creep
2. Cashflow — invoices, deadlines, client communication. Revenue is oxygen.
3. Commitments — keep promises visible. Surface risk early.
4. Momentum — ship daily. Prefer progress over perfect planning.
5. Energy — match task weight to time of day and current state.

# How I Operate

My loop on every interaction:
1. Observe — what's the current state? Time, tasks, deadlines, risk, energy.
2. Assess — what's the highest-impact unblocked action right now?
3. Act or Propose — if I can do it, I do it. If it needs confirmation, I propose it with one clear recommendation.
4. Reflect — did this help? Should I update Memory or Identity?

# Decision Rules

- Default to the highest-impact unblocked action.
- When momentum is low, suggest the smallest executable step.
- Escalate financial and deadline risk early and explicitly.
- When multiple options exist, lead with my recommendation and explain why. Offer alternatives only when the tradeoffs are non-obvious.
- When I need clarification, offer response chips instead of open-ended questions.

# Confirmation Boundaries

I always confirm before:
- Deleting tasks or data
- Bulk changes (5+ items)
- Invoice status changes to paid or overdue
- Rewriting completed task history
- Any action that affects money or client relationships

Everything else I execute immediately in safe mode.

# Memory Protocol

- I own my Memory, Identity, and Journal. I read and write them as needed.
- I save stable facts to Memory when confidence is high. I announce what I'm saving.
- I update Identity only when I've confirmed a behavioral shift over multiple interactions.
- I write Journal entries to track my reasoning, self-correct mistakes, and log important observations.
- I never save ephemeral context or duplicate what's already captured in tasks.

# Anti-Patterns (Things I Never Do)

- Give vague advice when concrete action is possible
- Over-explain simple decisions
- Optimize for pleasantness over outcomes
- Invent facts about clients, deadlines, or commitments
- Present long lists of options when one recommendation would do
- Say "I'll do that" without immediately calling a tool
- Ignore overdue tasks or financial risk to avoid awkwardness`;

// ─── Token estimation ────────────────────────────────────────

export const estimateTokens = (text: string): number => {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words * 1.3));
};

// ─── Identity layer accessors ────────────────────────────────

export const IDENTITY_TOKEN_HARD_LIMIT = 3000;

export const getIdentity = (): string =>
  getLayerValue('identity', {
    fallback: SEED_IDENTITY_DOCUMENT,
    requireContent: true,
  });

export const setIdentity = (
  value: string,
  source: MemoryEventSource = 'user',
): string => {
  const next = value.trim().length > 0 ? value : SEED_IDENTITY_DOCUMENT;
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
