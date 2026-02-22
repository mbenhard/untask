# Untask Security Audit — 2026-02-22

## Executive Summary

The codebase demonstrates strong security awareness: Electron fuses correctly configured, context isolation and sandboxing enabled, IPC validation with Zod schemas, path traversal protection on protocol handler. However, two findings require immediate attention.

**Finding breakdown:** 1 CRITICAL, 1 HIGH, 5 MEDIUM, 4 LOW

---

## Threat Model

Local-first, single-user macOS app. No web server. Renderer loads only local content. Network requests limited to AI provider APIs and GitHub update checker. Primary attack surfaces: local data exposure, AI prompt injection, renderer compromise via dependency vulnerability.

---

## Findings

### CRITICAL

**5.1: Plaintext API keys always stored in SQLite** — FIXED
- `keyStorage.ts:30-49` — `storeApiKey()` unconditionally writes raw API key to `settings` table before checking encryption availability. Encrypted copy stored alongside as secondary slot, but plaintext never removed. Any process with filesystem access can extract keys: `sqlite3 ~/Library/Application\ Support/Untask/untask.db "SELECT value FROM settings WHERE key LIKE 'ai_%_key'"`
- **Fix:** When `safeStorage.isEncryptionAvailable()`, only store encrypted version. Delete plaintext slot after successful encryption. On retrieval failure, return null and prompt re-entry rather than falling back to plaintext.
- **Resolution:** `storeApiKey()` now only writes plaintext when encryption is unavailable. Plaintext slot deleted after successful encryption. `getApiKey()` returns null (not plaintext fallback) when encrypted slot exists but decryption fails. Migration expanded to cover all 3 providers.

### HIGH

**10.1: `SHELL_OPEN_EXTERNAL` accepts arbitrary URLs without scheme validation** — FIXED
- `ipc/app.ts:297-305` — Passes any URL from renderer directly to `shell.openExternal`. Can open `file:///`, `ssh://`, custom schemes. A compromised renderer could launch local executables.
- **Fix:** Validate URL scheme, restrict to `https:` and `http:` only.
- **Resolution:** Added URL parsing + scheme validation. Rejects non-http(s) schemes with descriptive error.

### MEDIUM

**2.1: SETTINGS_GET/SET accept arbitrary keys — can leak API keys via IPC** — FIXED
- `preload/index.ts:359-361` — Renderer can read any setting key including `ai_openai_key` (plaintext API keys).
- **Fix:** Add blocklist rejecting keys matching `ai_*_key` and `encrypted_ai_*` patterns.
- **Resolution:** Added `isSensitiveKey()` guard to `SETTINGS_GET` (returns null), `SETTINGS_SET` (throws), and `SETTINGS_GET_ALL` (filters out matching rows).

**3.2: Backup import/export accept arbitrary filesystem paths** — FIXED
- `ipc/backup.ts:120-148` — Programmatic handlers accept any path. Compromised renderer could export DB to `/tmp/exfil.db`.
- **Fix:** Remove non-dialog handlers from preload, or restrict to known safe directories.
- **Resolution:** Added `assertImportPathSafe()` (restricts to app backup directory via realpath) and `assertExportPathSafe()` (restricts to Documents/Downloads/Desktop). Dialog handlers remain unrestricted since the user picks the path.

**4.1: User content in AI system prompt without structural delimiters** — FIXED
- `systemPrompt.ts:104-174` — Task titles, identity, knowledge injected with only markdown `---` separators. Particularly relevant since titles can come from Apple Reminders sync.
- **Fix:** Wrap user content in XML-style delimiters (`<user_tasks>`, `<user_identity>`).
- **Resolution:** Added `<user_identity>`, `<user_knowledge>`, and `<user_tasks>` XML delimiters around user-editable sections in the compiled system prompt.

**6.1: CSP allows `'unsafe-inline'` for scripts** — FIXED
- `index.html:7` — Needed for inline theme-detection script but weakens XSS protection.
- **Fix:** Move theme script to separate file, remove `'unsafe-inline'`.
- **Resolution:** Moved inline theme detection to `public/theme-init.js`. Removed `'unsafe-inline'` from `script-src` in both `index.html` and `quick-add.html`. Added explicit `connect-src 'self'`, `object-src 'none'`, `frame-src 'none'` directives.

**9.1: Ad-hoc code signing, no developer certificate**
- `forge.config.ts:41-54` — `codesign --sign -` creates valid signature but no trust chain.
- **Fix:** Sign with Apple Developer certificate. Consider notarization.

**11.1: 11 known CVEs in build-time dependencies**
- `tar` (4 HIGH), `minimatch` (3 HIGH), `esbuild` (MODERATE), `ajv` (MODERATE). All build-time only.
- **Fix:** Update `@electron-forge/cli` and `vite`.

### LOW

**2.2: Several task handlers lack Zod input validation** — `TASK_LIST`, `TASK_TOGGLE_TODAY`, `TASK_CANCEL`, `TASK_REOPEN`, `TASK_SET_STATUSES` accept raw input. Drizzle prevents SQL injection.

**4.2: Note context passed to AI without structural separation** — User-authored only, not imported from external sources.

**5.3: Environment variable fallback for OpenRouter key** — `process.env.OPENROUTER_API_KEY` takes precedence. Dev convenience, minimal risk.

**12.1: No macOS App Sandbox** — Amplifies local data exposure. Adding sandbox requires careful entitlement configuration.

**12.2: Ollama base URL user-configurable without loopback validation** — Could be pointed at malicious server. Add warning for non-localhost URLs.

---

## Positive Findings

- BrowserWindow `webPreferences` correctly hardened (contextIsolation, sandbox, no nodeIntegration)
- Electron Fuses all correctly set (RunAsNode: false, OnlyLoadAppFromAsar: true, etc.)
- Navigation and window-open handlers properly prevent external navigation
- Attachment protocol handler has path traversal protection via `path.basename()`
- Backup export correctly strips API keys via `writeSanitizedDbCopy`
- BlockNote stores content as JSON, no `dangerouslySetInnerHTML` in app code
- Custom protocol properly scoped (secure: true, corsEnabled: false)

---

## Priority Actions

1. **Stop storing plaintext API keys** when safeStorage available (5.1)
2. **Validate URL schemes** in SHELL_OPEN_EXTERNAL (10.1)
3. **Blocklist sensitive settings keys** from renderer access (2.1)
4. **Remove `'unsafe-inline'`** from CSP script-src (6.1)
5. **Add structural delimiters** around user content in system prompt (4.1)
