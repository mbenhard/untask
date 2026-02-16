import { listTasks } from '../services/taskService';
import { getPatterns } from './memory';

type DayWindow = 'morning' | 'afternoon' | 'evening';

export type LiveThoughtResult = {
  thought: string;
  actionLabel: string;
  suggestedPrompt: string;
  generatedAt: string;
};

const OVERDUE_LOOKAHEAD_MS = 24 * 60 * 60 * 1000;

const toTimestamp = (value: string | null | undefined): number | null => {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const dayWindow = (date: Date): DayWindow => {
  const hour = date.getHours();
  if (hour < 12) {
    return 'morning';
  }
  if (hour < 18) {
    return 'afternoon';
  }

  return 'evening';
};

const readPatternHint = (): string | null => {
  const lines = getPatterns()
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*-\s*/, '').trim())
    .filter((line) => line.length > 0);

  return lines[0] ?? null;
};

const completedTodayCount = (
  tasks: ReturnType<typeof listTasks>,
  now: Date,
): number => {
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const threshold = dayStart.getTime();

  return tasks.filter((task) => {
    if (task.status !== 'done') {
      return false;
    }

    const completedAt = toTimestamp(task.completedAt);
    return completedAt !== null && completedAt >= threshold;
  }).length;
};

export const generateLiveThought = (
  input?: { focus?: string | null; now?: Date },
): LiveThoughtResult => {
  const now = input?.now ?? new Date();
  const tasks = listTasks();
  const active = tasks.filter((task) => task.status !== 'done');
  const today = active.filter((task) => task.today === true);
  const overdue = active.filter((task) => {
    const dueAt = toTimestamp(task.dueDate);
    return dueAt !== null && dueAt < now.getTime();
  });
  const dueSoon = active.filter((task) => {
    const dueAt = toTimestamp(task.dueDate);
    return (
      dueAt !== null &&
      dueAt >= now.getTime() &&
      dueAt <= now.getTime() + OVERDUE_LOOKAHEAD_MS
    );
  });
  const completedToday = completedTodayCount(tasks, now);
  const focus = input?.focus?.trim();
  const patternHint = readPatternHint();
  const nowWindow = dayWindow(now);

  if (overdue.length > 0) {
    const overdueValue = overdue.reduce((sum, task) => sum + (task.valueAtRisk ?? 0), 0);
    return {
      thought:
        overdueValue > 0
          ? `${overdue.length} overdue tasks are putting about $${Math.round(overdueValue)} at risk. Clear one blocker now.`
          : `${overdue.length} overdue tasks are dragging momentum. Close one overdue task before starting anything new.`,
      actionLabel: 'Prioritize overdue',
      suggestedPrompt: 'Help me prioritize overdue tasks and pick the first task to clear now.',
      generatedAt: now.toISOString(),
    };
  }

  if (today.length === 0) {
    const focusHint = focus ? ` for ${focus}` : '';
    return {
      thought: `Your Today list is empty${focusHint}. Set 3 focused tasks before context switching.`,
      actionLabel: 'Plan today',
      suggestedPrompt: 'Plan my day with my top three tasks and the first action for each.',
      generatedAt: now.toISOString(),
    };
  }

  if (completedToday >= 2) {
    return {
      thought: `Strong momentum: ${completedToday} tasks completed today. Protect the streak with one more high-impact finish.`,
      actionLabel: 'Pick next finish',
      suggestedPrompt: 'Given my progress today, choose the best task to finish next.',
      generatedAt: now.toISOString(),
    };
  }

  if (nowWindow === 'morning') {
    return {
      thought: `Morning focus window is open. Lock in your first deep task from Today before reactive work.`,
      actionLabel: 'Start deep work',
      suggestedPrompt: 'Help me start a focused 90-minute sprint on my highest-impact Today task.',
      generatedAt: now.toISOString(),
    };
  }

  if (dueSoon.length > 0) {
    return {
      thought: `${dueSoon.length} task(s) are due in the next 24 hours. Finish one due-soon task before adding scope.`,
      actionLabel: 'Handle due soon',
      suggestedPrompt: 'Show me which due-soon task to complete first and why.',
      generatedAt: now.toISOString(),
    };
  }

  const patternClause = patternHint ? ` Pattern reminder: ${patternHint}.` : '';
  return {
    thought: `You have ${today.length} tasks on Today and ${active.length} active overall.${patternClause}`,
    actionLabel: 'Refocus',
    suggestedPrompt: 'Help me refocus this afternoon and pick the next concrete step.',
    generatedAt: now.toISOString(),
  };
};
