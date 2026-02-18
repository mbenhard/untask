import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { app } from 'electron';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { getDb } from './index';

export function runMigrations(): void {
  const db = getDb();
  const migrationPathCandidates = app.isPackaged
    ? [path.join(process.resourcesPath, 'drizzle')]
    : [
        path.join(app.getAppPath(), 'drizzle'),
        path.join(__dirname, '../../../drizzle'),
      ];

  const migrationsFolder = migrationPathCandidates.find((candidate) =>
    existsSync(candidate),
  );

  if (!migrationsFolder) {
    throw new Error(
      `Could not find migrations folder. Checked: ${migrationPathCandidates.join(
        ', ',
      )}`,
    );
  }

  migrate(db, { migrationsFolder });
}
