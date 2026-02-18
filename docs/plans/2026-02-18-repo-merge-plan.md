# Merge Plan: Reconcile Local flusk/ with GitHub mbenhard/untask

**Status:** Reviewed & Corrected (2026-02-18)
**Resolves:** Community Readiness Audit tasks #1 (onboarding), #2 (release workflow), #4 (dead dependency), #16 (update notifier)

## Goal
Merge the diverged local development (`~/Development/untitled/flusk/`) with the GitHub repo (`mbenhard/untask`) so that **all features from both sides are preserved** and the GitHub repo becomes the single source of truth going forward.

## Strategy
Work on a fresh clone of the GitHub repo. Copy local-only changes in, restore GitHub-only features that were deleted locally, and merge files that diverged on both sides.

---

## Phase 0: Safety Net
**Create a clean working copy and baseline commit**

1. Clone GitHub repo fresh:
   ```bash
   gh repo clone mbenhard/untask /tmp/untask-merge
   cd /tmp/untask-merge
   git checkout -b merge/reconcile-local-dev
   ```

2. Copy ALL local source files into the clone (preserving directory structure):
   ```bash
   rsync -av --exclude='node_modules' --exclude='.vite' --exclude='out' \
     --exclude='.git' --exclude='.github' --exclude='README.md' \
     --exclude='CONTRIBUTING.md' --exclude='CODE_OF_CONDUCT.md' \
     --exclude='SECURITY.md' --exclude='LICENSE' \
     ~/Development/untitled/flusk/ /tmp/untask-merge/
   ```
   **Note**: This overwrites diverged files with local versions and adds local-only files. It does NOT delete GitHub-only files (rsync without `--delete` preserves destination-only files). So GitHub-only files like `keyStorage.ts`, `providers/`, `onboarding/`, and `updateChecker.ts` survive this step — but will have been overwritten where both sides had the same file.

   **Important**: Files that exist ONLY on GitHub (like `ThreadDropdown.tsx`) will NOT be deleted by this rsync. They survive and must be explicitly cleaned up later (Phase 7a).

3. Commit this as a raw baseline (so we can see the diff of what local changed):
   ```bash
   git add -A && git commit -m "chore: raw import of local development state"
   ```

**Checkpoint**: `git diff HEAD~1..HEAD` shows everything local added/changed/deleted. GitHub-only files should still be present.

---

## Implementation Note: How "Restore" Works

After Phase 0, we have two commits on the merge branch:
1. `HEAD~1` = GitHub's original state (all GitHub-only files intact)
2. `HEAD` = Local state overlaid (GitHub-only files that DON'T exist locally survive; files on BOTH sides are overwritten with local versions)

To "restore" a file from GitHub means:
```bash
git checkout HEAD~1 -- path/to/file   # Get GitHub's version
```

To "merge" a file means manually combining content from both `HEAD~1` (GitHub) and `HEAD` (local).

---

## Phase 1: Critical Build Configs
**Restore configs that will break packaging if missing**

### 1a. forge.config.ts — Restore native module ignore function AND security fuses
- The GitHub version has a custom `ignore` function that includes `better-sqlite3`, `bindings`, and `file-uri-to-path` in the ASAR
- The GitHub version also has `FusesPlugin` with security fuses (`RunAsNode: false`, `OnlyLoadAppFromAsar: true`, etc.)
- The local version is missing BOTH — packaging will produce a broken and less secure app
- **Action**: Take GitHub version's `packagerConfig.ignore` function AND `FusesPlugin` configuration and merge them into the local forge.config.ts (which may have other local changes like maker configs)

### 1b. .npmrc — Add symlink=false
- GitHub: `node-linker=hoisted` + `symlink=false`
- Local: only `node-linker=hoisted`
- **Action**: Add `symlink=false` line

### 1c. index.html — Merge both sides
- GitHub has correct title "Untask" but older CSP (no `img-src` directive)
- Local has correct CSP (`img-src 'self' untask-file: data:`) but wrong title "Flusk"
- **Action**: Take local CSP + fix title to "Untask"

### 1d. .gitignore — Merge patterns
- GitHub has ~116 lines (comprehensive: coverage, OS files, IDE files, SQLite WAL/SHM)
- Local has ~30 patterns (basics + .vite/out/dev.db)
- **Action**: Restore GitHub's version, then add any local-only patterns not already covered

### 1e. package.json — Reconcile dependencies
- **Add back**: `@ai-sdk/anthropic` (`^3.0.45` — present on GitHub, missing locally; needed for provider abstraction)
- **Remove**: `@extractus/article-extractor` (present locally but never imported anywhere — dead dependency that doesn't exist on GitHub)
- **Keep**: all local-only additions (they're real new features)
- **Merge**: scripts, version, etc. (local is more current)

**Checkpoint**: Run `pnpm install && pnpm typecheck` to verify configs are valid.

---

## Phase 2: Restore GitHub-Only Backend Services
**These files exist on GitHub but were deleted locally — restore them**

### 2a. Key Storage (src/main/services/keyStorage.ts)
- Uses Electron `safeStorage` for macOS Keychain integration
- Stores API keys securely instead of plaintext in SQLite
- Includes `migrateApiKeysToSafeStorage()` — one-time migration from plaintext to encrypted storage (must be wired into main/index.ts in Phase 6)
- **Action**: Restore from GitHub (`git checkout HEAD~1 -- src/main/services/keyStorage.ts`), verify it compiles with current Electron types

### 2b. Provider Abstraction (src/main/ai/providers/)
- Local has only `types.ts` stub (single line: `export type ProviderType = ...`) — all provider files were deleted
- GitHub has the full set:
  - `index.ts` — Factory: `getActiveProvider()`, `createProviderInstance()`, `getActiveLanguageModel()`
  - `types.ts` — `ProviderConfig`, `ProviderInstance`, `ProviderType` types
  - `openai.ts` — OpenAI provider
  - `anthropic.ts` — Anthropic provider (needs @ai-sdk/anthropic)
  - `ollama.ts` — Ollama local provider
  - `openrouter.ts` — OpenRouter provider
- Local also has a flat `src/main/ai/openrouter.ts` (~45 lines) with `resolveOpenRouterApiKey()` and `createOpenRouterProvider()` — simpler key resolution (env var + settings) vs GitHub's centralized keyStorage approach
- **Action**: Restore all provider files from GitHub (`git checkout HEAD~1 -- src/main/ai/providers/`). GitHub's `providers/index.ts` uses centralized keyStorage for key resolution, which supersedes the local flat file's approach. The flat `src/main/ai/openrouter.ts` will be deleted in Phase 7a.
- **Critical dependency**: `providers/index.ts` imports from `keyStorage.ts` — Phase 2a must be done first.

### 2c. Settings Service & Default Settings
- `settingsService.ts` exists on BOTH sides:
  - Local: bare-bones CRUD (getSetting, setSetting, deleteSetting, getAllSettings)
  - GitHub: adds `getSettingWithDefault()`, `isBootstrapCompleted()`, `markBootstrapCompleted()`, `isAiEnabled()`, `setAiEnabled()`
- `defaultSettings.ts` at `src/main/defaultSettings.ts` (NOT in `services/`) exists on BOTH sides:
  - Local: 3 constants only (`SETTING_KEY_AI_MODEL`, `SETTING_KEY_AI_PROVIDER`, `SETTING_KEY_AI_ENABLED`)
  - GitHub: 21 constants + `DEFAULT_SETTINGS` record with defaults for bootstrap, AI provider, model, keyboard shortcuts, etc.
  - **WARNING**: After rsync, local's minimal 3-constant version has silently overwritten GitHub's rich version. This MUST be restored.
- **Action**: Restore GitHub's `defaultSettings.ts` (`git checkout HEAD~1 -- src/main/defaultSettings.ts`), then add any local-only setting keys. Restore GitHub's `settingsService.ts` (`git checkout HEAD~1 -- src/main/services/settingsService.ts`), then add any local-only CRUD methods if they differ.

### 2d. Update Checker (src/main/services/updateChecker.ts)
- Polls GitHub Releases API every 6 hours via `net.fetch`
- Semver comparison, respects `app.update_check_enabled` setting
- Does not exist locally at all
- **Action**: Restore from GitHub as-is (`git checkout HEAD~1 -- src/main/services/updateChecker.ts`)

### 2e. Backup API Key Sanitization
- GitHub version creates sanitized (API-key-free) copies of the database before export
- Local version does raw `copyFile` with no sanitization — API keys in `settings` table are included in plaintext
- **Action**: This is a MERGE, not a wholesale restore. Local's backupService may have different features (encryption changes, etc.). Surgically add GitHub's sanitization logic into local's version. Compare both with `git diff HEAD~1 HEAD -- src/main/services/backupService.ts`.

**Checkpoint**: `pnpm typecheck` — backend should compile.

---

## Phase 3: Restore GitHub-Only Renderer Components
**UI components that exist on GitHub but were deleted locally**

### 3a. Onboarding Flow (src/renderer/components/onboarding/)
- `OnboardingFlow.tsx` — 5-step controller
- `OnboardingWelcome.tsx` — Step 1
- `OnboardingBasics.tsx` — Step 2 (name + AI toggle)
- `OnboardingProvider.tsx` — Step 3 (API key setup)
- `OnboardingIdentity.tsx` — Step 4
- `OnboardingReady.tsx` — Step 5
- These files survived rsync (GitHub-only files aren't deleted)
- **Action**: Verify all 6 files are present in the working tree. They should already be there from GitHub. May need minor updates if settings API changed locally (but Phase 2c restores the full settingsService, so they should work).

### 3b. Thread Dropdown (src/renderer/components/chat/ThreadDropdown.tsx)
- GitHub has this, local replaced with ThreadListView.tsx (newer implementation)
- **CORRECTION**: rsync without `--delete` does NOT delete GitHub-only files. `ThreadDropdown.tsx` SURVIVES the rsync and will be in the working tree as a dead file.
- **Action**: No action in this phase — explicit deletion is handled in Phase 7a.

### 3c. Community Docs
- README.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md, LICENSE — these are already on GitHub
- They were excluded from rsync (they're repo-root level on GitHub)
- **Action**: No action needed — they're preserved in the clone

**Checkpoint**: All files exist. `pnpm typecheck` may still fail due to missing IPC wiring.

---

## Phase 4: IPC / Preload / Type Reconciliation
**Wire up restored features through the IPC boundary**

### 4a. Types (src/types/)
- Merge GitHub's IPC channel constants into local's `src/types/ipc.ts`:
  - `SETTINGS_GET_BOOTSTRAP_COMPLETED` (`settings:get-bootstrap-completed`)
  - `SETTINGS_MARK_BOOTSTRAP_COMPLETED` (`settings:mark-bootstrap-completed`)
- GitHub's types may have these; local deleted them
- Note: Key storage and update checker do NOT need dedicated IPC channels — they are main-process-internal services (keyStorage is called by providers/index.ts, updateChecker runs on a timer in main)
- **Action**: Compare `git diff HEAD~1 HEAD -- src/types/ipc.ts` and merge any missing channel constants and payload types from GitHub

### 4b. Preload (src/preload/index.ts)
- **CORRECTION**: GitHub's preload does NOT expose separate `keyStorage`, `updateChecker`, or `bootstrapCompleted` APIs. These services are main-process-internal.
- The bootstrap check in App.tsx goes through the existing `getBootstrapState` channel (already in local's preload)
- API key operations use existing `apiKeys.*` channels (already in local's preload)
- **Action**: Compare `git diff HEAD~1 HEAD -- src/preload/index.ts`. The local preload likely already has all needed channels. Add any missing bootstrap-related preload methods from GitHub if they exist, but do NOT invent new APIs.

### 4c. IPC Handlers (src/main/ipc.ts)
- **CORRECTION**: The `SETTINGS_GET_BOOTSTRAP_STATE` handler already EXISTS locally but is a stub that always returns `{ status: 'ready' }`. It must be UPDATED (not added) to actually call `isBootstrapCompleted()` from the restored settingsService.
- Add `SETTINGS_GET_BOOTSTRAP_COMPLETED` and `SETTINGS_MARK_BOOTSTRAP_COMPLETED` handlers if they exist on GitHub
- Keep all local-only handlers (attachments, dock mode, file context menu, etc.)
- **Action**: Compare `git diff HEAD~1 HEAD -- src/main/ipc.ts`. Update the bootstrap state handler. Add missing handlers from GitHub. Beware: do NOT duplicate-register channels — update existing stubs instead.

**Checkpoint**: `pnpm typecheck` should pass. All IPC channels wired.

---

## Phase 5: Merge Diverged Renderer Entry Points
**App.tsx and AppShell.tsx changed on both sides**

### 5a. App.tsx — Add onboarding gate
- GitHub: checks bootstrap state → shows OnboardingFlow or AppShell (imports OnboardingFlow, uses `BootstrapStatus` state: 'loading' | 'onboarding' | 'ready')
- Local: goes straight to AppShell (simple `<AppErrorBoundary><AppShell /></AppErrorBoundary>`)
- The bootstrap check calls `getBootstrapState()` via preload, which returns `{ completed: boolean }`
- **Action**: Restore the bootstrap gate from GitHub's App.tsx while keeping any local UI additions (error boundary, etc.)

### 5b. AppShell.tsx — Keep local version
- Local added: ThreadListView, dock mode toggle, new sidebar layout
- GitHub's version is older — local is the more current implementation
- **Action**: Keep local's AppShell.tsx as-is. No merge needed here since local is strictly ahead.

### 5c. Settings components
- Both sides modified settings UI
- **Action**: Keep local's settings (more current). Add "Update" section if GitHub had one. Ensure provider selection UI works with restored provider abstraction.

**Checkpoint**: App should launch. Test onboarding flow by resetting `bootstrap_completed` setting.

---

## Phase 6: Merge Main Process Bootstrap
**src/main/index.ts — the app entry point diverged**

- GitHub imports and wires:
  - `migrateApiKeysToSafeStorage` from `./services/keyStorage` — called during DB init
  - `startUpdateChecker` / `stopUpdateChecker` from `./services/updateChecker` — started after window ready, stopped on quit
  - `isBootstrapCompleted` / `isAiEnabled` from `./services/settingsService` — gates proactive AI loop
  - `requestSingleInstanceLock()` — prevents multiple app instances
- Local has:
  - Dock mode (`applyDockMode`)
  - Protocol handler (`registerAttachmentScheme`, `registerAttachmentProtocol`)
  - Attachment cleanup
  - New window management (`initSummonController`, `summonWindow`, `hideWindow`, `restoreWindowBounds`)
  - Tray setup
- **Action**: Merge both. Specifically:
  1. Add `import { migrateApiKeysToSafeStorage } from './services/keyStorage'` and call it after DB init
  2. Add `import { startUpdateChecker, stopUpdateChecker } from './services/updateChecker'` and wire lifecycle
  3. Add `requestSingleInstanceLock()` check (quit if lock not acquired)
  4. Gate proactive AI loop on `isAiEnabled()` if not already gated
  5. Keep ALL local additions

**Checkpoint**: App starts cleanly. No console errors in main process.

---

## Phase 7: Cleanup and Verification

### 7a. Remove dead files
- `src/main/ai/openrouter.ts` (replaced by providers/openrouter.ts)
- `src/main/ai/openrouter.test.ts` (test for the dead flat file)
- `src/renderer/components/chat/ThreadDropdown.tsx` (survived rsync, replaced by ThreadListView.tsx)
- `@extractus/article-extractor` from package.json AND from `vite.main.config.ts` external list
- Any other orphaned imports (run `pnpm typecheck` to find them)

### 7b. Full verification
```bash
pnpm typecheck          # All 3 tsconfigs pass
pnpm test               # All tests pass
pnpm start              # App launches, onboarding works
pnpm make               # Packaging succeeds (critical — tests native module inclusion)
```

### 7c. Manual testing checklist
- [ ] Fresh launch → onboarding flow appears
- [ ] Complete onboarding → app loads
- [ ] API key stored securely (check keychain)
- [ ] Provider switching works (OpenAI, Anthropic, OpenRouter, Ollama)
- [ ] Chat works with selected provider
- [ ] Dock mode toggle works
- [ ] File attachments work
- [ ] Bird mascot appears
- [ ] Keyboard shortcuts work
- [ ] Update checker runs without errors (check main process logs)
- [ ] DB backup creates valid sanitized file (no API keys in export)
- [ ] Single instance lock works (launching second instance focuses first)
- [ ] Packaged app (.zip) runs correctly

---

## Phase 8: Commit, Push, Future Workflow

### 8a. Commit the merge
```bash
cd /tmp/untask-merge
git add -A
git commit -m "feat: reconcile local development with GitHub repo

Restore: onboarding flow, provider abstraction, key storage, update checker, backup sanitization, security fuses
Add: dock mode, file attachments, bird mascot, thread list, keyboard shortcuts, single-instance lock
Fix: forge.config.ts native module packaging + fuses, .npmrc symlink=false, index.html title+CSP
Remove: dead @extractus/article-extractor, orphaned flat openrouter.ts, stale ThreadDropdown.tsx"
```

### 8b. Push and create PR
```bash
git push -u origin merge/reconcile-local-dev
gh pr create --title "Reconcile local development with GitHub repo" --body "..."
```

### 8c. After merge — switch to single-repo development
- Stop using local `~/Development/untitled/flusk/` as separate dev environment
- Develop directly in the GitHub clone going forward
- This prevents future drift

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Merge breaks packaging | Phase 1 fixes configs + fuses first; Phase 7 tests `pnpm make` |
| Type errors from restored code | Phased approach — typecheck after each phase |
| Onboarding references deleted APIs | Phase 4 wires IPC before Phase 5 integrates UI |
| Provider abstraction conflicts with local AI code | Phase 2 restores providers, Phase 5 adapts settings UI |
| Lost local work | Phase 0 commits raw baseline — can always `git diff` to recover |
| Bootstrap handler duplicate registration | Phase 4c updates existing stub, doesn't add new handler |
| defaultSettings.ts silently clobbered by rsync | Phase 2c explicitly restores GitHub's rich version |
| ThreadDropdown.tsx survives as dead file | Phase 7a explicitly deletes it |

## Estimated Complexity
- Phases 0-1: Straightforward file operations and config merging
- Phases 2-3: File restoration with minor adaptation
- Phase 4: Moderate — IPC reconciliation, but simpler than originally estimated (fewer new channels needed)
- Phases 5-6: Surgical merges of entry points
- Phases 7-8: Verification and cleanup

---

## Community Readiness Audit Tasks Resolved By This Merge

After this merge is complete, the following tasks from `2026-02-18-community-readiness-audit-design.md` are **done**:

| Audit Task | How Resolved |
|---|---|
| #1 Implement onboarding flow | Restored from GitHub (Phase 3a) — full 6-component flow |
| #2 Consolidate release workflow | Single-repo development on GitHub (Phase 8c) |
| #4 Remove @extractus/article-extractor | Cleaned up (Phase 7a) |
| #16 Update notifier | Restored from GitHub (Phase 2d) |

Remaining audit tasks (#3, #5-15, #17-19) should be executed on the merged codebase.
