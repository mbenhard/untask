import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTaskRefreshCoalescer } from './taskRefreshCoalescer';

describe('taskRefreshCoalescer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('refreshes immediately on first change notification', async () => {
    const refresh = vi.fn(async () => undefined);
    const coalescer = createTaskRefreshCoalescer(refresh, { cooldownMs: 50 });

    coalescer.notifyChange();
    await vi.runAllTimersAsync();

    expect(refresh).toHaveBeenCalledTimes(1);
    coalescer.dispose();
  });

  it('coalesces burst notifications into one trailing refresh while a refresh is in flight', async () => {
    let resolveRefresh: (() => void) | undefined;
    const refreshGate = new Promise<void>((resolve) => {
      resolveRefresh = () => resolve();
    });
    const refresh = vi.fn(() => refreshGate);

    const coalescer = createTaskRefreshCoalescer(refresh, { cooldownMs: 50 });

    coalescer.notifyChange();
    expect(refresh).toHaveBeenCalledTimes(1);

    coalescer.notifyChange();
    coalescer.notifyChange();
    coalescer.notifyChange();

    await vi.advanceTimersByTimeAsync(200);
    expect(refresh).toHaveBeenCalledTimes(1);

    resolveRefresh?.();
    await Promise.resolve();

    await vi.advanceTimersByTimeAsync(50);
    expect(refresh).toHaveBeenCalledTimes(2);

    coalescer.dispose();
  });

  it('does not refresh after dispose even if notifications continue', async () => {
    const refresh = vi.fn(async () => undefined);
    const coalescer = createTaskRefreshCoalescer(refresh, { cooldownMs: 50 });

    coalescer.notifyChange();
    await vi.runAllTimersAsync();
    expect(refresh).toHaveBeenCalledTimes(1);

    coalescer.dispose();
    coalescer.notifyChange();
    await vi.runAllTimersAsync();

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('emits notify and refresh metrics', async () => {
    const refresh = vi.fn(async () => undefined);
    const onMetric = vi.fn<(event: 'notify' | 'refresh') => void>();
    const coalescer = createTaskRefreshCoalescer(refresh, { cooldownMs: 50, onMetric });

    coalescer.notifyChange();
    await vi.runAllTimersAsync();

    expect(onMetric.mock.calls.filter(([event]) => event === 'notify')).toHaveLength(1);
    expect(onMetric.mock.calls.filter(([event]) => event === 'refresh')).toHaveLength(1);

    coalescer.dispose();
  });
});
