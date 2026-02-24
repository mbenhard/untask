import { safeStorage } from 'electron';

import { deleteSetting, getSetting, setSetting } from './settingsService';

// ─── Key naming helpers ───────────────────────────────────────────────────────

const encryptedKey = (provider: string): string => `encrypted_ai_${provider}_key`;
const plaintextKey = (provider: string): string => `ai_${provider}_key`;

// ─── In-memory cache ────────────────────────────────────────────────────────
// Decrypted keys are cached so safeStorage.decryptString() (which hits the OS
// Keychain on macOS) is called at most once per provider per app session.
// The cache is invalidated on store and delete.
const keyCache = new Map<string, string>();

// ─── Core API ─────────────────────────────────────────────────────────────────

/**
 * Returns true when the OS-level encryption backend (macOS Keychain, Windows
 * DPAPI, etc.) is available. When false the implementation falls back to
 * plaintext storage and emits a warning.
 */
export function isEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}

/**
 * Encrypt and persist an API key for the given provider.
 *
 * When OS-level encryption is available (macOS Keychain), the key is stored
 * only in the encrypted slot and any legacy plaintext copy is removed.
 * Plaintext storage is used only as a last resort when encryption is
 * unavailable (e.g. unsigned dev builds without Keychain access).
 */
export function storeApiKey(provider: string, key: string): void {
  if (!isEncryptionAvailable()) {
    // eslint-disable-next-line no-console
    console.warn(
      `[keyStorage] safeStorage encryption is not available — stored "${provider}" key as plaintext only.`,
    );
    setSetting(plaintextKey(provider), key);
    keyCache.set(provider, key);
    return;
  }

  try {
    const encrypted = safeStorage.encryptString(key);
    setSetting(encryptedKey(provider), encrypted.toString('base64'));
    // Encryption succeeded — remove any legacy plaintext copy.
    deleteSetting(plaintextKey(provider));
    // Prime the cache so future reads never hit the Keychain.
    keyCache.set(provider, key);
  } catch (err) {
    // Encryption failed — fall back to plaintext as last resort.
    // eslint-disable-next-line no-console
    console.error(`[keyStorage] Failed to encrypt API key for "${provider}" — falling back to plaintext:`, err);
    setSetting(plaintextKey(provider), key);
    keyCache.set(provider, key);
  }
}

/**
 * Retrieve and decrypt the API key for the given provider.
 * Returns null when no key has been stored or when decryption fails
 * (the user will need to re-enter the key).
 *
 * Decrypted values are cached in memory so the OS Keychain is only
 * accessed once per provider per app session.
 */
export function getApiKey(provider: string): string | null {
  const cached = keyCache.get(provider);
  if (cached !== undefined) return cached;

  // Try the encrypted slot first.
  const encryptedBase64 = getSetting(encryptedKey(provider));

  if (encryptedBase64 !== null) {
    if (!isEncryptionAvailable()) {
      // Encryption backend unavailable — cannot decrypt. Return null so the
      // user is prompted to re-enter rather than silently falling back.
      // eslint-disable-next-line no-console
      console.warn(
        `[keyStorage] safeStorage unavailable — cannot decrypt "${provider}" key. Please re-enter in Settings.`,
      );
      return null;
    }

    try {
      const buffer = Buffer.from(encryptedBase64, 'base64');
      const decrypted = safeStorage.decryptString(buffer);
      if (decrypted.length > 0) {
        keyCache.set(provider, decrypted);
        return decrypted;
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[keyStorage] Failed to decrypt "${provider}" key:`, err);
    }

    // Encrypted slot exists but decryption failed — return null rather than
    // falling back to plaintext.
    return null;
  }

  // No encrypted slot — check for legacy plaintext key (pre-migration or
  // environments where encryption was never available).
  const plaintext = getSetting(plaintextKey(provider));
  if (plaintext !== null) {
    keyCache.set(provider, plaintext);
  }
  return plaintext;
}

/**
 * Delete all stored keys (both encrypted and plaintext slots) for a provider.
 */
export function deleteApiKey(provider: string): void {
  keyCache.delete(provider);
  deleteSetting(encryptedKey(provider));
  deleteSetting(plaintextKey(provider));
}

/**
 * Returns true if a key is stored for the given provider (either encrypted or
 * plaintext). Does not return the key itself.
 */
export function hasApiKey(provider: string): boolean {
  return (
    getSetting(encryptedKey(provider)) !== null ||
    getSetting(plaintextKey(provider)) !== null
  );
}

// ─── Migration ────────────────────────────────────────────────────────────────

const MIGRATION_FLAG_KEY = 'api_key_migration_done';

/**
 * One-time migration: if the legacy plaintext `ai_openrouter_key` setting
 * exists and the migration has not yet run, re-store it through `storeApiKey`
 * which will add an encrypted copy (when available) alongside the plaintext.
 *
 * This is intentionally idempotent — repeated calls after the first successful
 * run are no-ops.
 */
export function migrateApiKeysToSafeStorage(): void {
  if (getSetting(MIGRATION_FLAG_KEY) === 'true') {
    return;
  }

  const providers = ['openrouter', 'openai', 'anthropic'] as const;

  for (const provider of providers) {
    const legacyValue = getSetting(plaintextKey(provider));

    if (legacyValue !== null && legacyValue.trim().length > 0) {
      // eslint-disable-next-line no-console
      console.info(
        `[keyStorage] Migrating plaintext API key for "${provider}" to encrypted storage.`,
      );

      // storeApiKey will encrypt, remove the plaintext slot, and prime the
      // in-memory cache when encryption is available.
      storeApiKey(provider, legacyValue);
    }
  }

  setSetting(MIGRATION_FLAG_KEY, 'true');
}
