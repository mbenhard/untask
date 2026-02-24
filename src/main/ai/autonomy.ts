import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import {
  SETTING_KEY_AI_AUTONOMY_MODE,
  SETTING_KEY_AI_AUTONOMY_PENDING_ACTIONS,
} from '../defaultSettings';
import { getSetting, setSetting } from '../services/settingsService';

// ─── Core types ──────────────────────────────────────────────

export type AutonomyMode = 'auto' | 'confirm';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type ActionLifecycle = 'pending' | 'executed' | 'rejected' | 'undone';

export type PendingAction = {
  actionId: string;
  toolName: string;
  input: unknown;
  riskLevel: RiskLevel;
  rationale: string;
  requiresHardConfirmation: boolean;
  createdAt: string;
  requestId?: string;
  conversationId?: string;
  createdByRequestId?: string;
  fingerprint?: string;
  expiresAt?: string;
  modeAtCreation: AutonomyMode;
  lifecycle: 'pending';
};

export type ResolvedAction = Omit<PendingAction, 'lifecycle'> & {
  lifecycle: 'executed' | 'rejected' | 'undone';
  resolvedAt: string;
  taskEventId?: string;
};

// ─── Mode policy ─────────────────────────────────────────────

const SETTINGS_KEY_AUTONOMY_MODE = SETTING_KEY_AI_AUTONOMY_MODE;
const SETTINGS_KEY_PENDING_ACTIONS = SETTING_KEY_AI_AUTONOMY_PENDING_ACTIONS;
export const DEFAULT_PENDING_ACTION_TTL_MS = 30 * 60 * 1000;

const VALID_MODES: ReadonlySet<AutonomyMode> = new Set(['auto', 'confirm']);

const DEFAULT_MODE: AutonomyMode = 'auto';

export const getAutonomyMode = (): AutonomyMode => {
  const raw = getSetting(SETTINGS_KEY_AUTONOMY_MODE);
  if (raw && VALID_MODES.has(raw as AutonomyMode)) {
    return raw as AutonomyMode;
  }
  // Migrate old values
  const MIGRATION_MAP: Record<string, AutonomyMode> = {
    manual: 'confirm', safe: 'confirm', autopilot: 'auto',
  };
  if (raw && raw in MIGRATION_MAP) {
    const mapped = MIGRATION_MAP[raw];
    setSetting(SETTINGS_KEY_AUTONOMY_MODE, mapped);
    return mapped;
  }
  return DEFAULT_MODE;
};

export const setAutonomyMode = (mode: AutonomyMode): AutonomyMode => {
  if (!VALID_MODES.has(mode)) {
    throw new Error(`Invalid autonomy mode: ${mode}`);
  }
  setSetting(SETTINGS_KEY_AUTONOMY_MODE, mode);
  return mode;
};

// ─── Risk classification ─────────────────────────────────────

type ToolRiskHint = {
  toolName: string;
  input: Record<string, unknown>;
};

const HARD_OVERRIDE_TOOLS: ReadonlySet<string> = new Set(['delete_task']);
const isNoteRewrite = (hint: ToolRiskHint): boolean =>
  hint.toolName === 'edit_note' && hint.input.action === 'rewrite';

export const classifyRisk = (hint: ToolRiskHint): RiskLevel => {
  if (HARD_OVERRIDE_TOOLS.has(hint.toolName)) return 'critical';
  if (isNoteRewrite(hint)) return 'high';
  return 'low';
};

export const requiresHardConfirmation = (hint: ToolRiskHint): boolean => {
  // Destructive mutations always require explicit confirmation.
  return HARD_OVERRIDE_TOOLS.has(hint.toolName) || isNoteRewrite(hint);
};

// ─── Mode gating decision ────────────────────────────────────

export type GateDecision =
  | { action: 'execute' }
  | { action: 'pending'; reason: string };

export const evaluateGate = (
  mode: AutonomyMode,
  _risk: RiskLevel,
  hardOverride: boolean,
): GateDecision => {
  if (hardOverride) {
    return { action: 'pending', reason: 'Confirm delete?' };
  }
  if (mode === 'auto') {
    return { action: 'execute' };
  }
  // mode === 'confirm'
  return { action: 'pending', reason: 'Approval needed.' };
};

// ─── Pending action queue persistence ────────────────────────

const pendingActionSchema = z.object({
  actionId: z.string(),
  toolName: z.string(),
  input: z.unknown(),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
  rationale: z.string(),
  requiresHardConfirmation: z.boolean(),
  createdAt: z.string(),
  requestId: z.string().optional(),
  conversationId: z.string().optional(),
  createdByRequestId: z.string().optional(),
  fingerprint: z.string().optional(),
  expiresAt: z.string().optional(),
  modeAtCreation: z.enum(['auto', 'confirm', 'manual', 'safe', 'autopilot']),
  lifecycle: z.literal('pending'),
});

const pendingQueueSchema = z.array(pendingActionSchema);

export const loadPendingActions = (): PendingAction[] => {
  const raw = getSetting(SETTINGS_KEY_PENDING_ACTIONS);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    const actions = pendingQueueSchema.parse(parsed);
    const MIGRATION_MAP: Record<string, AutonomyMode> = {
      manual: 'confirm', safe: 'confirm', autopilot: 'auto',
    };
    return actions.map((action) => ({
      ...action,
      modeAtCreation: MIGRATION_MAP[action.modeAtCreation] ?? action.modeAtCreation,
      createdByRequestId: action.createdByRequestId ?? action.requestId,
    })) as PendingAction[];
  } catch {
    return [];
  }
};

const persistPendingActions = (actions: PendingAction[]): void => {
  setSetting(SETTINGS_KEY_PENDING_ACTIONS, JSON.stringify(actions));
};

export const addPendingAction = (
  toolName: string,
  input: unknown,
  riskLevel: RiskLevel,
  rationale: string,
  hardOverride: boolean,
  metadata?: string | {
    requestId?: string;
    conversationId?: string;
    createdByRequestId?: string;
    fingerprint?: string;
    expiresAt?: string;
  },
): PendingAction => {
  const requestMetadata = typeof metadata === 'string'
    ? { requestId: metadata, createdByRequestId: metadata }
    : metadata ?? {};
  const createdByRequestId = requestMetadata.createdByRequestId ?? requestMetadata.requestId;

  const mode = getAutonomyMode();
  const action: PendingAction = {
    actionId: randomUUID(),
    toolName,
    input,
    riskLevel,
    rationale,
    requiresHardConfirmation: hardOverride,
    createdAt: new Date().toISOString(),
    requestId: requestMetadata.requestId ?? createdByRequestId,
    conversationId: requestMetadata.conversationId,
    createdByRequestId,
    fingerprint: requestMetadata.fingerprint,
    expiresAt: requestMetadata.expiresAt
      ?? new Date(Date.now() + DEFAULT_PENDING_ACTION_TTL_MS).toISOString(),
    modeAtCreation: mode,
    lifecycle: 'pending',
  };

  const queue = loadPendingActions();
  queue.push(action);
  persistPendingActions(queue);
  return action;
};

export const requeuePendingAction = (action: PendingAction): PendingAction => {
  const queue = loadPendingActions();
  const existingIndex = queue.findIndex((entry) => entry.actionId === action.actionId);

  if (existingIndex === -1) {
    queue.push(action);
  } else {
    queue[existingIndex] = action;
  }

  persistPendingActions(queue);
  return action;
};

export const removePendingAction = (actionId: string): PendingAction | null => {
  const queue = loadPendingActions();
  const index = queue.findIndex((a) => a.actionId === actionId);
  if (index === -1) return null;

  const [removed] = queue.splice(index, 1);
  persistPendingActions(queue);
  return removed;
};

export const getPendingAction = (actionId: string): PendingAction | null => {
  const queue = loadPendingActions();
  return queue.find((a) => a.actionId === actionId) ?? null;
};

export const hasPendingActionScopeMetadata = (
  action: PendingAction,
): action is PendingAction & {
  conversationId: string;
  fingerprint: string;
  expiresAt: string;
} =>
  typeof action.conversationId === 'string' &&
  action.conversationId.trim().length > 0 &&
  typeof action.fingerprint === 'string' &&
  action.fingerprint.trim().length > 0 &&
  typeof action.expiresAt === 'string' &&
  action.expiresAt.trim().length > 0;

export const isPendingActionExpired = (
  action: Pick<PendingAction, 'expiresAt'>,
  now: Date = new Date(),
): boolean => {
  if (!action.expiresAt) {
    return false;
  }

  const expiresAtMs = Date.parse(action.expiresAt);
  if (Number.isNaN(expiresAtMs)) {
    return true;
  }

  return now.getTime() >= expiresAtMs;
};

// ─── Non-mutation tools (skip autonomy gating) ──────────────

const READ_ONLY_TOOLS: ReadonlySet<string> = new Set([
  'read_note',
  'emit_chips',
  'undo_last_action',
  'list_tasks',
]);

export const isMutationTool = (toolName: string): boolean =>
  !READ_ONLY_TOOLS.has(toolName);
