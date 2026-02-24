type IdleCallbackDeadline = {
  didTimeout: boolean;
  timeRemaining: () => number;
};

type RequestIdleCallback = (
  callback: (deadline: IdleCallbackDeadline) => void,
  options?: { timeout: number },
) => number;

type CancelIdleCallback = (handle: number) => void;

type WindowWithIdleCallback = Window & {
  requestIdleCallback?: RequestIdleCallback;
  cancelIdleCallback?: CancelIdleCallback;
};

const PREFETCHERS: Array<() => Promise<unknown>> = [
  () => import('../components/views/TasksView'),
  () => import('../components/views/InboxView'),
  () => import('../components/search/SearchModal'),
  () => import('../components/notes/NotesView'),
  () => import('../components/settings/SettingsView'),
  () => import('../components/chat/ChatView'),
  () => import('../components/chat/ThreadListView'),
  () => import('../components/layout/ChatInput'),
];

let prefetchComplete = false;
let pendingCleanup: (() => void) | null = null;

const runPrefetchers = (): void => {
  for (const prefetch of PREFETCHERS) {
    void prefetch().catch(() => undefined);
  }
};

export const scheduleTargetedViewPrefetch = (): void => {
  if (prefetchComplete || pendingCleanup || typeof window === 'undefined') {
    return;
  }

  const runPrefetch = (): void => {
    pendingCleanup = null;
    if (prefetchComplete) {
      return;
    }
    prefetchComplete = true;
    runPrefetchers();
  };

  const browserWindow = window as WindowWithIdleCallback;
  if (typeof browserWindow.requestIdleCallback === 'function') {
    const handle = browserWindow.requestIdleCallback(
      () => {
        runPrefetch();
      },
      { timeout: 1200 },
    );

    pendingCleanup = () => {
      if (typeof browserWindow.cancelIdleCallback === 'function') {
        browserWindow.cancelIdleCallback(handle);
      }
      pendingCleanup = null;
    };
    return;
  }

  const timeout = window.setTimeout(() => {
    runPrefetch();
  }, 250);

  pendingCleanup = () => {
    window.clearTimeout(timeout);
    pendingCleanup = null;
  };
};

export const cancelTargetedViewPrefetch = (): void => {
  pendingCleanup?.();
};
