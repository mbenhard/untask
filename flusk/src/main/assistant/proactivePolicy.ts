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

const buildCandidates = (
  liveContext: AssistantLiveContext,
  now: Date,
): TriggerCandidate[] => {
  const nowMs = now.getTime();
  const tasks = activeTasks(liveContext.tasks);
  const todayTasks = tasks.filter((task) => task.today);
  const overdue = overdueTasks(tasks, nowMs);

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

  if (overdue.length >= 2) {
    candidates.push({
      trigger: 'overdue_accumulation',
      score: 0.85 + Math.min(0.12, overdue.length * 0.03),
      severity: 'high',
      message: `Overdue tasks are accumulating (${overdue.length}). Triage the top blocker first.`,
      actions: [
        { label: 'Show overdue', command: 'show_overdue' },
        { label: 'Create recovery plan', command: 'suggest_daily_plan' },
      ],
      reason: 'multiple overdue tasks',
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

  const candidates = buildCandidates(liveContext, now);

  for (const candidate of candidates) {
    candidateMap.set(candidate.trigger, candidate);
  }

  const allTriggers: ProactiveTriggerType[] = [
    'empty_today_list',
    'overdue_accumulation',
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
