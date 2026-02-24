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
    silent: boolean;
    handlers: Record<string, () => void>;
    on: (event: string, handler: () => void) => void;
    show: () => void;
  };

  const mockNotifications: MockNotification[] = [];

  // Must be a regular function (not arrow) so it works with `new`
  const MockNotificationClass = vi.fn().mockImplementation(
    function (this: MockNotification, { title, body, silent }: { title: string; body: string; silent?: boolean }) {
      this.title = title;
      this.body = body;
      this.silent = silent ?? false;
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
}));

vi.mock('../window/summonController', () => ({
  getMainWindow: vi.fn(() => ({
    isDestroyed: () => false,
    show: mockWindowShow,
    focus: mockWindowFocus,
    webContents: { send: mockWebContentsSend },
  })),
}));

vi.mock('./taskService', () => ({
  listTasks: () => mockTaskListRef.current,
  getTaskById: (id: string) => mockTaskListRef.current.find((t: Task) => t.id === id) ?? null,
  subscribeTaskChanges: (cb: (event: { taskId: string; action: string }) => void) => {
    mockSubscribeCallback(cb);
    return vi.fn();
  },
}));

vi.mock('./settingsService', () => ({
  getSettingWithDefault: (key: string) => {
    if (key === 'notifications.enabled') return 'true';
    if (key === 'notifications.sound') return 'true';
    return null;
  },
}));

vi.mock('../ipc/notifications', () => ({
  observePermission: vi.fn(),
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

    it('does not fire notification before the scheduled time', () => {
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

  // ─── Notification click ──────────────────────────────────

  describe('notification click', () => {
    it('sends TASK_NAVIGATE on future reminder notification click', () => {
      vi.setSystemTime(new Date('2026-02-18T14:00'));
      mockTaskListRef.current = [
        makeTask({
          id: 'click-task',
          title: 'Click Me',
          dueDate: '2026-02-18T14:30',
          reminderOffset: 'at_due',
        }),
      ];

      initReminderScheduler();

      // Advance to trigger the reminder
      vi.advanceTimersByTime(30 * 60 * 1000);

      const notification = mockNotifications.find((n) => n.title === 'Task due now');
      expect(notification).toBeDefined();
      if (!notification) {
        throw new Error('Expected due now notification');
      }

      notification.handlers.click?.();

      expect(mockWindowShow).toHaveBeenCalled();
      expect(mockWindowFocus).toHaveBeenCalled();
      expect(mockWebContentsSend).toHaveBeenCalledWith('task:navigate', {
        taskId: 'click-task',
      });
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

  // ─── Task change handler ──────────────────────────────────

  describe('onTaskChange handler', () => {
    const getSubscribedCallback = () => {
      initReminderScheduler();
      return mockSubscribeCallback.mock.calls[0][0] as (
        event: { taskId: string; action: string },
      ) => void;
    };

    it('schedules a timer when a task is created via change event', () => {
      vi.setSystemTime(new Date('2026-02-18T14:00'));
      mockTaskListRef.current = [];

      const onTaskChange = getSubscribedCallback();

      // Add the task to the list so getTaskById can find it
      mockTaskListRef.current = [
        makeTask({
          id: 'new-task',
          title: 'New Task',
          dueDate: '2026-02-18T14:30',
          reminderOffset: 'at_due',
        }),
      ];
      onTaskChange({ taskId: 'new-task', action: 'create' });

      vi.advanceTimersByTime(30 * 60 * 1000);
      expect(
        mockNotifications.find(
          (n) => n.title === 'Task due now' && n.body === 'New Task',
        ),
      ).toBeDefined();
    });

    it('clears timer when a task is completed via change event', () => {
      vi.setSystemTime(new Date('2026-02-18T14:00'));
      mockTaskListRef.current = [
        makeTask({
          id: 'complete-me',
          title: 'Complete Me',
          dueDate: '2026-02-18T14:30',
          reminderOffset: 'at_due',
        }),
      ];

      const onTaskChange = getSubscribedCallback();

      // Complete the task
      onTaskChange({ taskId: 'complete-me', action: 'complete' });

      vi.advanceTimersByTime(30 * 60 * 1000);
      expect(
        mockNotifications.find(
          (n) => n.title === 'Task due now' && n.body === 'Complete Me',
        ),
      ).toBeUndefined();
    });

    it('clears timer when a task is deleted via change event', () => {
      vi.setSystemTime(new Date('2026-02-18T14:00'));
      mockTaskListRef.current = [
        makeTask({
          id: 'delete-me',
          title: 'Delete Me',
          dueDate: '2026-02-18T14:30',
          reminderOffset: 'at_due',
        }),
      ];

      const onTaskChange = getSubscribedCallback();

      onTaskChange({ taskId: 'delete-me', action: 'delete' });

      vi.advanceTimersByTime(30 * 60 * 1000);
      expect(
        mockNotifications.find(
          (n) => n.title === 'Task due now' && n.body === 'Delete Me',
        ),
      ).toBeUndefined();
    });

    it('reschedules timer when a task is updated via change event', () => {
      vi.setSystemTime(new Date('2026-02-18T14:00'));
      mockTaskListRef.current = [
        makeTask({
          id: 'update-me',
          title: 'Update Me',
          dueDate: '2026-02-18T14:30',
          reminderOffset: 'at_due',
        }),
      ];

      const onTaskChange = getSubscribedCallback();

      // Update the task to a later due date
      mockTaskListRef.current = [
        makeTask({
          id: 'update-me',
          title: 'Update Me',
          dueDate: '2026-02-18T15:00',
          reminderOffset: 'at_due',
        }),
      ];
      onTaskChange({ taskId: 'update-me', action: 'update' });

      // At 14:30 — original time — should NOT fire
      vi.advanceTimersByTime(30 * 60 * 1000);
      expect(
        mockNotifications.find(
          (n) => n.title === 'Task due now' && n.body === 'Update Me',
        ),
      ).toBeUndefined();

      // At 15:00 — updated time — should fire
      vi.advanceTimersByTime(30 * 60 * 1000);
      expect(
        mockNotifications.find(
          (n) => n.title === 'Task due now' && n.body === 'Update Me',
        ),
      ).toBeDefined();
    });
  });
});
