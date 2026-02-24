/**
 * Module-level guard to suppress TASK_DATA_CHANGED refreshes while
 * an editor body auto-save IPC call is in flight. Without this, the
 * main-process broadcast triggers a full task store refresh that
 * steals focus from the BlockNote editor.
 */
let _active = 0;

export const suppressTaskRefresh = (): void => {
  _active++;
};

export const unsuppressTaskRefresh = (): void => {
  _active = Math.max(0, _active - 1);
};

export const isTaskRefreshSuppressed = (): boolean => _active > 0;
