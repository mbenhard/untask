import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

export function getTrayIconPath(): string {
  // In packaged app, extraResource files are in Contents/Resources/
  const packagedPath = path.join(
    process.resourcesPath,
    'tray',
    'trayTemplate.png',
  );

  // In dev, relative to project root
  const devPath = path.join(app.getAppPath(), 'assets', 'tray', 'trayTemplate.png');

  if (fs.existsSync(packagedPath)) {
    return packagedPath;
  }

  if (fs.existsSync(devPath)) {
    return devPath;
  }

  // eslint-disable-next-line no-console
  console.warn('[tray] no tray icon found at expected paths:', {
    packagedPath,
    devPath,
  });

  return devPath;
}
