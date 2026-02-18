import { BrowserWindow, Notification } from 'electron';

import { IPC_CHANNELS } from '../../types/ipc';
import { resolveDueDateTargetMs } from './dueDateParser';
import { listTasks, subscribeTaskChanges } from './taskService';

// ─── Constants ──────────────────────────────────────────────

const SCAN_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const DEBOUNCE_MS = 2000;

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

// ─── Native notification helper ─────────────────────────────

const showNativeNotification = (
  title: string,
  body: string,
  onClick?: () => void,
): void => {
  if (!Notification.isSupported()) return;

  const notification = new Notification({ title, body, silent: false });
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

// ─── Scheduler state ────────────────────────────────────────

let scanInterval: NodeJS.Timeout | null = null;
let debounceTimer: NodeJS.Timeout | null = null;
let taskTimers = new Map<string, NodeJS.Timeout>();
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
 * Scan tasks and schedule timers for any due within the next hour.
 * Always sends native notifications. Optionally fires AI callback.
 */
const scanAndSchedule = (): void => {
  // Clear existing task-level timers
  for (const timer of taskTimers.values()) {
    clearTimeout(timer);
  }
  taskTimers.clear();

  const allTasks = listTasks();
  const nowMs = Date.now();
  const windowEnd = nowMs + SCAN_INTERVAL_MS;

  for (const task of allTasks) {
    if (task.status === 'done' || task.status === 'cancelled') continue;

    const targetMs = resolveDueDateTargetMs(task.dueDate);
    if (targetMs === null) continue;

    const offsetMs = parseOffsetMs(task.reminderOffset);
    const reminderMs = targetMs - offsetMs;

    // Only schedule tasks firing within the next hour
    if (reminderMs <= nowMs || reminderMs > windowEnd) continue;

    const cooldownKey = `${task.id}:${task.reminderOffset ?? 'at_due'}`;
    if (isCooldownActive(cooldownKey)) continue;

    const delay = reminderMs - nowMs;
    const taskContext = { id: task.id, title: task.title };

    const offsetKey = task.reminderOffset ?? 'at_due';
    const timer = setTimeout(() => {
      taskTimers.delete(task.id);
      recordCooldown(cooldownKey);
      fireReminder(taskContext, offsetKey);
    }, delay);

    taskTimers.set(task.id, timer);
  }

  if (taskTimers.size > 0) {
    // eslint-disable-next-line no-console
    console.info(`[reminder-scheduler] scheduled ${taskTimers.size} reminder(s)`);
  }
};

/**
 * Fire a reminder for a single task: always native notification, optionally AI.
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
    // Summary click just focuses the app (overdue tasks already highlighted).
    // showNativeNotification already brings the window to front.
    showNativeNotification(`${overdue.length} tasks overdue`, body);
  }
};

/**
 * Debounced rescan triggered by task changes.
 */
const onTaskChange = (): void => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    scanAndSchedule();
  }, DEBOUNCE_MS);
};

// ─── Public API ─────────────────────────────────────────────

export const initReminderScheduler = (options: ReminderSchedulerDeps = {}): void => {
  stopReminderScheduler();
  deps = options;

  // Subscribe to task changes for live rescheduling
  unsubscribeTaskChange = subscribeTaskChanges(onTaskChange);

  // Overdue catch-up on startup
  catchUpOverdue();

  // Immediate first scan
  scanAndSchedule();

  // Recurring scan every hour
  scanInterval = setInterval(scanAndSchedule, SCAN_INTERVAL_MS);

  // eslint-disable-next-line no-console
  console.info('[reminder-scheduler] started');
};

export const stopReminderScheduler = (): void => {
  if (scanInterval) {
    clearInterval(scanInterval);
    scanInterval = null;
  }

  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
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
