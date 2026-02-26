import { Tray, Menu, nativeImage, shell } from 'electron';

import { IPC_CHANNELS } from '../types/ipc';
import { TERMINAL_STATUSES, type PredefinedStatusId } from '../types/models';
import { checkForUpdates, getUpdateInfo } from './services/updateChecker';
import { listTasks } from './services/taskService';
import { sendMenuAction } from './shortcuts';
import { summonWindow, showQuickAdd } from './window/summonController';
import { getTrayIconPath } from './window/trayIcon';

let tray: Tray | null = null;

// ─── Update menu item state ──────────────────────────────
type UpdateMenuState = 'idle' | 'checking' | 'up-to-date' | 'available';
let updateMenuState: UpdateMenuState = 'idle';
let upToDateTimer: ReturnType<typeof setTimeout> | null = null;

export function getTray(): Tray | null {
  return tray;
}

// ─── Menu builder ────────────────────────────────────────

function buildTodayLabel(): string {
  try {
    const todayTasks = listTasks({ today: true });
    const total = todayTasks.length;
    const done = todayTasks.filter(
      (t) => TERMINAL_STATUSES.includes(t.status as PredefinedStatusId),
    ).length;

    if (total === 0) return 'Today: No tasks';
    if (done === total) return 'Today: All done!';
    return `Today: ${done} of ${total} done`;
  } catch {
    return 'Today';
  }
}

function buildUpdateMenuItem(): Electron.MenuItemConstructorOptions {
  const cached = getUpdateInfo();

  // If an update was previously found, show it regardless of current checking state
  if (cached?.hasUpdate) {
    updateMenuState = 'available';
  }

  switch (updateMenuState) {
    case 'checking':
      return { label: 'Checking for Updates...', enabled: false };
    case 'up-to-date':
      return { label: 'Up to Date', enabled: false };
    case 'available': {
      const version = cached?.latestVersion ?? 'new version';
      const url = cached?.releaseUrl;
      return {
        label: `Update Available (v${version})`,
        click: () => {
          if (url) void shell.openExternal(url);
        },
      };
    }
    default:
      return {
        label: 'Check for Updates...',
        click: () => void handleCheckForUpdates(),
      };
  }
}

async function handleCheckForUpdates(): Promise<void> {
  updateMenuState = 'checking';
  rebuildMenu();

  try {
    const info = await checkForUpdates(true);

    if (info.hasUpdate) {
      updateMenuState = 'available';
    } else {
      updateMenuState = 'up-to-date';
      // Revert to idle after 3 seconds
      if (upToDateTimer) clearTimeout(upToDateTimer);
      upToDateTimer = setTimeout(() => {
        updateMenuState = 'idle';
        rebuildMenu();
      }, 3000);
    }
  } catch {
    updateMenuState = 'idle';
  }

  rebuildMenu();
}

function rebuildMenu(): void {
  if (!tray) return;

  const contextMenu = Menu.buildFromTemplate([
    { label: buildTodayLabel(), enabled: false },
    { type: 'separator' },
    {
      label: 'Quick Add Task...',
      accelerator: 'CommandOrControl+Shift+A',
      click: () => showQuickAdd(),
    },
    {
      label: 'Open Untask',
      accelerator: 'CommandOrControl+Shift+Space',
      click: () => summonWindow(),
    },
    { type: 'separator' },
    {
      label: 'Settings...',
      click: () => sendMenuAction(IPC_CHANNELS.APP_MENU_SETTINGS),
    },
    buildUpdateMenuItem(),
    { type: 'separator' },
    { label: 'Quit Untask', role: 'quit' },
  ]);

  tray.setContextMenu(contextMenu);
}

// ─── Setup & lifecycle ───────────────────────────────────

export function setupTray(): void {
  if (process.platform !== 'darwin') {
    return;
  }

  try {
    const iconPath = getTrayIconPath();
    const icon = nativeImage.createFromPath(iconPath);
    icon.setTemplateImage(true);

    tray = new Tray(icon);
    tray.setToolTip('Untask');

    rebuildMenu();
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

  rebuildMenu();
}

export function setUpdateTooltip(version: string): void {
  tray?.setToolTip(`Untask — v${version} available`);
  // Also update the menu item to reflect the available update
  updateMenuState = 'available';
  rebuildMenu();
}

export function clearUpdateTooltip(): void {
  tray?.setToolTip('Untask');
}

export function destroyTray(): void {
  if (upToDateTimer) {
    clearTimeout(upToDateTimer);
    upToDateTimer = null;
  }
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
