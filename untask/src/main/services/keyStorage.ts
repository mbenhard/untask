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
 *
 * The key is **always** stored in the plaintext slot (`ai_{provider}_key`) so
 * retrieval can never fail due to Keychain issues.  When OS-level encryption
 * is available the key is *also* stored encrypted under
 * `encrypted_ai_{provider}_key`; `getApiKey` will prefer the encrypted slot
 * and fall back to plaintext automatically.
 */
export function storeApiKey(provider: string, key: string): void {
  // Always persist plaintext so the key is retrievable regardless of Keychain state.
  setSetting(plaintextKey(provider), key);

  if (!isEncryptionAvailable()) {
    // eslint-disable-next-line no-console
    console.warn(
      `[keyStorage] safeStorage encryption is not available — stored "${provider}" key as plaintext only.`,
    );
    return;
  }

  try {
    const encrypted = safeStorage.encryptString(key);
    setSetting(encryptedKey(provider), encrypted.toString('base64'));
  } catch (err) {
    // Encryption failed but plaintext was already persisted — log and move on.
    // eslint-disable-next-line no-console
    console.error(`[keyStorage] Failed to encrypt API key for "${provider}" (plaintext fallback in use):`, err);
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
      // Encryption backend unavailable (e.g. Keychain auth failed for unsigned
      // builds) — fall through to plaintext instead of returning null.
      // eslint-disable-next-line no-console
      console.warn(
        `[keyStorage] safeStorage unavailable for "${provider}" — falling through to plaintext.`,
      );
    } else {
      try {
        const buffer = Buffer.from(encryptedBase64, 'base64');
        const decrypted = safeStorage.decryptString(buffer);
        if (decrypted.length > 0) {
          return decrypted;
        }
        // Decrypted to empty string — fall through to plaintext
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[keyStorage] Failed to decrypt "${provider}" key:`, err);
        // Fall through to plaintext slot as last resort
      }
    }
  }

  // Fall back to plaintext slot (covers: no encrypted slot, encryption
  // unavailable, decryption failure, or decrypted-to-empty-string).
  return getSetting(plaintextKey(provider));
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

  const providers = ['openrouter'] as const;

  for (const provider of providers) {
    const legacyValue = getSetting(plaintextKey(provider));

    if (legacyValue !== null && legacyValue.trim().length > 0) {
      // eslint-disable-next-line no-console
      console.info(
        `[keyStorage] Migrating plaintext API key for "${provider}" to encrypted storage.`,
      );

      // storeApiKey now always keeps the plaintext slot as a reliable
      // fallback, so we just call it and let it handle both slots.
      storeApiKey(provider, legacyValue);
    }
  }

  setSetting(MIGRATION_FLAG_KEY, 'true');
}
