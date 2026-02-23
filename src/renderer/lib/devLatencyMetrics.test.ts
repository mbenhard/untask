import { describe, expect, it, vi } from 'vitest';

import { createDevLatencyMetrics } from './devLatencyMetrics';

describe('devLatencyMetrics', () => {
  it('records durations and logs aggregates at the configured interval', () => {
    let ticks = 0;
    const now = () => {
      ticks += 1;
      return ticks * 10;
    };
    const logger = vi.fn<(message: string) => void>();
    const metrics = createDevLatencyMetrics({
      enabled: true,
      logEvery: 2,
      now,
      logger,
    });

    metrics.start('note-editor-open', 'n1');
    expect(metrics.end('note-editor-open', 'n1')).toBe(10);
    expect(logger).not.toHaveBeenCalled();

    metrics.start('note-editor-open', 'n2');
    expect(metrics.end('note-editor-open', 'n2')).toBe(10);
    expect(logger).toHaveBeenCalledTimes(1);
    expect(logger.mock.calls[0]?.[0]).toContain('flow=note-editor-open');

    const snapshot = metrics.getSnapshot('note-editor-open');
    expect(snapshot).not.toBeNull();
    expect(snapshot?.samples).toBe(2);
    expect(snapshot?.averageMs).toBe(10);
    expect(snapshot?.maxMs).toBe(10);
  });

  it('treats canceled pending measurements as non-samples', () => {
    const now = vi.fn(() => 100);
    const metrics = createDevLatencyMetrics({ enabled: true, now });

    metrics.start('task-editor-open', 't1');
    metrics.cancel('task-editor-open', 't1');

    expect(metrics.end('task-editor-open', 't1')).toBeNull();
    const snapshot = metrics.getSnapshot('task-editor-open');
    expect(snapshot).toBeNull();
  });

  it('is a no-op when disabled', () => {
    const logger = vi.fn<(message: string) => void>();
    const metrics = createDevLatencyMetrics({
      enabled: false,
      logger,
    });

    metrics.start('note-editor-open', 'n1');
    expect(metrics.end('note-editor-open', 'n1')).toBeNull();
    metrics.cancel('note-editor-open', 'n1');

    expect(metrics.getSnapshot('note-editor-open')).toBeNull();
    expect(logger).not.toHaveBeenCalled();
  });
});
