import { ipcMain, Notification, shell } from 'electron';
import { IPC_CHANNELS, type NotificationPermissionResult } from '../../types/ipc';
import { withIpcLogging } from './helpers';

// ─── Permission cache ────────────────────────────────────────
// Electron has no API to query macOS notification permission directly.
// Instead we piggyback on real notifications: if the 'show' event fires,
// permissions are granted. This avoids the old approach of firing an
// empty probe notification (which was visible to users as blank toasts).

const SHOW_EVENT_TIMEOUT_MS = 500;

let cachedPermission: 'granted' | 'denied' | 'unknown' = 'unknown';

/**
 * Observe a notification's 'show' event to update the cached permission.
 * Call this on every real notification that is shown.
 */
export const observePermission = (notification: Notification): void => {
  notification.on('show', () => {
    cachedPermission = 'granted';
  });
};

export const registerNotificationHandlers = (): void => {
  ipcMain.handle(
    IPC_CHANNELS.NOTIFICATIONS_FIRE_TEST,
    withIpcLogging(
      'NOTIFICATIONS_FIRE_TEST',
      (): Promise<NotificationPermissionResult> => {
        if (!Notification.isSupported()) {
          return Promise.resolve({ status: 'denied' });
        }

        return new Promise((resolve) => {
          const notification = new Notification({
            title: 'Reminders enabled',
            body: "You'll be notified when tasks are due.",
            silent: false,
          });

          let resolved = false;
          notification.on('show', () => {
            cachedPermission = 'granted';
            if (!resolved) {
              resolved = true;
              resolve({ status: 'granted' });
            }
          });

          notification.show();

          setTimeout(() => {
            if (!resolved) {
              resolved = true;
              cachedPermission = 'denied';
              resolve({ status: 'denied' });
            }
          }, SHOW_EVENT_TIMEOUT_MS);
        });
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.NOTIFICATIONS_PROBE_PERMISSION,
    withIpcLogging(
      'NOTIFICATIONS_PROBE_PERMISSION',
      (): NotificationPermissionResult => {
        if (!Notification.isSupported()) {
          return { status: 'denied' };
        }

        // Return cached status from the last real notification.
        // 'unknown' means no notification has been sent yet — treat as granted
        // so the renderer can assume notifications work until a scheduled
        // reminder fires and updates the cache.
        return { status: cachedPermission === 'denied' ? 'denied' : 'granted' };
      },
    ),
  );

  ipcMain.handle(
    IPC_CHANNELS.NOTIFICATIONS_OPEN_SETTINGS,
    withIpcLogging('NOTIFICATIONS_OPEN_SETTINGS', (): void => {
      shell.openExternal(
        'x-apple.systempreferences:com.apple.preference.notifications',
      );
    }),
  );
};
