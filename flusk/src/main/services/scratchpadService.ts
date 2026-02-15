import { eq } from 'drizzle-orm';

import { getDb } from '../db';
import { scratchpad, type Scratchpad } from '../db/schema';

const SCRATCHPAD_ID = 'main';

export function getScratchpad(): Scratchpad {
  const db = getDb();
  const [existing] = db.select().from(scratchpad).where(eq(scratchpad.id, SCRATCHPAD_ID)).all();

  if (existing) return existing;

  // Create default row on first access
  const [created] = db
    .insert(scratchpad)
    .values({ id: SCRATCHPAD_ID, content: '', updatedAt: new Date().toISOString() })
    .returning()
    .all();
  return created;
}

export function saveScratchpad(content: string): Scratchpad {
  const db = getDb();

  const [result] = db
    .insert(scratchpad)
    .values({ id: SCRATCHPAD_ID, content, updatedAt: new Date().toISOString() })
    .onConflictDoUpdate({
      target: scratchpad.id,
      set: { content, updatedAt: new Date().toISOString() },
    })
    .returning()
    .all();

  return result;
}
