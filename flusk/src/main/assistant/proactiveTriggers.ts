import type { Task } from '../db/schema';
import type {
  AssistantLiveContext,
  ProactiveTriggerType,
} from '../../types/assistant';

// ─── Types ──────────────────────────────────────────────────

export type TriggerCandidate = {
  trigger: ProactiveTriggerType;
  score: number;
};

type EvaluateInput = {
  liveContext: AssistantLiveContext;
  now?: string;
  timezone?: string;
};

// ─── Helpers ────────────────────────────────────────────────

const parseDate = (value: string | undefined | null): number | null => {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const activeTasks = (tasks: Task[]): Task[] =>
  tasks.filter((t) => t.status !== 'done');

const overdueTasks = (tasks: Task[], nowMs: number): Task[] =>
  tasks.filter((t) => {
    const dueAt = parseDate(t.dueDate);
    return dueAt !== null && dueAt < nowMs;
  });

const staleClientTasks = (tasks: Task[], nowMs: number): Task[] =>
  tasks.filter((t) => {
    if (!t.client) return false;
    const touchedAt = parseDate(t.lastClientTouchAt);
    if (touchedAt === null) return false;
    return (nowMs - touchedAt) / (1000 * 60 * 60 * 24) >= 7;
  });

const valueAtRiskIdleTasks = (tasks: Task[], nowMs: number): Task[] =>
  tasks.filter((t) => {
    if ((t.valueAtRisk ?? 0) < 1000) return false;
    const touchedAt = parseDate(t.lastClientTouchAt);
    if (touchedAt === null) return true;
    return (nowMs - touchedAt) / (1000 * 60 * 60 * 24) >= 5;
  });

const deadlineApproachingTasks = (tasks: Task[], nowMs: number): Task[] => {
  const horizon48h = nowMs + 48 * 60 * 60 * 1000;
  return tasks.filter((t) => {
    const dueAt = parseDate(t.dueDate);
    if (dueAt === null) return false;
    // Due within 48h but not yet overdue
    return dueAt >= nowMs && dueAt <= horizon48h;
  });
};

// ─── Evaluation ─────────────────────────────────────────────

export const evaluateProactiveTriggers = (input: EvaluateInput): TriggerCandidate[] => {
  const now = input.now ? new Date(input.now) : new Date();
  const nowMs = now.getTime();
  const tasks = activeTasks(input.liveContext.tasks ?? []);
  const todayTasks = tasks.filter((t) => t.today);
  const overdue = overdueTasks(tasks, nowMs);
  const stale = staleClientTasks(tasks, nowMs);
  const valueRisk = valueAtRiskIdleTasks(tasks, nowMs);
  const deadlineSoon = deadlineApproachingTasks(tasks, nowMs);
  const overdueValueAtRisk = overdue.reduce(
    (sum, t) => sum + (t.valueAtRisk ?? 0),
    0,
  );

  const candidates: TriggerCandidate[] = [];

  // Overdue accumulation — highest priority
  if (overdue.length >= 2 || overdueValueAtRisk >= 1500) {
    candidates.push({
      trigger: 'overdue_accumulation',
      score: 0.85 + Math.min(0.12, overdue.length * 0.03),
    });
  }

  // Value at risk idle
  if (valueRisk.length > 0) {
    const totalValue = valueRisk.reduce(
      (sum, t) => sum + (t.valueAtRisk ?? 0),
      0,
    );
    candidates.push({
      trigger: 'value_at_risk_idle',
      score: 0.72 + Math.min(0.15, totalValue / 10000),
    });
  }

  // Deadline approaching
  if (deadlineSoon.length > 0) {
    candidates.push({
      trigger: 'deadline_approaching',
      score: 0.70 + Math.min(0.10, deadlineSoon.length * 0.03),
    });
  }

  // Stale client touchpoint
  if (stale.length > 0) {
    candidates.push({
      trigger: 'stale_client_touchpoint',
      score: 0.62 + Math.min(0.12, stale.length * 0.04),
    });
  }

  // Empty today list
  if (todayTasks.length === 0 && tasks.length > 0) {
    candidates.push({
      trigger: 'empty_today_list',
      score: 0.45 + Math.min(0.25, tasks.length * 0.03),
    });
  }

  // Sort by score descending
  return candidates.sort((a, b) => b.score - a.score);
};
