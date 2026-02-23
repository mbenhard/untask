type DevLatencyStats = {
  samples: number;
  totalMs: number;
  maxMs: number;
  canceled: number;
};

type DevLatencyMetricOptions = {
  enabled?: boolean;
  logEvery?: number;
  now?: () => number;
  logger?: (message: string) => void;
};

type DevLatencyMetricSnapshot = {
  samples: number;
  averageMs: number;
  maxMs: number;
  canceled: number;
};

export type DevLatencyMetrics = {
  start: (flow: string, key: string | number) => void;
  end: (flow: string, key: string | number) => number | null;
  cancel: (flow: string, key: string | number) => void;
  getSnapshot: (flow: string) => DevLatencyMetricSnapshot | null;
};

const DEFAULT_LOG_EVERY = 10;

const toCompositeKey = (flow: string, key: string | number): string => `${flow}:${String(key)}`;

export const createDevLatencyMetrics = (options?: DevLatencyMetricOptions): DevLatencyMetrics => {
  const enabled = options?.enabled ?? false;
  const logEvery = Math.max(1, options?.logEvery ?? DEFAULT_LOG_EVERY);
  const now = options?.now ?? (() => performance.now());
  const logger = options?.logger ?? ((message: string) => console.debug(message));

  const pending = new Map<string, number>();
  const statsByFlow = new Map<string, DevLatencyStats>();

  const getOrCreateStats = (flow: string): DevLatencyStats => {
    const existing = statsByFlow.get(flow);
    if (existing) return existing;
    const created: DevLatencyStats = { samples: 0, totalMs: 0, maxMs: 0, canceled: 0 };
    statsByFlow.set(flow, created);
    return created;
  };

  const getSnapshot = (flow: string): DevLatencyMetricSnapshot | null => {
    const stats = statsByFlow.get(flow);
    if (!stats || stats.samples === 0) return null;
    return {
      samples: stats.samples,
      averageMs: stats.totalMs / stats.samples,
      maxMs: stats.maxMs,
      canceled: stats.canceled,
    };
  };

  return {
    start: (flow, key) => {
      if (!enabled) return;
      pending.set(toCompositeKey(flow, key), now());
    },
    end: (flow, key) => {
      if (!enabled) return null;
      const compositeKey = toCompositeKey(flow, key);
      const startedAt = pending.get(compositeKey);
      if (startedAt === undefined) return null;
      pending.delete(compositeKey);

      const elapsedMs = Math.max(0, now() - startedAt);
      const stats = getOrCreateStats(flow);
      stats.samples += 1;
      stats.totalMs += elapsedMs;
      stats.maxMs = Math.max(stats.maxMs, elapsedMs);

      if (stats.samples % logEvery === 0) {
        const averageMs = stats.totalMs / stats.samples;
        logger(
          `[ux-latency] flow=${flow} samples=${stats.samples} avg_ms=${averageMs.toFixed(1)} max_ms=${stats.maxMs.toFixed(1)} canceled=${stats.canceled}`,
        );
      }

      return elapsedMs;
    },
    cancel: (flow, key) => {
      if (!enabled) return;
      const compositeKey = toCompositeKey(flow, key);
      if (pending.delete(compositeKey)) {
        const stats = getOrCreateStats(flow);
        stats.canceled += 1;
      }
    },
    getSnapshot,
  };
};

const isDevMetricMode = import.meta.env.DEV && import.meta.env.MODE !== 'test';

export const devLatencyMetrics = createDevLatencyMetrics({
  enabled: isDevMetricMode,
  logEvery: 10,
});
