import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import type {
  MemoryImpactSignal,
  MemoryLayer,
  MemoryPromotionConfirmRequest,
  MemoryPromotionConfirmResult,
  MemoryPromotionDecision,
  MemoryPromotionEvaluationRequest,
  MemoryPromotionReason,
} from '../../types/assistant';
import { getDb } from '../db';
import { settings } from '../db/schema';

const PROFILE_AUTO_PROMOTE_CONFIDENCE = 0.86;
const PATTERN_AUTO_PROMOTE_CONFIDENCE = 0.9;

const AMBIGUOUS_MARKERS = [
  /\bmaybe\b/i,
  /\bmight\b/i,
  /\bprobably\b/i,
  /\bnot sure\b/i,
  /\bi think\b/i,
  /\bguess\b/i,
  /\bseems\b/i,
];

const HIGH_IMPACT_SIGNALS: Set<MemoryImpactSignal> = new Set([
  'financial',
  'client_commitment',
  'hard_deadline',
  'identity_preference',
]);

const ALL_IMPACT_SIGNALS: Set<MemoryImpactSignal> = new Set([
  'financial',
  'client_commitment',
  'hard_deadline',
  'identity_preference',
]);

type PendingMemoryDecision = {
  proposedLayer: Exclude<MemoryLayer, 'journal'>;
  proposedEntry: string;
  confidence: number;
  impactSignals: MemoryImpactSignal[];
};

type PersistedMemoryDecision = PendingMemoryDecision & {
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  resolvedAt?: string;
};

const pendingMemoryConfirmations = new Map<string, PendingMemoryDecision>();
const PENDING_CONFIRMATION_KEY_PREFIX = 'assistant.memory.confirmation.';

const confirmationStorageKey = (confirmationId: string): string =>
  `${PENDING_CONFIRMATION_KEY_PREFIX}${confirmationId}`;

const isPendingLayer = (
  value: unknown,
): value is Exclude<MemoryLayer, 'journal'> =>
  value === 'profile' || value === 'patterns';

const normalizeImpactSignals = (value: unknown): MemoryImpactSignal[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((signal): signal is MemoryImpactSignal =>
    typeof signal === 'string' && ALL_IMPACT_SIGNALS.has(signal as MemoryImpactSignal),
  );
};

const parsePersistedDecision = (value: string): PersistedMemoryDecision | null => {
  try {
    const parsed = JSON.parse(value) as Partial<PersistedMemoryDecision>;

    if (
      !isPendingLayer(parsed.proposedLayer) ||
      typeof parsed.proposedEntry !== 'string' ||
      typeof parsed.confidence !== 'number' ||
      typeof parsed.createdAt !== 'string'
    ) {
      return null;
    }

    if (
      parsed.status !== 'pending' &&
      parsed.status !== 'approved' &&
      parsed.status !== 'rejected'
    ) {
      return null;
    }

    return {
      proposedLayer: parsed.proposedLayer,
      proposedEntry: parsed.proposedEntry,
      confidence: parsed.confidence,
      impactSignals: normalizeImpactSignals(parsed.impactSignals),
      status: parsed.status,
      createdAt: parsed.createdAt,
      resolvedAt: parsed.resolvedAt,
    };
  } catch {
    return null;
  }
};

const readPersistedDecision = (
  confirmationId: string,
): PersistedMemoryDecision | null => {
  try {
    const db = getDb();
    const key = confirmationStorageKey(confirmationId);
    const [row] = db
      .select({ value: settings.value })
      .from(settings)
      .where(eq(settings.key, key))
      .all();

    if (!row) {
      return null;
    }

    return parsePersistedDecision(row.value);
  } catch {
    return null;
  }
};

const persistDecision = (
  confirmationId: string,
  decision: PersistedMemoryDecision,
): void => {
  try {
    const db = getDb();
    const key = confirmationStorageKey(confirmationId);
    const value = JSON.stringify(decision);

    db.insert(settings)
      .values({ key, value })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value },
      })
      .run();
  } catch {
    // Keep in-memory fallback if DB is unavailable.
  }
};

const getPendingDecision = (
  confirmationId: string,
): PendingMemoryDecision | undefined => {
  const inMemory = pendingMemoryConfirmations.get(confirmationId);
  if (inMemory) {
    return inMemory;
  }

  const persisted = readPersistedDecision(confirmationId);
  if (!persisted || persisted.status !== 'pending') {
    return undefined;
  }

  const restored: PendingMemoryDecision = {
    proposedLayer: persisted.proposedLayer,
    proposedEntry: persisted.proposedEntry,
    confidence: persisted.confidence,
    impactSignals: persisted.impactSignals,
  };

  pendingMemoryConfirmations.set(confirmationId, restored);
  return restored;
};

const markDecisionResolved = (
  confirmationId: string,
  pending: PendingMemoryDecision,
  approved: boolean,
): void => {
  const existing = readPersistedDecision(confirmationId);
  const now = new Date().toISOString();

  persistDecision(confirmationId, {
    ...pending,
    status: approved ? 'approved' : 'rejected',
    createdAt: existing?.createdAt ?? now,
    resolvedAt: now,
  });
};

const sanitizeObservation = (value: string): string =>
  value.replace(/\s+/g, ' ').trim();

const isAmbiguous = (observation: string): boolean =>
  AMBIGUOUS_MARKERS.some((pattern) => pattern.test(observation));

const clamp = (value: number, min = 0, max = 1): number =>
  Math.min(max, Math.max(min, value));

const inferLayer = (
  observation: string,
): Exclude<MemoryLayer, 'journal'> => {
  if (/\b(always|usually|every|routine|template|workflow|process)\b/i.test(observation)) {
    return 'patterns';
  }

  return 'profile';
};

const inferConfidence = (
  observation: string,
  layer: Exclude<MemoryLayer, 'journal'>,
): number => {
  let score = 0.68;

  if (isAmbiguous(observation)) {
    score -= 0.25;
  }

  if (/\b(always|never|every|usually|typically)\b/i.test(observation)) {
    score += 0.12;
  }

  if (/\b(i prefer|i work best|i dislike|my preference)\b/i.test(observation)) {
    score += 0.08;
  }

  if (layer === 'patterns' && /\b(client|project|workflow|process|template)\b/i.test(observation)) {
    score += 0.08;
  }

  return clamp(score);
};

const detectImpactSignals = (observation: string): MemoryImpactSignal[] => {
  const signals = new Set<MemoryImpactSignal>();

  if (/\b(invoice|cashflow|paid|overdue|\$|\d+\s*(usd|dollars?))\b/i.test(observation)) {
    signals.add('financial');
  }

  if (/\b(client|promised|commitment|agreed|deliverable|scope)\b/i.test(observation)) {
    signals.add('client_commitment');
  }

  if (/\b(deadline|due|by\s+\w+|eod|end of day|tomorrow|hard deadline)\b/i.test(observation)) {
    signals.add('hard_deadline');
  }

  if (/\b(i prefer|i hate|i always|i never|my style|works best for me)\b/i.test(observation)) {
    signals.add('identity_preference');
  }

  return [...signals];
};

const toAtomicEntry = (observation: string): string => {
  const clean = sanitizeObservation(
    observation
      .replace(/^["'\-*\s]+/, '')
      .replace(/["']+$/g, ''),
  );

  if (clean.length <= 160) {
    return clean;
  }

  return `${clean.slice(0, 157).trimEnd()}...`;
};

const makeDecision = (
  action: MemoryPromotionDecision['action'],
  layer: MemoryLayer,
  entry: string,
  confidence: number,
  reasons: MemoryPromotionReason[],
  impactSignals: MemoryImpactSignal[],
  confirmationId?: string,
): MemoryPromotionDecision => {
  const requiresConfirmation = action === 'needs_confirmation';

  return {
    action,
    proposedLayer: layer,
    proposedEntry: entry,
    confidence,
    requiresConfirmation,
    reasons,
    impactSignals,
    confirmationId,
    confirmationPrompt: requiresConfirmation
      ? `Save this ${layer} memory entry? "${entry}"`
      : undefined,
  };
};

export const evaluateMemoryPromotion = (
  request: MemoryPromotionEvaluationRequest,
): MemoryPromotionDecision => {
  const observation = sanitizeObservation(request.observation);

  if (observation.length === 0) {
    return makeDecision(
      'journal_only',
      'journal',
      '',
      0,
      ['invalid_observation'],
      [],
    );
  }

  const proposedLayer = request.candidateLayer ?? inferLayer(observation);
  const confidence = clamp(
    request.confidence ?? inferConfidence(observation, proposedLayer),
  );
  const detectedSignals = detectImpactSignals(observation);
  const impactSignals = [...new Set([...(request.impactSignals ?? []), ...detectedSignals])];
  const entry = toAtomicEntry(observation);
  const reasons: MemoryPromotionReason[] = [];
  const hasHighImpactSignal = impactSignals.some((signal) =>
    HIGH_IMPACT_SIGNALS.has(signal),
  );

  if (isAmbiguous(observation)) {
    reasons.push('ambiguous_statement');
  }

  if (hasHighImpactSignal) {
    const confirmationId = randomUUID();
    const pendingDecision: PendingMemoryDecision = {
      proposedLayer,
      proposedEntry: entry,
      confidence,
      impactSignals,
    };
    pendingMemoryConfirmations.set(confirmationId, pendingDecision);
    persistDecision(confirmationId, {
      ...pendingDecision,
      status: 'pending',
      createdAt: new Date().toISOString(),
    });

    reasons.push('high_impact_assumption');

    return makeDecision(
      'needs_confirmation',
      proposedLayer,
      entry,
      confidence,
      reasons,
      impactSignals,
      confirmationId,
    );
  }

  const threshold =
    proposedLayer === 'patterns'
      ? PATTERN_AUTO_PROMOTE_CONFIDENCE
      : PROFILE_AUTO_PROMOTE_CONFIDENCE;

  if (confidence >= threshold && reasons.length === 0) {
    return makeDecision(
      proposedLayer === 'patterns' ? 'promote_patterns' : 'promote_profile',
      proposedLayer,
      entry,
      confidence,
      [],
      impactSignals,
    );
  }

  if (confidence < threshold) {
    reasons.push('low_confidence');
  }

  return makeDecision(
    'journal_only',
    'journal',
    entry,
    confidence,
    reasons,
    impactSignals,
  );
};

export const resolveMemoryPromotionConfirmation = (
  request: MemoryPromotionConfirmRequest,
): MemoryPromotionConfirmResult => {
  const pending = getPendingDecision(request.confirmationId);

  if (!pending) {
    return {
      resolved: false,
      decision: makeDecision(
        'journal_only',
        'journal',
        '',
        0,
        ['unknown_pending_decision'],
        [],
      ),
    };
  }

  pendingMemoryConfirmations.delete(request.confirmationId);
  markDecisionResolved(request.confirmationId, pending, request.approved);

  if (request.approved) {
    return {
      resolved: true,
      decision: makeDecision(
        pending.proposedLayer === 'patterns'
          ? 'promote_patterns'
          : 'promote_profile',
        pending.proposedLayer,
        pending.proposedEntry,
        pending.confidence,
        ['user_confirmed'],
        pending.impactSignals,
      ),
    };
  }

  return {
    resolved: true,
    decision: makeDecision(
      'journal_only',
      'journal',
      pending.proposedEntry,
      pending.confidence,
      ['user_rejected'],
      pending.impactSignals,
    ),
  };
};
