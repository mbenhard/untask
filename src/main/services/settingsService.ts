import { eq } from 'drizzle-orm';

import { getDb } from '../db';
import { settings, type Setting } from '../db/schema';

export function getSetting(key: string): string | null {
  const db = getDb();
  const [row] = db.select().from(settings).where(eq(settings.key, key)).all();
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): Setting {
  const db = getDb();
  const [result] = db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value },
    })
    .returning()
    .all();
  return result;
}

export function deleteSetting(key: string): void {
  const db = getDb();
  db.delete(settings).where(eq(settings.key, key)).run();
}

export function getAllSettings(): Setting[] {
  const db = getDb();
  return db.select().from(settings).all();
}
