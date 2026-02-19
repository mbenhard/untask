import { eq } from 'drizzle-orm';

import { getDb } from '../db';
import { settings, type Setting } from '../db/schema';
import { DEFAULT_SETTINGS, SETTING_KEY_APP_BOOTSTRAP_COMPLETED, SETTING_KEY_AI_ENABLED } from '../defaultSettings';

const BOOTSTRAP_COMPLETED_KEY = SETTING_KEY_APP_BOOTSTRAP_COMPLETED;

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

/**
 * Returns the persisted setting value, falling back to the centralized default
 * from `DEFAULT_SETTINGS` if the key has not been explicitly set.
 * Returns `null` only when neither a persisted value nor a default exists.
 */
export function getSettingWithDefault(key: string): string | null {
  const persisted = getSetting(key);
  if (persisted !== null) {
    return persisted;
  }
  return DEFAULT_SETTINGS[key] ?? null;
}

// ─── Bootstrap flag helpers ──────────────────────────────────

/**
 * Returns true if the app has completed its initial bootstrap / onboarding.
 * Reads the `app.bootstrap_completed` setting from the database.
 */
export function isBootstrapCompleted(): boolean {
  return getSetting(BOOTSTRAP_COMPLETED_KEY) === 'true';
}

/**
 * Marks the app bootstrap as completed.
 * Call this after onboarding is finished so the flag is persisted across restarts.
 */
export function markBootstrapCompleted(): void {
  setSetting(BOOTSTRAP_COMPLETED_KEY, 'true');
}

// ─── AI enabled flag helpers ─────────────────────────────────

/**
 * Returns true if AI features are enabled.
 * Defaults to true for existing users who have never set this key.
 */
export function isAiEnabled(): boolean {
  const stored = getSetting(SETTING_KEY_AI_ENABLED);
  // Null means never set — default to true (existing users keep current behavior).
  if (stored === null) return true;
  return stored === 'true';
}

/**
 * Persists the AI enabled state.
 */
export function setAiEnabled(enabled: boolean): void {
  setSetting(SETTING_KEY_AI_ENABLED, String(enabled));
}

