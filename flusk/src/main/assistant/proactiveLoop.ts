import { BrowserWindow, Notification } from 'electron';

import type { ProactiveTriggerType } from '../../types/assistant';
import type { ChatStreamEvent } from '../../types/chat';
import { IPC_CHANNELS } from '../../types/ipc';
import { buildCanonicalRuntimeContext } from '../ai/contextBuilder';
import { parseDueDate } from '../services/dueDateParser';
import { listTasks, subscribeTaskChanges } from '../services/taskService';
import { getSetting, setSetting } from '../services/settingsService';

import { evaluateProactiveTriggers } from './proactiveTriggers';

// ─── Constants ──────────────────────────────────────────────

const INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const LAST_MORNING_BRIEFING_KEY = 'proactive_last_morning_briefing';

// ─── Cooldown system ────────────────────────────────────────

const COOLDOWN_CONFIG: Record<ProactiveTriggerType, number> = {
  morning_briefing: 24 * 60, // once per day
  overdue_accumulation: 120,
  stale_client_touchpoint: 180,
  value_at_risk_idle: 180,
  empty_today_list: 90,
  deadline_approaching: 240,
  time_reminder: Infinity, // per-task, handled separately
};

const cooldownMap = new Map<string, number>();

const isCooldownActive = (key: string, cooldownMinutes: number, nowMs: number): boolean => {
  const lastFired = cooldownMap.get(key);
  if (!lastFired) return false;
  return nowMs - lastFired < cooldownMinutes * 60 * 1000;
};

const recordCooldown = (key: string, nowMs: number): void => {
  cooldownMap.set(key, nowMs);
};

// ─── Trigger message templates ──────────────────────────────

const TRIGGER_TEMPLATES: Record<ProactiveTriggerType, string> = {
  morning_briefing:
    '[PROACTIVE TRIGGER: morning_briefing]\n' +
    "It's the start of a new working day. Review Marcus's current state — " +
    'today list, overdue tasks, upcoming deadlines, client touchpoints, inbox — ' +
    'and deliver a concise morning briefing. Read your Memory and recent Journal ' +
    'entries for context. End with 2-3 action chips for the most impactful next steps.',

  overdue_accumulation:
    '[PROACTIVE TRIGGER: overdue_accumulation]\n' +
    'Overdue tasks are accumulating. Surface the top blocker, explain the risk, ' +
    'and propose one concrete next step. Include chips for quick triage.',

  stale_client_touchpoint:
    '[PROACTIVE TRIGGER: stale_client_touchpoint]\n' +
    'One or more client touchpoints have gone stale (>7 days). Identify which ones, ' +
    'assess the risk, and suggest a brief client update. Include chips.',

  value_at_risk_idle:
    '[PROACTIVE TRIGGER: value_at_risk_idle]\n' +
    'High-value tasks are sitting idle. Identify the revenue-critical work that needs attention ' +
    'and propose advancing it. Include chips.',

  empty_today_list:
    '[PROACTIVE TRIGGER: empty_today_list]\n' +
    "Marcus's Today list is empty during working hours. Propose a focused plan " +
    'for the day based on deadlines, priorities, and recent momentum. Include chips.',

  deadline_approaching:
    '[PROACTIVE TRIGGER: deadline_approaching]\n' +
    'A task deadline is approaching within 48 hours. Surface it, assess readiness, ' +
    'and suggest the next concrete step. Include chips.',

  time_reminder:
    '[PROACTIVE TRIGGER: time_reminder]\n' +
    'A task with a time-based reminder is due now. Remind Marcus briefly ' +
    'and suggest immediate action. Include chips.',
};

// ─── Working hours check ────────────────────────────────────

const isWorkingHours = (now: Date, timezone: string): boolean => {
  const local = new Date(
    now.toLocaleString('en-US', { timeZone: timezone }),
  );
  const day = local.getDay();
  const hour = local.getHours();
  return day >= 1 && day <= 5 && hour >= 8 && hour <= 18;
};

const toLocalDateKey = (now: Date, timezone: string): string => {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
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
  private intervalId: NodeJS.Timeout | null = null;
  private deps: ProactiveLoopDeps;
  private running = false;
  private reminderTimers = new Map<string, NodeJS.Timeout>();
  private unsubscribeTaskChange: (() => void) | null = null;

  constructor(deps: ProactiveLoopDeps) {
    this.deps = deps;
  }

  start(): void {
    if (this.intervalId) return;

    this.intervalId = setInterval(() => {
      void this.evaluate();
    }, INTERVAL_MS);

    this.unsubscribeTaskChange = subscribeTaskChanges(() => {
      this.onTaskChange();
    });

    this.scheduleUpcomingReminders();

    // eslint-disable-next-line no-console
    console.info('[proactive-loop] started (interval: 30min)');
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    for (const timer of this.reminderTimers.values()) {
      clearTimeout(timer);
    }
    this.reminderTimers.clear();

    if (this.unsubscribeTaskChange) {
      this.unsubscribeTaskChange();
      this.unsubscribeTaskChange = null;
    }

    // eslint-disable-next-line no-console
    console.info('[proactive-loop] stopped');
  }

  async onAppOpen(): Promise<void> {
    const now = new Date();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const today = toLocalDateKey(now, timezone);
    const lastBriefing = getSetting(LAST_MORNING_BRIEFING_KEY);
    if (lastBriefing === today) return;

    if (!isWorkingHours(now, timezone)) return;

    setSetting(LAST_MORNING_BRIEFING_KEY, today);
    recordCooldown('morning_briefing', now.getTime());

    await this.fireProactiveMessage('morning_briefing');
  }

  onTaskChange(): void {
    // Debounce: don't evaluate immediately, schedule in 2s
    setTimeout(() => {
      void this.evaluate();
    }, 2000);

    // Reschedule reminders when tasks change (new due dates, completions, etc.)
    this.scheduleUpcomingReminders();
  }

  /**
   * Scan active tasks for time-component dueDates (e.g., "2026-02-17T14:30")
   * and schedule setTimeout-based reminders for tasks due within the next interval.
   */
  private scheduleUpcomingReminders(): void {
    // Clear existing reminder timers
    for (const timer of this.reminderTimers.values()) {
      clearTimeout(timer);
    }
    this.reminderTimers.clear();

    const tasks = listTasks();
    const nowMs = Date.now();
    const horizon = nowMs + INTERVAL_MS + 5 * 60 * 1000; // next interval + 5min buffer

    for (const task of tasks) {
      if (task.status === 'done') continue;

      const parsed = parseDueDate(task.dueDate);
      if (!parsed || !parsed.hasTime) continue;

      // Only schedule if due in the future and within the scheduling horizon
      if (parsed.ms <= nowMs || parsed.ms > horizon) continue;

      // Skip if already reminded for this task
      const cooldownKey = `time_reminder:${task.id}`;
      if (isCooldownActive(cooldownKey, Infinity, nowMs)) continue;

      const delay = parsed.ms - nowMs;
      const timer = setTimeout(() => {
        this.reminderTimers.delete(task.id);
        recordCooldown(cooldownKey, Date.now());
        void this.fireProactiveMessage('time_reminder');
      }, delay);

      this.reminderTimers.set(task.id, timer);
    }

    if (this.reminderTimers.size > 0) {
      // eslint-disable-next-line no-console
      console.info(`[proactive-loop] scheduled ${this.reminderTimers.size} time reminder(s)`);
    }
  }

  private async evaluate(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      const now = new Date();
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      if (!isWorkingHours(now, timezone)) return;

      const { liveContext } = buildCanonicalRuntimeContext();
      const triggers = evaluateProactiveTriggers({
        liveContext,
        now: now.toISOString(),
        timezone,
      });

      if (triggers.length === 0) return;

      // Pick highest priority that isn't on cooldown
      const nowMs = now.getTime();
      const selected = triggers.find((t) => {
        const cooldownMinutes = COOLDOWN_CONFIG[t.trigger] ?? 120;
        return !isCooldownActive(t.trigger, cooldownMinutes, nowMs);
      });

      if (!selected) return;

      recordCooldown(selected.trigger, nowMs);
      await this.fireProactiveMessage(selected.trigger);

      // Refresh reminder schedule on each evaluation cycle
      this.scheduleUpcomingReminders();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[proactive-loop] evaluation error:', error);
    } finally {
      this.running = false;
    }
  }

  private async fireProactiveMessage(trigger: ProactiveTriggerType): Promise<void> {
    const template = TRIGGER_TEMPLATES[trigger];
    if (!template) return;

    const isWindowFocused = BrowserWindow.getAllWindows().some(
      (w) => !w.isDestroyed() && w.isFocused(),
    );

    try {
      await this.deps.startProactiveTurn({
        triggerMessage: template,
        triggerType: trigger,
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
                  triggerLabel(trigger),
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
                  triggerLabel(trigger),
                  firstSentence.slice(0, 100),
                );
              }
            }
          }
        },
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn(`[proactive-loop] failed to fire ${trigger}:`, error);
    }
  }
}

const triggerLabel = (trigger: ProactiveTriggerType): string => {
  switch (trigger) {
    case 'morning_briefing': return 'Morning Briefing';
    case 'overdue_accumulation': return 'Overdue Tasks';
    case 'stale_client_touchpoint': return 'Client Follow-up';
    case 'value_at_risk_idle': return 'Revenue at Risk';
    case 'empty_today_list': return 'Plan Your Day';
    case 'deadline_approaching': return 'Deadline Approaching';
    case 'time_reminder': return 'Reminder';
  }
};

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
