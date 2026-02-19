# Untask Refactoring Roadmap

## Baseline Metrics (2026-02-19)
- **Total source**: ~36,200 lines
- **Production code**: ~30,900 lines
- **Test code**: 5,328 lines (34 files)
- **Source files**: ~130 files

## Phase 1: DRY Utilities & IPC Decomposition (High Impact, Low Risk)

### 1.1 Extract shared `toErrorMessage()` utility
- **Files**: taskStore, notesStore, chatStore, searchStore, ai/chat.ts, ai/tools.ts, ipc.ts
- **Instances**: 6+ duplicates
- **Action**: Create `src/renderer/lib/errors.ts` and `src/main/lib/errors.ts`
- **Estimated savings**: ~30 lines

### 1.2 Create IPC handler wrapper to eliminate 77x try/catch boilerplate
- **File**: `src/main/ipc.ts`
- **Pattern**: Every handler has `try { ... } catch (e) { console.error('[ipc] XXX:', e); throw e; }`
- **Action**: Create `withIpcErrorLogging()` HOF, wrap all handlers
- **Estimated savings**: ~300+ lines

### 1.3 Split `ipc.ts` into domain modules
- **Current**: 1,563 lines in single file
- **Action**: Create `src/main/ipc/` directory with:
  - `index.ts` (barrel + registerAllHandlers)
  - `tasks.ts`, `chat.ts`, `notes.ts`, `settings.ts`, `backup.ts`, `attachments.ts`, `reminders.ts`, `app.ts`
  - `schemas.ts` (all Zod schemas)
  - `helpers.ts` (dialog helpers, handler wrapper)

### 1.4 Extract duplicate dialog helper
- **Instances**: 3x identical dialog opening pattern
- **Action**: Create `showDialogWithOwner()` in `ipc/helpers.ts`
- **Estimated savings**: ~20 lines

### 1.5 Consolidate API key validation
- **Instances**: 3 providers with near-identical validation logic
- **Action**: Data-driven `validateApiKey()` with provider config map
- **Estimated savings**: ~40 lines

### 1.6 Extract note state reset constant
- **File**: `notesStore.ts`
- **Instances**: 4x identical reset object
- **Action**: Extract `NOTES_LIST_RESET_STATE` constant
- **Estimated savings**: ~20 lines

### 1.7 Remove unused dependencies
- `react-day-picker`, `tw-animate-css`
- **Estimated savings**: ~50KB bundle size

## Phase 2: Store & Component Decomposition (Medium Risk)

### 2.1 Split `chatStore.ts` (1,537 lines) into domain slices
- `chatConversationSlice.ts` — conversations, archive, delete
- `chatStreamSlice.ts` — inFlightByRequestId, streaming state
- `chatMessageSlice.ts` — messages, steps, actionCards
- `chatSettingsSlice.ts` — autonomyMode, retentionMode, selectedModel
- Convert `applyStreamEvent` (416 lines) to handler map pattern

### 2.2 Decompose `SettingsMemory.tsx` (1,404 lines)
- Extract 6 tab components: `SettingsGeneralTab`, `SettingsAITab`, `SettingsMemoryTab`, `SettingsChatTab`, `SettingsShortcutsTab`, `SettingsBackupTab`
- Extract per-tab custom hooks to reduce 76 useState declarations
- Use component map for tab routing instead of 6x conditional rendering

### 2.3 Decompose `SettingsAI.tsx` (845 lines)
- Extract `ProviderSelector`, `ApiKeyManager`, `ModelCatalogView`

### 2.4 Split `useKeyboardShortcuts.ts` (249 lines)
- `useAppShortcuts()` — view nav, new task, theme
- `useChatShortcuts()` — overlay, undo
- `useSearchShortcuts()` — modal

## Phase 3: AI Module Decomposition (Medium-High Risk)

### 3.1 Split `ai/chat.ts` (1,297 lines)
- `ai/streamOrchestration.ts` — streaming + retry logic
- `ai/autoTitle.ts` — conversation auto-titling
- `ai/errorClassification.ts` — error classification + recovery

### 3.2 Split `ai/tools.ts` (1,047 lines)
- `ai/tools/index.ts` — registry + exports
- `ai/tools/taskTools.ts` — task mutations
- `ai/tools/noteTools.ts` — note operations
- `ai/tools/contextTools.ts` — data retrieval

### 3.3 Consolidate provider factory
- Data-driven provider creation map
- Unified key resolution function

## Phase 4: Cleanup & Polish

### 4.1 Remove type alias redundancy in `ipc.ts`
### 4.2 Add `.tsbuildinfo` to `.gitignore`
### 4.3 DRY up Vite aliases (vitest.config reuses vite.aliases.ts)
### 4.4 Fix memory layer enum mismatch (assistant.ts vs ipc.ts)

## Success Criteria
- Zero feature loss (all existing functionality preserved)
- All tests pass (`pnpm test`)
- Type checking passes (`pnpm typecheck`)
- Application starts and runs correctly (`npm run start`)
- Measurable reduction in total lines of code
- No new dependencies added

## Post-Refactoring Metrics (2026-02-19)
- **Total source**: ~35,200 lines (down from ~36,200)
- **Production code**: ~29,850 lines (down from ~30,900)
- **Source files**: ~198 files (up from ~130 — decomposition adds focused modules)
- **Net lines deleted**: ~1,000 production lines removed
- **Largest files eliminated**: ipc.ts (1,563), chatStore.ts (1,537), SettingsMemory.tsx (1,404), ai/chat.ts (1,297→155), ai/tools.ts (1,047→barrel)
- **Dead code removed**: SettingsMemory.tsx (1,404 lines — was not imported anywhere)
- **All 218 tests pass, 0 regressions, 0 new dependencies**

## Audit Trail
- [x] Phase 1 complete — toErrorMessage extracted, ipc.ts split into 12 domain modules, notesStore DRYed, config cleaned
- [x] Phase 2 complete — chatStore split into 6 slices with handler map pattern, SettingsMemory.tsx dead code removed, SettingsAI.tsx decomposed into 4 components
- [x] Phase 3 complete — ai/chat.ts split into 4 modules (chat, streamOrchestration, autoTitle, errorClassification), ai/tools.ts split into 6 modules (index, types, helpers, taskTools, noteTools, contextTools), provider factory assessed (already clean)
- [x] Phase 4 complete — MemoryLayer type dedup fixed, .tsbuildinfo already in .gitignore, Vite aliases DRYed, type alias redundancy resolved (old ipc.ts eliminated)
