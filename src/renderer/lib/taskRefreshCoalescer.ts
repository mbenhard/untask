export type TaskRefreshCoalescer = {
  notifyChange: () => void;
  dispose: () => void;
};

export type TaskRefreshMetricEvent = 'notify' | 'refresh';

export type TaskRefreshCoalescerOptions = {
  cooldownMs?: number;
  onMetric?: (event: TaskRefreshMetricEvent) => void;
};

const DEFAULT_COOLDOWN_MS = 120;

export const createTaskRefreshCoalescer = (
  refreshTasks: () => Promise<void>,
  options?: TaskRefreshCoalescerOptions,
): TaskRefreshCoalescer => {
  const cooldownMs = options?.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const onMetric = options?.onMetric;

  let disposed = false;
  let inFlight = false;
  let dirty = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = (): void => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const scheduleFlush = (flush: () => Promise<void>): void => {
    if (disposed || timer) {
      return;
    }

    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, cooldownMs);
  };

  const flush = async (): Promise<void> => {
    if (disposed) {
      return;
    }

    if (!dirty) {
      return;
    }

    if (inFlight) {
      scheduleFlush(flush);
      return;
    }

    dirty = false;
    inFlight = true;
    onMetric?.('refresh');

    try {
      await refreshTasks();
    } finally {
      inFlight = false;

      if (dirty) {
        scheduleFlush(flush);
      }
    }
  };

  return {
    notifyChange: () => {
      if (disposed) {
        return;
      }

      dirty = true;
      onMetric?.('notify');

      if (!inFlight && !timer) {
        void flush();
      } else {
        scheduleFlush(flush);
      }
    },
    dispose: () => {
      disposed = true;
      dirty = false;
      clearTimer();
    },
  };
};
