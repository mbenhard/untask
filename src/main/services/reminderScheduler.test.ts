import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Task } from '../../types/models';

// ─── Hoisted mocks (accessible inside vi.mock factories) ────

const {
  mockNotifications,
  MockNotificationClass,
  mockWebContentsSend,
  mockWindowShow,
  mockWindowFocus,
  mockTaskListRef,
  mockSubscribeCallback,
} = vi.hoisted(() => {
  type MockNotification = {
    title: string;
    body: string;
    handlers: Record<string, () => void>;
    on: (event: string, handler: () => void) => void;
    show: () => void;
  };

  const mockNotifications: MockNotification[] = [];

  // Must be a regular function (not arrow) so it works with `new`
  const MockNotificationClass = vi.fn().mockImplementation(
    function (this: MockNotification, { title, body }: { title: string; body: string }) {
      this.title = title;
      this.body = body;
      this.handlers = {};
      this.on = (event: string, handler: () => void) => {
        this.handlers[event] = handler;
      };
      this.show = vi.fn();
      mockNotifications.push(this);
    },
  );

  const mockWebContentsSend = vi.fn();
  const mockWindowShow = vi.fn();
  const mockWindowFocus = vi.fn();
  const mockTaskListRef = { current: [] as Task[] };
  const mockSubscribeCallback = vi.fn();

  return {
    mockNotifications,
    MockNotificationClass,
    mockWebContentsSend,
    mockWindowShow,
    mockWindowFocus,
    mockTaskListRef,
    mockSubscribeCallback,
  };
});

// ─── Module mocks ────────────────────────────────────────────

vi.mock('electron', () => ({
  Notification: Object.assign(MockNotificationClass, {
    isSupported: vi.fn(() => true),
  }),
  BrowserWindow: {
    getAllWindows: vi.fn(() => [
      {
        isDestroyed: () => false,
        show: mockWindowShow,
        focus: mockWindowFocus,
        webContents: { send: mockWebContentsSend },
      },
    ]),
  },
}));

vi.mock('./taskService', () => ({
  listTasks: () => mockTaskListRef.current,
  subscribeTaskChanges: (cb: () => void) => {
    mockSubscribeCallback(cb);
    return vi.fn();
  },
}));

// Import AFTER mocks are set up
import { initReminderScheduler, stopReminderScheduler } from './reminderScheduler';

// ─── Helpers ─────────────────────────────────────────────────

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  parentId: null,
  title: 'Test Task',
  body: null,
  status: 'active',
  priority: 'none',
  today: false,
  client: null,
  dueDate: null,
  dueType: null,
  effort: 'unknown',
  recurrence: null,
  recurrenceSourceId: null,
  reminderOffset: 'at_due',
  order: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  completedAt: null,
  cancelledAt: null,
  ...overrides,
});

// ─── Tests ───────────────────────────────────────────────────

describe('reminderScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockNotifications.length = 0;
    mockTaskListRef.current = [];
    MockNotificationClass.mockClear();
    mockWebContentsSend.mockClear();
    mockWindowShow.mockClear();
    mockWindowFocus.mockClear();
    mockSubscribeCallback.mockClear();
  });

  afterEach(() => {
    stopReminderScheduler();
    vi.useRealTimers();
  });

  // ─── Overdue catch-up ────────────────────────────────────

  describe('overdue catch-up on startup', () => {
    it('shows single notification for one overdue task', () => {
      vi.setSystemTime(new Date('2026-02-18T10:00'));
      mockTaskListRef.current = [
        makeTask({
          id: 'overdue-1',
          title: 'Overdue Task',
          dueDate: '2026-02-18T08:00',
        }),
      ];

      initReminderScheduler();

      expect(MockNotificationClass).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Task overdue',
          body: 'Overdue Task',
        }),
      );
    });

    it('shows summary notification for multiple overdue tasks', () => {
      vi.setSystemTime(new Date('2026-02-18T10:00'));
      mockTaskListRef.current = [
        makeTask({ id: 't1', title: 'Task A', dueDate: '2026-02-17T08:00' }),
        makeTask({ id: 't2', title: 'Task B', dueDate: '2026-02-17T09:00' }),
        makeTask({ id: 't3', title: 'Task C', dueDate: '2026-02-18T08:00' }),
      ];

      initReminderScheduler();

      expect(MockNotificationClass).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '3 tasks overdue',
          body: 'Task A, Task B, Task C',
        }),
      );
    });

    it('truncates summary body to 3 tasks', () => {
      vi.setSystemTime(new Date('2026-02-18T10:00'));
      mockTaskListRef.current = [
        makeTask({ id: 't1', title: 'A', dueDate: '2026-02-17T08:00' }),
        makeTask({ id: 't2', title: 'B', dueDate: '2026-02-17T08:00' }),
        makeTask({ id: 't3', title: 'C', dueDate: '2026-02-17T08:00' }),
        makeTask({ id: 't4', title: 'D', dueDate: '2026-02-17T08:00' }),
      ];

      initReminderScheduler();

      expect(MockNotificationClass).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '4 tasks overdue',
          body: 'A, B, C',
        }),
      );
    });

    it('skips done and cancelled tasks', () => {
      vi.setSystemTime(new Date('2026-02-18T10:00'));
      mockTaskListRef.current = [
        makeTask({ id: 't1', dueDate: '2026-02-17', status: 'done' }),
        makeTask({ id: 't2', dueDate: '2026-02-17', status: 'cancelled' }),
      ];

      initReminderScheduler();

      expect(MockNotificationClass).not.toHaveBeenCalled();
    });

    it('does not fire for tasks without due dates', () => {
      vi.setSystemTime(new Date('2026-02-18T10:00'));
      mockTaskListRef.current = [makeTask({ dueDate: null })];

      initReminderScheduler();

      expect(MockNotificationClass).not.toHaveBeenCalled();
    });

    it('treats date-only due dates as 9 AM local for overdue check', () => {
      // At 8:59 AM, a date-only task for today is NOT overdue (9AM threshold)
      vi.setSystemTime(new Date('2026-02-18T08:59'));
      mockTaskListRef.current = [
        makeTask({ id: 't1', title: 'Today task', dueDate: '2026-02-18' }),
      ];

      initReminderScheduler();

      const overdueNotification = mockNotifications.find((n) => n.title === 'Task overdue');
      expect(overdueNotification).toBeUndefined();
    });
  });

  // ─── Scan and schedule ───────────────────────────────────

  describe('scan and schedule', () => {
    it('schedules a timer for a task due within the next hour', () => {
      vi.setSystemTime(new Date('2026-02-18T14:00'));
      mockTaskListRef.current = [
        makeTask({
          id: 'soon-task',
          title: 'Due Soon',
          dueDate: '2026-02-18T14:30',
          reminderOffset: 'at_due',
        }),
      ];

      initReminderScheduler();

      // Advance 30 minutes → the timer fires
      vi.advanceTimersByTime(30 * 60 * 1000);

      const dueNowNotification = mockNotifications.find(
        (n) => n.title === 'Task due now' && n.body === 'Due Soon',
      );
      expect(dueNowNotification).toBeDefined();
    });

    it('does not schedule tasks due beyond 1 hour', () => {
      vi.setSystemTime(new Date('2026-02-18T14:00'));
      mockTaskListRef.current = [
        makeTask({
          id: 'far-task',
          title: 'Due Later',
          dueDate: '2026-02-18T16:00',
          reminderOffset: 'at_due',
        }),
      ];

      initReminderScheduler();
      const initialCount = mockNotifications.length;

      vi.advanceTimersByTime(30 * 60 * 1000);

      expect(mockNotifications.length).toBe(initialCount);
    });

    it('applies 15m reminder offset correctly', () => {
      // Task due at 14:30, offset=15m → reminder at 14:15
      vi.setSystemTime(new Date('2026-02-18T14:00'));
      mockTaskListRef.current = [
        makeTask({
          id: 'offset-task',
          title: 'Offset Task',
          dueDate: '2026-02-18T14:30',
          reminderOffset: '15m',
        }),
      ];

      initReminderScheduler();

      // At 14 min → not yet
      vi.advanceTimersByTime(14 * 60 * 1000);
      expect(mockNotifications.find((n) => n.title === 'Task due in 15 minutes')).toBeUndefined();

      // At 15 min → fires
      vi.advanceTimersByTime(1 * 60 * 1000);
      expect(
        mockNotifications.find(
          (n) => n.title === 'Task due in 15 minutes' && n.body === 'Offset Task',
        ),
      ).toBeDefined();
    });

    it('applies 1h reminder offset correctly', () => {
      // Task due at 14:45, offset=1h → reminder at 13:45
      vi.setSystemTime(new Date('2026-02-18T13:00'));
      mockTaskListRef.current = [
        makeTask({
          id: '1h-task',
          title: 'Hour Before',
          dueDate: '2026-02-18T14:45',
          reminderOffset: '1h',
        }),
      ];

      initReminderScheduler();

      vi.advanceTimersByTime(45 * 60 * 1000);
      expect(
        mockNotifications.find(
          (n) => n.title === 'Task due in 1 hour' && n.body === 'Hour Before',
        ),
      ).toBeDefined();
    });

    it('applies 1d reminder offset correctly', () => {
      // Task due at 2026-02-19T10:00, offset=1d → reminder at 2026-02-18T10:00
      vi.setSystemTime(new Date('2026-02-18T09:30'));
      mockTaskListRef.current = [
        makeTask({
          id: '1d-task',
          title: 'Day Before',
          dueDate: '2026-02-19T10:00',
          reminderOffset: '1d',
        }),
      ];

      initReminderScheduler();

      vi.advanceTimersByTime(30 * 60 * 1000);
      expect(
        mockNotifications.find(
          (n) => n.title === 'Task due in 1 day' && n.body === 'Day Before',
        ),
      ).toBeDefined();
    });

    it('falls back to at_due for unknown offset values', () => {
      vi.setSystemTime(new Date('2026-02-18T14:00'));
      mockTaskListRef.current = [
        makeTask({
          id: 'unknown-offset',
          title: 'Unknown Offset',
          dueDate: '2026-02-18T14:30',
          reminderOffset: 'bogus' as string,
        }),
      ];

      initReminderScheduler();

      // Offset parsed as 0 → reminder at 14:30
      vi.advanceTimersByTime(30 * 60 * 1000);
      expect(
        mockNotifications.find(
          (n) => n.title === 'Task due now' && n.body === 'Unknown Offset',
        ),
      ).toBeDefined();
    });
  });

  // ─── Cooldown ────────────────────────────────────────────

  describe('cooldown', () => {
    it('does not fire the same reminder twice', () => {
      vi.setSystemTime(new Date('2026-02-18T14:00'));
      mockTaskListRef.current = [
        makeTask({
          id: 'cool-task',
          title: 'Cooldown Task',
          dueDate: '2026-02-18T14:30',
          reminderOffset: 'at_due',
        }),
      ];

      initReminderScheduler();

      vi.advanceTimersByTime(30 * 60 * 1000);
      const firstCount = mockNotifications.filter(
        (n) => n.body === 'Cooldown Task' && n.title === 'Task due now',
      ).length;
      expect(firstCount).toBe(1);

      // Advance another hour → rescan runs, same task should be cooled down
      vi.advanceTimersByTime(60 * 60 * 1000);
      const secondCount = mockNotifications.filter(
        (n) => n.body === 'Cooldown Task' && n.title === 'Task due now',
      ).length;
      expect(secondCount).toBe(1);
    });
  });

  // ─── AI callback ─────────────────────────────────────────

  describe('AI callback', () => {
    it('fires AI reminder when callback is provided', () => {
      vi.setSystemTime(new Date('2026-02-18T14:00'));
      const mockAiReminder = vi.fn().mockResolvedValue(undefined);

      mockTaskListRef.current = [
        makeTask({
          id: 'ai-task',
          title: 'AI Task',
          dueDate: '2026-02-18T14:30',
          reminderOffset: 'at_due',
        }),
      ];

      initReminderScheduler({ fireAiReminder: mockAiReminder });

      vi.advanceTimersByTime(30 * 60 * 1000);

      expect(mockAiReminder).toHaveBeenCalledWith({
        id: 'ai-task',
        title: 'AI Task',
      });
    });

    it('does not call AI when no callback provided', () => {
      vi.setSystemTime(new Date('2026-02-18T14:00'));
      mockTaskListRef.current = [
        makeTask({
          id: 'no-ai',
          title: 'No AI',
          dueDate: '2026-02-18T14:30',
          reminderOffset: 'at_due',
        }),
      ];

      initReminderScheduler();

      vi.advanceTimersByTime(30 * 60 * 1000);

      const notification = mockNotifications.find((n) => n.body === 'No AI');
      expect(notification).toBeDefined();
    });

    it('catches AI callback errors without crashing', () => {
      vi.setSystemTime(new Date('2026-02-18T14:00'));
      const mockAiReminder = vi.fn().mockRejectedValue(new Error('AI down'));

      mockTaskListRef.current = [
        makeTask({
          id: 'err-task',
          title: 'Error Task',
          dueDate: '2026-02-18T14:30',
          reminderOffset: 'at_due',
        }),
      ];

      initReminderScheduler({ fireAiReminder: mockAiReminder });

      expect(() => vi.advanceTimersByTime(30 * 60 * 1000)).not.toThrow();

      const notification = mockNotifications.find((n) => n.body === 'Error Task');
      expect(notification).toBeDefined();
    });
  });

  // ─── Notification click ──────────────────────────────────

  describe('notification click', () => {
    it('sends TASK_NAVIGATE on single overdue notification click', () => {
      vi.setSystemTime(new Date('2026-02-18T10:00'));
      mockTaskListRef.current = [
        makeTask({ id: 'click-task', title: 'Click Me', dueDate: '2026-02-18T08:00' }),
      ];

      initReminderScheduler();

      const notification = mockNotifications.find((n) => n.title === 'Task overdue');
      expect(notification).toBeDefined();

      notification!.handlers.click?.();

      expect(mockWindowShow).toHaveBeenCalled();
      expect(mockWindowFocus).toHaveBeenCalled();
      expect(mockWebContentsSend).toHaveBeenCalledWith('task:navigate', {
        taskId: 'click-task',
      });
    });

    it('focuses window on summary notification click without TASK_NAVIGATE', () => {
      vi.setSystemTime(new Date('2026-02-18T10:00'));
      mockTaskListRef.current = [
        makeTask({ id: 't1', title: 'A', dueDate: '2026-02-18T08:00' }),
        makeTask({ id: 't2', title: 'B', dueDate: '2026-02-18T08:00' }),
      ];

      initReminderScheduler();

      const notification = mockNotifications.find((n) => n.title === '2 tasks overdue');
      expect(notification).toBeDefined();

      notification!.handlers.click?.();

      // Window focused but no task:navigate (summary, no specific task)
      expect(mockWindowShow).toHaveBeenCalled();
      expect(mockWindowFocus).toHaveBeenCalled();
      // No TASK_NAVIGATE should have been sent for summary
      expect(mockWebContentsSend).not.toHaveBeenCalledWith(
        'task:navigate',
        expect.anything(),
      );
    });
  });

  // ─── Lifecycle ───────────────────────────────────────────

  describe('lifecycle', () => {
    it('stopReminderScheduler clears all timers', () => {
      vi.setSystemTime(new Date('2026-02-18T14:00'));
      mockTaskListRef.current = [
        makeTask({
          id: 'stop-task',
          title: 'Stop Task',
          dueDate: '2026-02-18T14:30',
          reminderOffset: 'at_due',
        }),
      ];

      initReminderScheduler();
      stopReminderScheduler();

      vi.advanceTimersByTime(60 * 60 * 1000);

      const dueNotification = mockNotifications.find(
        (n) => n.title === 'Task due now' && n.body === 'Stop Task',
      );
      expect(dueNotification).toBeUndefined();
    });

    it('re-init clears previous state', () => {
      vi.setSystemTime(new Date('2026-02-18T14:00'));
      mockTaskListRef.current = [
        makeTask({
          id: 'reinit-task',
          title: 'Reinit Task',
          dueDate: '2026-02-18T14:30',
        }),
      ];

      initReminderScheduler();
      mockTaskListRef.current = [];
      initReminderScheduler();

      vi.advanceTimersByTime(30 * 60 * 1000);

      const notification = mockNotifications.find(
        (n) => n.title === 'Task due now' && n.body === 'Reinit Task',
      );
      expect(notification).toBeUndefined();
    });

    it('subscribes to task changes', () => {
      initReminderScheduler();
      expect(mockSubscribeCallback).toHaveBeenCalled();
    });
  });
});
