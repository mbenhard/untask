# Scratchpad, Search, and Settings (Task 10) Design

## Objective
Task 10 will be delivered as a two-phase plan optimized for a 2-day window, with Phase A intended to land as production-usable and Phase B explicitly staged as follow-up within the same task track. The primary objective is to close the remaining core user workflows that sit between task execution and assistant leverage: scratch capture (`Cmd+N`), reliable task retrieval (full-text search), and a unified settings shell that consolidates existing memory controls with broader app/AI configuration. Phase A scope includes: a plain-text markdown scratchpad panel with autosave and "Send to AI," SQLite FTS5-backed task search across active and completed items, and a tabbed settings shell that absorbs the existing memory panel and exposes currently available controls (General, AI, Memory, Chat) behind typed IPC boundaries. Phase A also explicitly defines persistence boundaries: DB-backed settings for launch-at-login/model/autonomy/retention/memory, localStorage for theme override, and environment-managed OpenRouter API key.

## Scope
Phase A (2-day target):
- Scratchpad panel: open/close UX, autosave, and send-to-AI handoff.
- Search modal: FTS5-backed search on tasks title/body/client with grouped results.
- Settings shell: tabbed container integrating existing memory editor and current app/AI/chat controls.
- Persistence boundary (explicit):
  - DB-backed in Phase A: `app.launchAtLogin`, `ai_selected_model`, `ai_autonomy_mode`, chat retention mode, and assistant memory keys.
  - Local-only in Phase A: theme override via existing `flusk-theme` localStorage key.
  - Env-only in Phase A: OpenRouter API key via `OPENROUTER_API_KEY` (no settings-table mutation in this phase).
- Typed IPC/preload/store wiring needed for above.

Phase B (follow-up in same task track):
- Backup system: daily snapshots, keep-30 retention, export/import, optional passphrase encryption.
- OpenRouter API key settings flow (main-process read/write to settings, renderer mask-only input, no plaintext logging).
- Optional theme persistence migration from localStorage to settings table (only if Phase A is fully accepted and time remains).
- Shortcut configuration surface and persistence model.
- Hardening pass for edge cases and UX polish.

## Non-Goals
- Full visual redesign beyond existing monochrome baseline and current component system.
- Replacing existing chat/task architecture or autonomy workflows.
- Cross-platform parity for every OS-level behavior in this slice.
- Implementing additional AI tools beyond wiring scratchpad send flow to existing chat/tool path.
- Moving all pre-existing local renderer preferences to DB in Phase A.

## Constraints
- Main process remains owner of DB/filesystem/OS integrations (backup, login item, shortcut registration).
- Renderer must use preload APIs only; no direct Electron/Node access.
- IPC remains domain-first and typed; write inputs are zod-validated.
- Task mutation logging/audit semantics (`task_events`) must remain intact.
- Keep changes incremental and scoped to Task 10 surfaces; avoid unrelated refactors.
- Verification baseline (`npm run lint`, `npm run typecheck`, `npm run test`) must remain passing after each batch.

## Architecture
Phase A architecture keeps the current split intact: main process owns persistence and system integration; renderer owns interaction state and presentation; preload remains the only bridge. We add three domain modules in main: `scratchpad` application service (existing CRUD + send-intent glue), `search` service with SQLite FTS5 virtual table management, and `settings` composition service to aggregate currently scattered app/AI/chat settings into one query/update surface. Renderer gets three new feature surfaces: `ScratchpadPanel`, `SearchModal`, and a new `SettingsShell` that wraps `SettingsMemory` as a Memory tab while adding General/AI/Chat tabs from already available APIs.

## Components and Interfaces
Key interfaces (Phase A):
- `search:query` IPC: input `{ query: string, limit?: number }`, output grouped result payload with `active` and `done` arrays plus snippet metadata.
- `scratchpad:send-to-ai` is not a new write tool; renderer maps scratchpad content into `chat.send` with deterministic prompt framing and then navigates to chat mode.
- `settings:get-snapshot` and focused mutation channels (or reuse existing specific channels) return typed values for launch-at-login, model selection, autonomy mode, and retention.
- `appStore` extends from memory-overlay booleans to unified overlay states (`scratchpad`, `search`, `settings`) with single-layer escape ordering.
- AI settings in Phase A include model/autonomy/retention only; API key is exposed as an environment prerequisite notice.

Phase B extends architecture with `backupService` in main (`backup:list`, `backup:export`, `backup:import`, scheduled auto backup), `shortcuts` settings contract for remappable keybinds, and API-key settings channels (main-only storage/read path). This sequencing avoids mixing cryptographic/filesystem risk into the 2-day Phase A path while still designing interfaces that won’t require rewrites when backup and shortcut customization are added.

## Data Flow
Scratchpad flow (Phase A): user opens panel via `Cmd+N` or UI trigger, renderer loads persisted content through existing `scratchpad:get`, edits locally, and auto-saves on blur/close via `scratchpad:save`. "Send to AI" does not bypass chat orchestration; renderer constructs a deterministic message wrapper around scratchpad content and calls `chat.send`, then shifts to chat mode so the user sees parse results/action cards in the existing stream pipeline. This preserves one authoritative AI execution path and existing audit behavior.

Search flow: on `Cmd+F`, renderer opens `SearchModal`, debounces query input, and calls `search:query`. Main executes FTS5 `MATCH` against a `tasks_fts` virtual table synced from `tasks` with insert/update/delete triggers. Results are post-processed into two ordered groups (`active`, `done`) and returned with minimal snippet metadata for highlighting. Selecting a result closes modal, updates active view if needed, and selects the task in store.

Settings flow: opening settings uses one aggregate loader (`settings:get-snapshot`) or batched current APIs to hydrate tabs. Each tab persists through focused typed mutations (launch-at-login, model/autonomy, retention, memory fields), with optimistic UI only where rollback is deterministic. Theme writes remain localStorage-backed in Phase A through `ThemeProvider`; AI key configuration remains env-backed and surfaced as prerequisite state, not editable settings data until Phase B.

## Error Handling
If FTS migration/init fails, app degrades to no-results with explicit error banner and logs scoped main-process error; it must not crash task flows. Scratchpad save failure keeps dirty local state and surfaces retry messaging. Chat send failure from scratchpad preserves content and keeps panel open. Settings write failure reverts local toggle/select state and shows inline error. Any malformed payloads remain rejected by zod at IPC boundary.

## Testing Strategy
Testing strategy is split by determinism. Automated tests cover deterministic units and contracts: FTS query builder/result grouping, scratchpad autosave/send intent handlers, settings snapshot mapping, and IPC payload validation for new channels. Integration-level renderer tests cover overlay state transitions (`scratchpad`/`search`/`settings`) and escape-layer ordering to prevent regressions with existing chat/memory flows. Main-process tests verify that search gracefully handles missing/uninitialized FTS artifacts and that settings mutations preserve current behaviors for launch-at-login, model selection, autonomy mode, and retention. Manual QA covers the user-facing matrix: `Cmd+N` open/edit/close persistence, "Send to AI" handoff into chat with parse action cards, `Cmd+F` search relevance/group ordering/navigation, and settings tab persistence after app restart. Phase B adds backup-specific failure-path QA (wrong passphrase, corrupted import, retention pruning) and filesystem safety checks.

## Risks and Mitigations
Primary risks:
- Scope coupling risk: scratchpad/search/settings shell can sprawl into full settings redesign.
  Mitigation: hard-cut Phase A to existing APIs + memory-panel integration; defer backup/shortcut customization.
- Data consistency risk in FTS: stale search index after task mutations.
  Mitigation: trigger-based sync plus one-time rebuild command and startup integrity check.
- UX regression risk in keyboard/escape handling due to multiple overlays.
  Mitigation: centralized overlay stack model in app store and explicit shortcut precedence tests.
- Operational risk for backup encryption (Phase B).
  Mitigation: isolated module, authenticated encryption (AES-GCM), and mandatory safety backup before restore.

## Open Questions
None blocking Phase A. Assumptions carried forward: Phase B remains within Task 10 but can complete in a follow-up batch after Phase A acceptance; API key input is intentionally deferred to Phase B while model/autonomy/retention ship in Phase A.
