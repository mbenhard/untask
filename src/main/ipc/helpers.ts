import { BrowserWindow, dialog, type IpcMainInvokeEvent, type OpenDialogOptions, type SaveDialogOptions } from 'electron';

/**
 * Higher-order function that wraps an IPC handler with consistent error logging.
 * Eliminates the need for try/catch in every handler.
 */
export function withIpcLogging<TArgs extends unknown[], TReturn>(
  channel: string,
  handler: (...args: TArgs) => TReturn,
): (...args: TArgs) => TReturn {
  return (...args: TArgs) => {
    try {
      return handler(...args);
    } catch (e) {
      console.error(`[ipc] ${channel}:`, e);
      throw e;
    }
  };
}

/**
 * Shows an open dialog parented to the sender's window.
 */
export async function showOpenDialogWithOwner(
  event: IpcMainInvokeEvent,
  options: OpenDialogOptions,
) {
  const owner = BrowserWindow.fromWebContents(event.sender) ?? undefined;
  return owner ? dialog.showOpenDialog(owner, options) : dialog.showOpenDialog(options);
}

/**
 * Shows a save dialog parented to the sender's window.
 */
export async function showSaveDialogWithOwner(
  event: IpcMainInvokeEvent,
  options: SaveDialogOptions,
) {
  const owner = BrowserWindow.fromWebContents(event.sender) ?? undefined;
  return owner ? dialog.showSaveDialog(owner, options) : dialog.showSaveDialog(options);
}
