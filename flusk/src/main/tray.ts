import { Tray, Menu, nativeImage } from 'electron';

import { TERMINAL_STATUSES, type PredefinedStatusId } from '../types/models';
import { listTasks } from './services/taskService';
import { toggleWindow } from './window/summonController';
import { getTrayIconPath } from './window/trayIcon';

let tray: Tray | null = null;

export function setupTray(): void {
  if (process.platform !== 'darwin') {
    return;
  }

  try {
    const iconPath = getTrayIconPath();
    const icon = nativeImage.createFromPath(iconPath);
    icon.setTemplateImage(true);

    tray = new Tray(icon);
    tray.setToolTip('Flusk');

    tray.on('click', () => {
      toggleWindow();
    });

    const contextMenu = Menu.buildFromTemplate([
      { label: 'Toggle Window', click: toggleWindow },
      { type: 'separator' },
      { label: 'Quit', role: 'quit' },
    ]);
    tray.setContextMenu(contextMenu);

    refreshTodayBadge();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[tray] failed to initialize:', error);
  }
}

export function refreshTodayBadge(): void {
  if (!tray) return;

  try {
    const todayTasks = listTasks({ today: true });
    const remaining = todayTasks.filter(
      (t) => !TERMINAL_STATUSES.includes(t.status as PredefinedStatusId),
    ).length;
    tray.setTitle(remaining > 0 ? String(remaining) : '');
  } catch {
    // Badge refresh failure should not disrupt task mutations
  }
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
