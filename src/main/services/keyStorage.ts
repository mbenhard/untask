import { safeStorage } from 'electron';

import { deleteSetting, getSetting, setSetting } from './settingsService';

// ─── Key naming helpers ───────────────────────────────────────────────────────

const encryptedKey = (provider: string): string => `encrypted_ai_${provider}_key`;
const plaintextKey = (provider: string): string => `ai_${provider}_key`;

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
 * The encrypted value is stored as a base64 string in the SQLite settings
 * table under the key `encrypted_ai_{provider}_key`.
 *
 * If encryption is unavailable the key is stored as plaintext under
 * `ai_{provider}_key` with a console warning.
 */
export function storeApiKey(provider: string, key: string): void {
  if (!isEncryptionAvailable()) {
    // eslint-disable-next-line no-console
    console.warn(
      `[keyStorage] safeStorage encryption is not available on this platform. ` +
        `Storing API key for "${provider}" as plaintext. ` +
        `Consider running the app from a packaged binary for full keychain support.`,
    );
    setSetting(plaintextKey(provider), key);
    return;
  }

  try {
    const encrypted = safeStorage.encryptString(key);
    setSetting(encryptedKey(provider), encrypted.toString('base64'));
    // eslint-disable-next-line no-console
    console.info(`[keyStorage] Stored encrypted API key for "${provider}" successfully.`);
  } catch (err) {
    // safeStorage.encryptString can fail on some platforms — fall back to plaintext
    // eslint-disable-next-line no-console
    console.error(`[keyStorage] Failed to encrypt API key for "${provider}", falling back to plaintext:`, err);
    setSetting(plaintextKey(provider), key);
  }
}

/**
 * Retrieve and decrypt the API key for the given provider.
 * Returns null when no key has been stored.
 */
export function getApiKey(provider: string): string | null {
  // Try the encrypted slot first
  const encryptedBase64 = getSetting(encryptedKey(provider));

  if (encryptedBase64 !== null) {
    if (!isEncryptionAvailable()) {
      // Stored encrypted but can't decrypt — this should not happen in normal
      // use, but guard against it.
      // eslint-disable-next-line no-console
      console.warn(
        `[keyStorage] safeStorage is unavailable but an encrypted key exists for "${provider}". ` +
          `Cannot decrypt — returning null.`,
      );
      return null;
    }

    try {
      const buffer = Buffer.from(encryptedBase64, 'base64');
      return safeStorage.decryptString(buffer);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        `[keyStorage] Failed to decrypt API key for "${provider}":`,
        err,
      );
      // Fall through to plaintext slot as last resort
    }
  }

  // Fall back to plaintext slot (covers the no-encryption-available case
  // and the decryption-failure case)
  const plaintext = getSetting(plaintextKey(provider));
  if (plaintext !== null) {
    // eslint-disable-next-line no-console
    console.info(`[keyStorage] Using plaintext API key for "${provider}" (no encrypted slot or decryption failed).`);
  }
  return plaintext;
}

/**
 * Delete all stored keys (both encrypted and plaintext slots) for a provider.
 */
export function deleteApiKey(provider: string): void {
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
 * exists and the migration has not yet run, read it, encrypt it, write it back
 * under the encrypted slot, then delete the plaintext entry.
 *
 * This is intentionally idempotent — repeated calls after the first successful
 * run are no-ops.
 */
export function migrateApiKeysToSafeStorage(): void {
  if (getSetting(MIGRATION_FLAG_KEY) === 'true') {
    return;
  }

  const providers = ['openrouter'] as const;

  for (const provider of providers) {
    const legacyValue = getSetting(plaintextKey(provider));

    if (legacyValue !== null && legacyValue.trim().length > 0) {
      // eslint-disable-next-line no-console
      console.info(
        `[keyStorage] Migrating plaintext API key for "${provider}" to encrypted storage.`,
      );

      storeApiKey(provider, legacyValue);

      // Only delete the plaintext entry when we successfully persisted it to
      // the encrypted slot (storeApiKey wrote to encryptedKey(provider) when
      // encryption is available, or to plaintextKey(provider) otherwise — in
      // the latter case we keep the same entry and skip deletion).
      if (isEncryptionAvailable()) {
        deleteSetting(plaintextKey(provider));
      }
    }
  }

  setSetting(MIGRATION_FLAG_KEY, 'true');
}
