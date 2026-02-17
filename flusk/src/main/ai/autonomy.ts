import { randomUUID } from 'node:crypto';

import { z } from 'zod';

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
  modeAtCreation: AutonomyMode;
  lifecycle: 'pending';
};

export type ResolvedAction = Omit<PendingAction, 'lifecycle'> & {
  lifecycle: 'executed' | 'rejected' | 'undone';
  resolvedAt: string;
  taskEventId?: string;
};

// ─── Mode policy ─────────────────────────────────────────────

const SETTINGS_KEY_AUTONOMY_MODE = 'ai_autonomy_mode';
const SETTINGS_KEY_PENDING_ACTIONS = 'ai_autonomy_pending_actions';

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

export const classifyRisk = (hint: ToolRiskHint): RiskLevel => {
  if (HARD_OVERRIDE_TOOLS.has(hint.toolName)) return 'critical';
  return 'low';
};

export const requiresHardConfirmation = (hint: ToolRiskHint): boolean => {
  // Only delete_task requires hard confirmation regardless of autonomy mode
  return HARD_OVERRIDE_TOOLS.has(hint.toolName);
};

// ─── Mode gating decision ────────────────────────────────────

export type GateDecision =
  | { action: 'execute' }
  | { action: 'pending'; reason: string };

export const evaluateGate = (
  mode: AutonomyMode,
  risk: RiskLevel,
  hardOverride: boolean,
): GateDecision => {
  if (hardOverride) {
    return { action: 'pending', reason: 'Confirm delete?' };
  }
  if (mode === 'confirm') {
    return { action: 'pending', reason: 'Approval needed.' };
  }
  // mode === 'auto'
  return { action: 'execute' };
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
  modeAtCreation: z.enum(['auto', 'confirm', 'manual', 'safe', 'autopilot']),
  lifecycle: z.literal('pending'),
});

const pendingQueueSchema = z.array(pendingActionSchema);

export const loadPendingActions = (): PendingAction[] => {
  const raw = getSetting(SETTINGS_KEY_PENDING_ACTIONS);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return pendingQueueSchema.parse(parsed);
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
  requestId?: string,
): PendingAction => {
  const mode = getAutonomyMode();
  const action: PendingAction = {
    actionId: randomUUID(),
    toolName,
    input,
    riskLevel,
    rationale,
    requiresHardConfirmation: hardOverride,
    createdAt: new Date().toISOString(),
    requestId,
    modeAtCreation: mode,
    lifecycle: 'pending',
  };

  const queue = loadPendingActions();
  queue.push(action);
  persistPendingActions(queue);
  return action;
};

export const requeuePendingAction = (action: PendingAction): PendingAction => {
  const validatedAction = pendingActionSchema.parse(action);
  const queue = loadPendingActions();
  const existingIndex = queue.findIndex((entry) => entry.actionId === validatedAction.actionId);

  if (existingIndex === -1) {
    queue.push(validatedAction);
  } else {
    queue[existingIndex] = validatedAction;
  }

  persistPendingActions(queue);
  return validatedAction;
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

// ─── Non-mutation tools (skip autonomy gating) ──────────────

const READ_ONLY_TOOLS: ReadonlySet<string> = new Set([
  'read_note',
  'emit_chips',
  'undo_last_action',
  'list_tasks',
]);

export const isMutationTool = (toolName: string): boolean =>
  !READ_ONLY_TOOLS.has(toolName);
