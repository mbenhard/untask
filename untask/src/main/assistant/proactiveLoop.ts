import { BrowserWindow, Notification } from 'electron';

import type { ProactiveTriggerType } from '../../types/assistant';
import type { ChatStreamEvent } from '../../types/chat';
import { IPC_CHANNELS } from '../../types/ipc';
import { parseDueDate } from '../services/dueDateParser';
import { listTasks, subscribeTaskChanges } from '../services/taskService';

// ─── Constants ──────────────────────────────────────────────

const MAX_SETTIMEOUT_MS = 2_147_483_647; // 2^31 - 1 (~24.8 days)

// ─── Per-task cooldown (prevents re-reminding same task) ────

const cooldownMap = new Map<string, number>();

const isCooldownActive = (key: string): boolean => {
  return cooldownMap.has(key);
};

const recordCooldown = (key: string): void => {
  cooldownMap.set(key, Date.now());
};

// ─── Trigger message template ───────────────────────────────

const TRIGGER_TEMPLATE =
  '[PROACTIVE TRIGGER: time_reminder]\n' +
  'The following task is due now. Remind the user briefly ' +
  'and suggest immediate action. Include chips.';

const buildTriggerMessage = (
  taskContext?: { id: string; title: string },
): string => {
  if (!taskContext) return TRIGGER_TEMPLATE;
  return `${TRIGGER_TEMPLATE}\nTask: "${taskContext.title}" (ID: ${taskContext.id})`;
};

// ─── Stream event emitter ───────────────────────────────────

const emitToAllWindows = (event: ChatStreamEvent): void => {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(IPC_CHANNELS.CHAT_STREAM_EVENT, event);
    }
  }
};

// ─── Notification helper ────────────────────────────────────

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

// ─── ProactiveLoop ──────────────────────────────────────────

export type ProactiveLoopDeps = {
  startProactiveTurn: (input: {
    triggerMessage: string;
    triggerType: ProactiveTriggerType;
    emit: (event: ChatStreamEvent) => void;
  }) => Promise<void>;
};

export class ProactiveLoop {
  private deps: ProactiveLoopDeps;
  private reminderTimers = new Map<string, NodeJS.Timeout>();
  private rescheduleTimer: NodeJS.Timeout | null = null;
  private unsubscribeTaskChange: (() => void) | null = null;

  constructor(deps: ProactiveLoopDeps) {
    this.deps = deps;
  }

  start(): void {
    this.unsubscribeTaskChange = subscribeTaskChanges(() => {
      this.onTaskChange();
    });

    this.scheduleUpcomingReminders();

    // eslint-disable-next-line no-console
    console.info('[proactive-loop] started (time reminders only)');
  }

  stop(): void {
    for (const timer of this.reminderTimers.values()) {
      clearTimeout(timer);
    }
    this.reminderTimers.clear();

    if (this.rescheduleTimer) {
      clearTimeout(this.rescheduleTimer);
      this.rescheduleTimer = null;
    }

    if (this.unsubscribeTaskChange) {
      this.unsubscribeTaskChange();
      this.unsubscribeTaskChange = null;
    }

    // eslint-disable-next-line no-console
    console.info('[proactive-loop] stopped');
  }

  private onTaskChange(): void {
    // Debounce reminder reschedule (2s, latest wins)
    if (this.rescheduleTimer) clearTimeout(this.rescheduleTimer);
    this.rescheduleTimer = setTimeout(() => {
      this.rescheduleTimer = null;
      this.scheduleUpcomingReminders();
    }, 2000);
  }

  /**
   * Scan all active tasks with dueDates and schedule a setTimeout for each
   * future deadline. Date-only deadlines fire at 9 AM local time.
   * Deadlines beyond ~24.8 days are skipped (setTimeout overflow guard).
   */
  private scheduleUpcomingReminders(): void {
    // Clear existing reminder timers
    for (const timer of this.reminderTimers.values()) {
      clearTimeout(timer);
    }
    this.reminderTimers.clear();

    const tasks = listTasks();
    const nowMs = Date.now();

    for (const task of tasks) {
      if (task.status === 'done' || task.status === 'cancelled') continue;

      const parsed = parseDueDate(task.dueDate);
      if (!parsed) continue;

      // Resolve target time: exact time for date+time, 9 AM for date-only
      const targetMs = parsed.hasTime
        ? parsed.ms
        : new Date(parsed.dateStr + 'T09:00').getTime();

      // Skip past deadlines
      if (targetMs <= nowMs) continue;

      // Skip if beyond setTimeout max (~24.8 days)
      const delay = targetMs - nowMs;
      if (delay > MAX_SETTIMEOUT_MS) continue;

      // Skip if already reminded for this task
      const cooldownKey = `time_reminder:${task.id}`;
      if (isCooldownActive(cooldownKey)) continue;

      const taskContext = { id: task.id, title: task.title };
      const timer = setTimeout(() => {
        this.reminderTimers.delete(task.id);
        recordCooldown(cooldownKey);
        void this.fireProactiveMessage(taskContext);
      }, delay);

      this.reminderTimers.set(task.id, timer);
    }

    if (this.reminderTimers.size > 0) {
      // eslint-disable-next-line no-console
      console.info(`[proactive-loop] scheduled ${this.reminderTimers.size} time reminder(s)`);
    }
  }

  private async fireProactiveMessage(
    taskContext?: { id: string; title: string },
  ): Promise<void> {
    const message = buildTriggerMessage(taskContext);
    if (!message) return;

    const isWindowFocused = BrowserWindow.getAllWindows().some(
      (w) => !w.isDestroyed() && w.isFocused(),
    );

    try {
      await this.deps.startProactiveTurn({
        triggerMessage: message,
        triggerType: 'time_reminder',
        emit: (event) => {
          emitToAllWindows(event);

          // Send native notification when window is not focused and we get assistant text
          if (!isWindowFocused && event.type === 'assistant_done') {
            const assistantMessage = 'assistantMessage' in event
              ? event.assistantMessage
              : undefined;
            const content = assistantMessage?.content;
            if (content) {
              const firstSentence = content.split(/[.!?]\s/)[0] ?? content;
              if (assistantMessage?.id) {
                showNativeNotification(
                  'Reminder',
                  firstSentence.slice(0, 100),
                  () => {
                    const windows = BrowserWindow.getAllWindows();
                    if (windows.length > 0 && !windows[0].isDestroyed()) {
                      windows[0].webContents.send(IPC_CHANNELS.CHAT_FOCUS_MESSAGE, {
                        messageId: assistantMessage.id,
                      });
                    }
                  },
                );
              } else {
                showNativeNotification(
                  'Reminder',
                  firstSentence.slice(0, 100),
                );
              }
            }
          }
        },
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[proactive-loop] failed to fire time_reminder:', error);
    }
  }
}

// ─── Singleton ──────────────────────────────────────────────

let instance: ProactiveLoop | null = null;

export const initProactiveLoop = (deps: ProactiveLoopDeps): ProactiveLoop => {
  if (instance) {
    instance.stop();
  }
  instance = new ProactiveLoop(deps);
  instance.start();
  return instance;
};

export const getProactiveLoop = (): ProactiveLoop | null => instance;

export const stopProactiveLoop = (): void => {
  if (instance) {
    instance.stop();
    instance = null;
  }
};
