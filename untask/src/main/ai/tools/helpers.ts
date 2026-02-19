import { randomUUID } from 'node:crypto';

import type {
  ActionLifecycle,
  ChatActionCard,
  ChatToolStatus,
  ChatViewIntent,
} from '../../../types/chat';
import type { ToolExecutionContext, ToolExecutionEnvelope } from './types';

const todayIso = (): string => new Date().toISOString();

export const createActionCard = (
  toolName: string,
  status: ChatToolStatus,
  title: string,
  detail: string,
  options?: {
    taskId?: string;
    taskEventId?: string;
    undoable?: boolean;
    actionId?: string;
    riskLevel?: ChatActionCard['riskLevel'];
    rationale?: string;
    lifecycle?: ActionLifecycle;
    viewIntent?: ChatViewIntent;
  },
): ChatActionCard => ({
  id: randomUUID(),
  toolName,
  status,
  title,
  detail,
  taskId: options?.taskId,
  taskEventId: options?.taskEventId,
  undoable: options?.undoable ?? false,
  createdAt: todayIso(),
  actionId: options?.actionId,
  riskLevel: options?.riskLevel,
  rationale: options?.rationale,
  lifecycle: options?.lifecycle,
  viewIntent: options?.viewIntent,
});

export const emitActionCard = (
  context: ToolExecutionContext,
  card: ChatActionCard,
): void => {
  context.onActionCard?.(card);
};

export const confirmationRequired = (
  context: ToolExecutionContext,
  toolName: string,
  title: string,
  detail: string,
  options?: {
    taskId?: string;
    taskEventId?: string;
  },
): ToolExecutionEnvelope => {
  const actionCard = createActionCard(toolName, 'confirmation_required', title, detail, {
    ...options,
    undoable: false,
  });
  emitActionCard(context, actionCard);

  return {
    status: 'confirmation_required',
    message: detail,
    actionCard,
  };
};

export const successResult = (
  context: ToolExecutionContext,
  toolName: string,
  title: string,
  detail: string,
  data?: unknown,
  options?: {
    taskId?: string;
    taskEventId?: string;
    undoable?: boolean;
    viewIntent?: ChatViewIntent;
  },
): ToolExecutionEnvelope => {
  const actionCard = createActionCard(toolName, 'success', title, detail, options);
  emitActionCard(context, actionCard);

  return {
    status: 'success',
    message: detail,
    data,
    actionCard,
  };
};

export const normalizeForSummary = (value: string, maxLength: number): string => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length === 0) {
    return '(empty)';
  }

  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
};
