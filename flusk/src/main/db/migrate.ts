import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { app } from 'electron';
import path from 'node:path';

import { getDb } from './index';

export function runMigrations(): void {
  const db = getDb();
  const migrationsFolder = app.isPackaged
    ? path.join(process.resourcesPath, 'drizzle')
    : path.join(process.cwd(), 'drizzle');
  migrate(db, { migrationsFolder });
}
