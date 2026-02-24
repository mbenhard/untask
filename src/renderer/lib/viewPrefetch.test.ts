// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type IdleCallback = (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void;

describe('viewPrefetch', () => {
  const originalRequestIdleCallback = window.requestIdleCallback;
  const originalCancelIdleCallback = window.cancelIdleCallback;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(window, 'requestIdleCallback', {
      configurable: true,
      writable: true,
      value: originalRequestIdleCallback,
    });
    Object.defineProperty(window, 'cancelIdleCallback', {
      configurable: true,
      writable: true,
      value: originalCancelIdleCallback,
    });
  });

  it('schedules idle callback and supports cancellation', async () => {
    let captured: IdleCallback | null = null;

    const requestIdleCallback = vi.fn<(cb: IdleCallback) => number>().mockImplementation((cb) => {
      captured = cb;
      return 17;
    });
    const cancelIdleCallback = vi.fn<(id: number) => void>();

    Object.defineProperty(window, 'requestIdleCallback', {
      configurable: true,
      writable: true,
      value: requestIdleCallback,
    });
    Object.defineProperty(window, 'cancelIdleCallback', {
      configurable: true,
      writable: true,
      value: cancelIdleCallback,
    });

    vi.resetModules();
    const { scheduleTargetedViewPrefetch, cancelTargetedViewPrefetch } = await import('./viewPrefetch');

    scheduleTargetedViewPrefetch();
    expect(requestIdleCallback).toHaveBeenCalledTimes(1);

    cancelTargetedViewPrefetch();
    expect(cancelIdleCallback).toHaveBeenCalledWith(17);

    expect(captured).not.toBeNull();
  });

  it('falls back to setTimeout when requestIdleCallback is unavailable', async () => {
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
    Object.defineProperty(window, 'requestIdleCallback', {
      configurable: true,
      writable: true,
      value: undefined,
    });

    vi.resetModules();
    const { scheduleTargetedViewPrefetch, cancelTargetedViewPrefetch } = await import('./viewPrefetch');

    scheduleTargetedViewPrefetch();
    expect(setTimeoutSpy).toHaveBeenCalledTimes(1);

    cancelTargetedViewPrefetch();
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
  });

  it('only schedules once while pending and does not reschedule after completion', async () => {
    const requestIdleCallback = vi.fn<(cb: IdleCallback) => number>().mockImplementation(() => 21);

    Object.defineProperty(window, 'requestIdleCallback', {
      configurable: true,
      writable: true,
      value: requestIdleCallback,
    });
    Object.defineProperty(window, 'cancelIdleCallback', {
      configurable: true,
      writable: true,
      value: () => undefined,
    });

    vi.resetModules();
    const { scheduleTargetedViewPrefetch } = await import('./viewPrefetch');

    scheduleTargetedViewPrefetch();
    scheduleTargetedViewPrefetch();
    expect(requestIdleCallback).toHaveBeenCalledTimes(1);

    const idleRun = requestIdleCallback.mock.calls[0]?.[0];
    idleRun?.({ didTimeout: false, timeRemaining: () => 50 });
    scheduleTargetedViewPrefetch();
    expect(requestIdleCallback).toHaveBeenCalledTimes(1);
  });
});
