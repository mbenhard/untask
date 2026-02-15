import type { Task } from '../db/schema';
import type {
  AssistantLiveContext,
  ProactiveTriggerEvaluation,
  ProactiveTriggerRecommendation,
  ProactiveTriggerRequest,
  ProactiveTriggerResult,
  ProactiveTriggerType,
} from '../../types/assistant';

type TriggerCooldownConfig = {
  trigger: ProactiveTriggerType;
  cooldownMinutes: number;
};

type TriggerCandidate = {
  trigger: ProactiveTriggerType;
  score: number;
  severity: ProactiveTriggerRecommendation['severity'];
  message: string;
  actions: ProactiveTriggerRecommendation['actions'];
  reason: string;
};

const TRIGGER_COOLDOWNS: TriggerCooldownConfig[] = [
  { trigger: 'overdue_accumulation', cooldownMinutes: 120 },
  { trigger: 'value_at_risk_idle', cooldownMinutes: 180 },
  { trigger: 'stale_client_touchpoint', cooldownMinutes: 180 },
  { trigger: 'empty_today_list', cooldownMinutes: 90 },
];

const triggerCooldownMap = new Map<ProactiveTriggerType, number>();

const toMillis = (minutes: number): number => minutes * 60 * 1000;

const parseDate = (value: string | undefined | null): number | null => {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const resolveNow = (value?: string): Date => {
  if (!value) {
    return new Date();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const normalizeLiveContext = (
  value: AssistantLiveContext,
  now: Date,
  timezone?: string,
): AssistantLiveContext => ({
  ...value,
  tasks: value.tasks ?? [],
  inboxCount: value.inboxCount ?? 0,
  now: now.toISOString(),
  timezone: timezone ?? value.timezone,
});

const isWorkingHours = (now: Date, timezone: string): boolean => {
  const local = new Date(
    now.toLocaleString('en-US', {
      timeZone: timezone,
    }),
  );
  const day = local.getDay();
  const hour = local.getHours();
  return day >= 1 && day <= 5 && hour >= 8 && hour <= 18;
};

const getCooldownMinutes = (trigger: ProactiveTriggerType): number =>
  TRIGGER_COOLDOWNS.find((entry) => entry.trigger === trigger)?.cooldownMinutes ??
  120;

const isCooldownActive = (
  trigger: ProactiveTriggerType,
  nowMs: number,
): boolean => {
  const lastTriggeredAt = triggerCooldownMap.get(trigger);

  if (!lastTriggeredAt) {
    return false;
  }

  const elapsed = nowMs - lastTriggeredAt;
  return elapsed < toMillis(getCooldownMinutes(trigger));
};

const activeTasks = (tasks: Task[]): Task[] =>
  tasks.filter((task) => task.status !== 'done');

const overdueTasks = (
  tasks: Task[],
  nowMs: number,
): Task[] =>
  tasks.filter((task) => {
    const dueAt = parseDate(task.dueDate);
    return dueAt !== null && dueAt < nowMs;
  });

const staleClientTasks = (
  tasks: Task[],
  nowMs: number,
): Task[] =>
  tasks.filter((task) => {
    if (!task.client) {
      return false;
    }

    const touchedAt = parseDate(task.lastClientTouchAt);

    if (touchedAt === null) {
      return false;
    }

    const ageDays = (nowMs - touchedAt) / (1000 * 60 * 60 * 24);
    return ageDays >= 7;
  });

const valueAtRiskIdleTasks = (
  tasks: Task[],
  nowMs: number,
): Task[] =>
  tasks.filter((task) => {
    const value = task.valueAtRisk ?? 0;

    if (value < 1000) {
      return false;
    }

    const touchedAt = parseDate(task.lastClientTouchAt);

    if (touchedAt === null) {
      return true;
    }

    const ageDays = (nowMs - touchedAt) / (1000 * 60 * 60 * 24);
    return ageDays >= 5;
  });

const buildCandidates = (
  liveContext: AssistantLiveContext,
  now: Date,
): TriggerCandidate[] => {
  const nowMs = now.getTime();
  const tasks = activeTasks(liveContext.tasks);
  const todayTasks = tasks.filter((task) => task.today);
  const overdue = overdueTasks(tasks, nowMs);
  const stale = staleClientTasks(tasks, nowMs);
  const valueRiskIdle = valueAtRiskIdleTasks(tasks, nowMs);
  const overdueValueAtRisk = overdue.reduce(
    (sum, task) => sum + (task.valueAtRisk ?? 0),
    0,
  );

  const candidates: TriggerCandidate[] = [];

  if (todayTasks.length === 0 && tasks.length > 0) {
    candidates.push({
      trigger: 'empty_today_list',
      score: 0.45 + Math.min(0.25, tasks.length * 0.03),
      severity: 'medium',
      message:
        'Today list is empty during working hours. Pick 3 focus tasks now to prevent drift.',
      actions: [
        { label: 'Plan today', command: 'suggest_daily_plan' },
        { label: 'Review inbox', command: 'open_inbox' },
      ],
      reason: 'no tasks are flagged for today',
    });
  }

  if (overdue.length >= 2 || overdueValueAtRisk >= 1500) {
    candidates.push({
      trigger: 'overdue_accumulation',
      score: 0.85 + Math.min(0.12, overdue.length * 0.03),
      severity: 'high',
      message: `Overdue tasks are accumulating (${overdue.length}) with $${overdueValueAtRisk} value at risk. Triage the top blocker first.`,
      actions: [
        { label: 'Show overdue', command: 'show_overdue' },
        { label: 'Create recovery plan', command: 'suggest_daily_plan' },
      ],
      reason: 'multiple overdue tasks or high overdue value at risk',
    });
  }

  if (stale.length > 0) {
    candidates.push({
      trigger: 'stale_client_touchpoint',
      score: 0.62 + Math.min(0.12, stale.length * 0.04),
      severity: stale.length >= 2 ? 'high' : 'medium',
      message: `${stale.length} client touchpoint${stale.length > 1 ? 's are' : ' is'} stale. Send one concise update to reduce risk.`,
      actions: [
        { label: 'Draft client update', command: 'draft_client_update' },
        { label: 'List stale clients', command: 'show_stale_clients' },
      ],
      reason: 'client communication has been stale for at least 7 days',
    });
  }

  if (valueRiskIdle.length > 0) {
    const totalValue = valueRiskIdle.reduce(
      (sum, task) => sum + (task.valueAtRisk ?? 0),
      0,
    );

    candidates.push({
      trigger: 'value_at_risk_idle',
      score: 0.72 + Math.min(0.15, totalValue / 10000),
      severity: totalValue >= 3000 ? 'high' : 'medium',
      message: `$${totalValue} of value-at-risk work is idle. Advance one revenue-critical task now.`,
      actions: [
        { label: 'Focus revenue task', command: 'prioritize_value_at_risk' },
        { label: 'Set today task', command: 'set_today' },
      ],
      reason: 'high value-at-risk tasks have no recent touchpoint',
    });
  }

  return candidates;
};

const toEvaluation = (
  trigger: ProactiveTriggerType,
  candidate: TriggerCandidate | undefined,
  suppressedByCooldown: boolean,
): ProactiveTriggerEvaluation => ({
  trigger,
  eligible: Boolean(candidate),
  suppressedByCooldown,
  reason: candidate?.reason,
  score: candidate?.score ?? 0,
});

const sortCandidates = (candidates: TriggerCandidate[]): TriggerCandidate[] =>
  [...candidates].sort(
    (left, right) => right.score - left.score || left.trigger.localeCompare(right.trigger),
  );

export const evaluateProactiveTriggerPolicy = (
  request: ProactiveTriggerRequest,
): ProactiveTriggerResult => {
  const now = resolveNow(request.now ?? request.liveContext.now);
  const nowMs = now.getTime();
  const timezone =
    request.timezone ??
    request.liveContext.timezone ??
    Intl.DateTimeFormat().resolvedOptions().timeZone;
  const liveContext = normalizeLiveContext(request.liveContext, now, timezone);
  const cooldownEnabled = request.applyCooldown ?? true;
  const shouldRecord = request.recordSelection ?? true;
  const candidateMap = new Map<ProactiveTriggerType, TriggerCandidate>();
  const evaluations: ProactiveTriggerEvaluation[] = [];

  if (!isWorkingHours(now, timezone)) {
    return {
      recommendation: undefined,
      evaluations: [
        {
          trigger: 'empty_today_list',
          eligible: false,
          suppressedByCooldown: false,
          reason: 'outside configured working hours',
          score: 0,
        },
        {
          trigger: 'overdue_accumulation',
          eligible: false,
          suppressedByCooldown: false,
          reason: 'outside configured working hours',
          score: 0,
        },
        {
          trigger: 'stale_client_touchpoint',
          eligible: false,
          suppressedByCooldown: false,
          reason: 'outside configured working hours',
          score: 0,
        },
        {
          trigger: 'value_at_risk_idle',
          eligible: false,
          suppressedByCooldown: false,
          reason: 'outside configured working hours',
          score: 0,
        },
      ],
    };
  }

  const candidates = buildCandidates(liveContext, now);

  for (const candidate of candidates) {
    candidateMap.set(candidate.trigger, candidate);
  }

  const allTriggers: ProactiveTriggerType[] = [
    'empty_today_list',
    'overdue_accumulation',
    'stale_client_touchpoint',
    'value_at_risk_idle',
  ];

  for (const trigger of allTriggers) {
    const candidate = candidateMap.get(trigger);
    const suppressedByCooldown =
      cooldownEnabled && candidate ? isCooldownActive(trigger, nowMs) : false;

    evaluations.push(toEvaluation(trigger, candidate, suppressedByCooldown));
  }

  const selected = sortCandidates(candidates).find((candidate) => {
    if (!cooldownEnabled) {
      return true;
    }

    return !isCooldownActive(candidate.trigger, nowMs);
  });

  if (!selected) {
    return {
      recommendation: undefined,
      evaluations,
    };
  }

  if (shouldRecord) {
    triggerCooldownMap.set(selected.trigger, nowMs);
  }

  return {
    recommendation: {
      trigger: selected.trigger,
      severity: selected.severity,
      message: selected.message,
      actions: selected.actions,
      generatedAt: now.toISOString(),
    },
    evaluations,
  };
};
