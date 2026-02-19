import { BrowserWindow, Notification } from 'electron';

import { IPC_CHANNELS } from '../../types/ipc';
import {
  SETTING_KEY_NOTIFICATIONS_ENABLED,
  SETTING_KEY_NOTIFICATIONS_SOUND,
} from '../defaultSettings';
import { observePermission } from '../ipc/notifications';
import { resolveDueDateTargetMs } from './dueDateParser';
import { getSettingWithDefault } from './settingsService';
import { listTasks, getTaskById, subscribeTaskChanges, type TaskChangeEvent } from './taskService';

// ─── Constants ──────────────────────────────────────────────

const SCAN_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const MAX_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours — setTimeout max safe delay

/** Reminder offset values → milliseconds before due time. */
const OFFSET_MS: Record<string, number> = {
  at_due: 0,
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
};

/** Notification title for each offset value. */
const OFFSET_TITLE: Record<string, string> = {
  at_due: 'Task due now',
  '15m': 'Task due in 15 minutes',
  '1h': 'Task due in 1 hour',
  '1d': 'Task due in 1 day',
};

// ─── Per-task cooldown ──────────────────────────────────────

const cooldownMap = new Map<string, number>();

const isCooldownActive = (key: string): boolean => cooldownMap.has(key);
const recordCooldown = (key: string): void => {
  cooldownMap.set(key, Date.now());
};

// ─── Settings helpers ───────────────────────────────────────

const isNotificationsEnabled = (): boolean =>
  getSettingWithDefault(SETTING_KEY_NOTIFICATIONS_ENABLED) !== 'false';

const isSoundEnabled = (): boolean =>
  getSettingWithDefault(SETTING_KEY_NOTIFICATIONS_SOUND) !== 'false';

// ─── Native notification helper ─────────────────────────────

const showNativeNotification = (
  title: string,
  body: string,
  onClick?: () => void,
): void => {
  if (!isNotificationsEnabled()) return;
  if (!Notification.isSupported()) return;

  const notification = new Notification({
    title,
    body,
    silent: !isSoundEnabled(),
  });
  observePermission(notification);
  notification.on('click', () => {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0 && !windows[0].isDestroyed()) {
      windows[0].show();
      windows[0].focus();
    }
    onClick?.();
  });
  notification.show();
};

const sendTaskNavigate = (taskId: string): void => {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(IPC_CHANNELS.TASK_NAVIGATE, { taskId });
    }
  }
};

// ─── Types ──────────────────────────────────────────────────

export type ReminderSchedulerDeps = {
  fireAiReminder?: (taskContext: { id: string; title: string }) => Promise<void>;
};

export type InitReminderSchedulerOptions = {
  isColdStart?: boolean;
} & ReminderSchedulerDeps;

// ─── Scheduler state ────────────────────────────────────────

let scanInterval: NodeJS.Timeout | null = null;
const taskTimers = new Map<string, NodeJS.Timeout>();
let unsubscribeTaskChange: (() => void) | null = null;
let deps: ReminderSchedulerDeps = {};

// ─── Core logic ─────────────────────────────────────────────

/**
 * Parse the reminder offset value to milliseconds.
 */
const parseOffsetMs = (offset: string | null | undefined): number => {
  if (!offset || !(offset in OFFSET_MS)) return 0;
  return OFFSET_MS[offset];
};

/**
 * Schedule (or reschedule) a timer for a single task.
 * Clears any existing timer for the task first.
 */
const scheduleTaskTimer = (taskId: string): void => {
  // Clear existing timer for this task
  const existing = taskTimers.get(taskId);
  if (existing) {
    clearTimeout(existing);
    taskTimers.delete(taskId);
  }

  const task = getTaskById(taskId);
  if (!task) return;
  if (task.status === 'done' || task.status === 'cancelled') return;

  const targetMs = resolveDueDateTargetMs(task.dueDate);
  if (targetMs === null) return;

  const offsetMs = parseOffsetMs(task.reminderOffset);
  const reminderMs = targetMs - offsetMs;
  const nowMs = Date.now();

  if (reminderMs <= nowMs) return; // Already past

  const delay = reminderMs - nowMs;
  if (delay > MAX_TIMEOUT_MS) return; // Too far out — safety scan will pick it up later

  const offsetKey = task.reminderOffset ?? 'at_due';
  const cooldownKey = `${task.id}:${offsetKey}`;
  if (isCooldownActive(cooldownKey)) return;

  const taskContext = { id: task.id, title: task.title };

  const timer = setTimeout(() => {
    taskTimers.delete(task.id);
    recordCooldown(cooldownKey);
    fireReminder(taskContext, offsetKey);
  }, delay);

  taskTimers.set(task.id, timer);
};

/**
 * Clear the timer for a specific task.
 */
const clearTaskTimer = (taskId: string): void => {
  const timer = taskTimers.get(taskId);
  if (timer) {
    clearTimeout(timer);
    taskTimers.delete(taskId);
  }
};

/**
 * Safety scan: schedule timers for ALL future tasks with due dates.
 * Acts as a fallback to catch tasks that may not have timers.
 */
const scanAndSchedule = (): void => {
  const allTasks = listTasks();

  for (const task of allTasks) {
    if (task.status === 'done' || task.status === 'cancelled') continue;

    const targetMs = resolveDueDateTargetMs(task.dueDate);
    if (targetMs === null) continue;

    // Only schedule if no timer exists yet (don't override precise timers)
    if (!taskTimers.has(task.id)) {
      scheduleTaskTimer(task.id);
    }
  }

  if (taskTimers.size > 0) {
    // eslint-disable-next-line no-console
    console.info(`[reminder-scheduler] scheduled ${taskTimers.size} reminder(s)`);
  }
};

/**
 * Fire a reminder for a single task: native notification + optional AI.
 */
const fireReminder = (
  taskContext: { id: string; title: string },
  offsetKey: string,
): void => {
  const title = OFFSET_TITLE[offsetKey] ?? 'Task due now';

  showNativeNotification(title, taskContext.title, () => {
    sendTaskNavigate(taskContext.id);
  });

  if (deps.fireAiReminder) {
    deps.fireAiReminder(taskContext).catch((error) => {
      // eslint-disable-next-line no-console
      console.warn('[reminder-scheduler] AI reminder failed:', error);
    });
  }
};

/**
 * Catch-up: collect all overdue tasks and show summary/single notification.
 */
const catchUpOverdue = (): void => {
  const allTasks = listTasks();
  const nowMs = Date.now();
  const overdue: Array<{ id: string; title: string }> = [];

  for (const task of allTasks) {
    if (task.status === 'done' || task.status === 'cancelled') continue;

    const targetMs = resolveDueDateTargetMs(task.dueDate);
    if (targetMs === null) continue;

    if (targetMs <= nowMs) {
      overdue.push({ id: task.id, title: task.title });
    }
  }

  if (overdue.length === 0) return;

  if (overdue.length === 1) {
    showNativeNotification('Task overdue', overdue[0].title, () => {
      sendTaskNavigate(overdue[0].id);
    });
  } else {
    const body = overdue
      .slice(0, 3)
      .map((t) => t.title)
      .join(', ');
    showNativeNotification(`${overdue.length} tasks overdue`, body);
  }
};

/**
 * React to individual task changes for precise scheduling.
 */
const onTaskChange = (event: TaskChangeEvent): void => {
  switch (event.action) {
    case 'create':
    case 'update':
    case 'reopen':
      scheduleTaskTimer(event.taskId);
      break;
    case 'complete':
    case 'cancel':
    case 'delete':
      clearTaskTimer(event.taskId);
      break;
  }
};

// ─── Public API ─────────────────────────────────────────────

export const initReminderScheduler = (options: InitReminderSchedulerOptions = {}): void => {
  const { isColdStart = true, ...depsOption } = options;
  stopReminderScheduler();
  deps = depsOption;

  // Subscribe to task changes for immediate rescheduling
  unsubscribeTaskChange = subscribeTaskChanges(onTaskChange);

  // Overdue catch-up only on cold start (app startup), not config changes
  if (isColdStart) {
    catchUpOverdue();
  }

  // Immediate first scan — schedules all future tasks
  scanAndSchedule();

  // Recurring safety scan every hour (fallback for edge cases)
  scanInterval = setInterval(scanAndSchedule, SCAN_INTERVAL_MS);

  // eslint-disable-next-line no-console
  console.info('[reminder-scheduler] started', isColdStart ? '(cold start)' : '(warm reinit)');
};

export const stopReminderScheduler = (): void => {
  if (scanInterval) {
    clearInterval(scanInterval);
    scanInterval = null;
  }

  for (const timer of taskTimers.values()) {
    clearTimeout(timer);
  }
  taskTimers.clear();

  if (unsubscribeTaskChange) {
    unsubscribeTaskChange();
    unsubscribeTaskChange = null;
  }

  deps = {};
};
