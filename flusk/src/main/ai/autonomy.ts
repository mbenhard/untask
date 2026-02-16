import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { getSetting, setSetting } from '../services/settingsService';

// ─── Core types ──────────────────────────────────────────────

export type AutonomyMode = 'manual' | 'safe' | 'autopilot';

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

const VALID_MODES: ReadonlySet<AutonomyMode> = new Set(['manual', 'safe', 'autopilot']);

const DEFAULT_MODE: AutonomyMode = 'safe';

export const getAutonomyMode = (): AutonomyMode => {
  const raw = getSetting(SETTINGS_KEY_AUTONOMY_MODE);
  if (raw && VALID_MODES.has(raw as AutonomyMode)) {
    return raw as AutonomyMode;
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

const isInvoiceRisk = (hint: ToolRiskHint): boolean => {
  if (hint.toolName !== 'update_task') return false;
  const status = hint.input.invoiceStatus;
  return status === 'paid' || status === 'overdue';
};

const isCompletedRewrite = (hint: ToolRiskHint): boolean => {
  if (hint.toolName !== 'update_task') return false;
  return hint.input._beforeStatus === 'done';
};

const isBulkWrite = (hint: ToolRiskHint): boolean => {
  if (hint.toolName !== 'parse_notes') return false;
  const count = hint.input._parsedCount;
  return typeof count === 'number' && count > 5;
};

const scratchpadEditAction = (
  hint: ToolRiskHint,
): 'append' | 'replace' | 'rewrite' | null => {
  if (hint.toolName !== 'edit_scratchpad') return null;
  const action = hint.input.action;
  if (action === 'append' || action === 'replace' || action === 'rewrite') {
    return action;
  }
  return null;
};

export const classifyRisk = (hint: ToolRiskHint): RiskLevel => {
  if (HARD_OVERRIDE_TOOLS.has(hint.toolName)) return 'critical';
  if (isInvoiceRisk(hint)) return 'critical';
  if (isCompletedRewrite(hint)) return 'critical';
  if (isBulkWrite(hint)) return 'high';

  const scratchpadAction = scratchpadEditAction(hint);
  if (scratchpadAction === 'rewrite') return 'high';
  if (scratchpadAction === 'replace') return 'medium';
  if (scratchpadAction === 'append') return 'low';

  switch (hint.toolName) {
    case 'create_task':
    case 'set_today':
    case 'update_user_profile':
    case 'update_patterns':
    case 'write_journal':
      return 'low';

    case 'update_task':
      return 'low';

    case 'move_task':
    case 'complete_task':
      return 'medium';

    case 'parse_notes':
      return 'low';

    default:
      return 'low';
  }
};

export const requiresHardConfirmation = (hint: ToolRiskHint): boolean => {
  if (HARD_OVERRIDE_TOOLS.has(hint.toolName)) return true;
  if (isInvoiceRisk(hint)) return true;
  if (isCompletedRewrite(hint)) return true;
  if (isBulkWrite(hint)) return true;
  return false;
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
  if (hardOverride && mode !== 'autopilot') {
    return { action: 'pending', reason: 'Hard safety override requires confirmation.' };
  }

  switch (mode) {
    case 'manual':
      return { action: 'pending', reason: 'Manual mode: all AI writes require approval.' };

    case 'safe':
      if (risk === 'low') return { action: 'execute' };
      return {
        action: 'pending',
        reason: `Safe mode: ${risk}-risk actions require approval.`,
      };

    case 'autopilot':
      return { action: 'execute' };

    default:
      return { action: 'pending', reason: 'Unknown mode: defaulting to pending.' };
  }
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
  modeAtCreation: z.enum(['manual', 'safe', 'autopilot']),
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
  'suggest_daily_plan',
  'read_journal',
  'read_scratchpad',
  'generate_live_thought',
  'improve_task',
  'undo_last_action',
  'list_tasks',
  'get_task',
  'fetch_url',
]);

export const isMutationTool = (toolName: string): boolean =>
  !READ_ONLY_TOOLS.has(toolName);
