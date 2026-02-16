# Implementation Review

## Plan Path

docs/plans/2026-02-15-menu-bar-shortcuts-execution-plan.md

## Traceability Summary

| Task | Status | Code Evidence | Notes |
| --- | --- | --- | --- |
| 1. Verification command strategy + harness | implemented | `flusk/package.json`, `flusk/vitest.config.ts` | `lint`, `typecheck`, and `test` scripts are present and runnable. |
| 2. Typed app/window contracts | implemented | `flusk/src/types/ipc.ts`, `flusk/src/preload/index.ts`, `flusk/src/types/preload.d.ts`, `flusk/src/main/ipc.ts` | `app:*` channels are wired through main/preload/types, with write payload validation added for launch-at-login. |
| 3. Hidden-at-launch summon baseline | implemented | `flusk/src/main/index.ts` | Startup no longer auto-summons; window stays hidden until summon path. |
| 4. Summon controller + bounds persistence | implemented | `flusk/src/main/window/summonController.ts`, `flusk/src/main/window/bounds.ts` | First summon resolves centered/restored bounds; move/resize persistence and blur-hide suppression are present. |
| 5. Tray assets + path validation | implemented | `flusk/assets/tray/trayTemplate.png`, `flusk/assets/tray/trayTemplate@2x.png`, `flusk/src/main/window/trayIcon.ts`, `flusk/forge.config.ts` | Dev and packaged path resolution implemented with extraResource packaging. |
| 6. Tray manager + Today badge updates | implemented | `flusk/src/main/tray.ts`, `flusk/src/main/ipc.ts` | Tray initializes on macOS and badge refreshes on relevant task mutations. |
| 7. Global shortcuts for toggle + quick add | implemented | `flusk/src/main/shortcuts.ts` | Both accelerators are registered and conflict failures are logged. |
| 8. Clipboard quick-add + renderer prefill | implemented | `flusk/src/main/clipboard.ts`, `flusk/src/main/window/summonController.ts`, `flusk/src/renderer/hooks/useQuickAddListener.ts`, `flusk/src/renderer/components/layout/AppShell.tsx` | Quick-add path sends typed payload and now clears prefill when clipboard is empty/error. |
| 9. Layered Escape + click-outside hide | implemented | `flusk/src/renderer/hooks/useKeyboardShortcuts.ts`, `flusk/src/main/window/summonController.ts`, `flusk/src/main/ipc.ts` | Escape layer order and renderer-to-main hide handoff implemented; blur click-outside hide present. |
| 10. Launch-at-login + single-instance lifecycle | implemented | `flusk/src/main/index.ts`, `flusk/src/main/ipc.ts`, `flusk/src/preload/index.ts`, `flusk/src/types/preload.d.ts`, `flusk/src/renderer/components/settings/SettingsMemory.tsx` | Lifecycle handling and renderer settings toggle are both wired through typed IPC. |
| 11. Targeted tests + verification checklist | partial | `flusk/src/main/clipboard.test.ts`, `flusk/src/main/shortcuts.test.ts`, `flusk/src/main/window/bounds.test.ts`, `flusk/src/main/window/bounds.resolve.test.ts`, `flusk/src/main/window/trayIcon.test.ts`, `flusk/src/types/ipc.test.ts` | Targeted unit tests expanded and passing; manual QA matrix evidence is not documented. |

## Findings (by severity)

- **P2**: Manual QA matrix execution (double-pass) required by the plan is not captured in repository artifacts.

## Improvements Applied

- Removed startup auto-reveal by eliminating the bootstrap summon call in `flusk/src/main/index.ts`.
- Fixed quick-add empty clipboard behavior to clear prefill deterministically in `flusk/src/renderer/hooks/useQuickAddListener.ts`.
- Added zod validation for `app:set-launch-at-login` payloads in `flusk/src/main/ipc.ts`.
- Replaced renderer `JSX.Element` annotations with inference/compatible React types to restore renderer typecheck compatibility.
- Added launch-at-login settings UI tab and toggle wiring in `flusk/src/renderer/components/settings/SettingsMemory.tsx`.
- Added shortcut registration guard tests in `flusk/src/main/shortcuts.test.ts`.
- Added bounds restore/recenter decision coverage in `flusk/src/main/window/bounds.resolve.test.ts`.
- Resolved two pre-existing main-process type issues to unblock deeper verification (`flusk/src/main/services/journalService.ts`, `flusk/src/main/ai/liveThought.ts`).

## Test Delta

- Before:
  - `npm run lint` -> pass
  - `npm run typecheck` -> fail (3 errors: `liveThought.ts`, `ipc.ts`, `journalService.ts`)
  - `npm run test` -> pass (4 files, 19 tests)
- After:
  - `npm run lint` -> pass
  - `npm run typecheck` -> pass
  - `npm run test` -> pass (6 files, 25 tests)
- Gaps:
  - Manual QA matrix not executed/documented in this review run.
  - No integration-level automated tests for summon blur/click-outside flow or launch-at-login end-to-end behavior.
  - Packaged runtime tray icon path was not validated by packaging in this pass.

## Verification Run

- Commands:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test`

## Verdict
PASS_WITH_CHANGES

## LESSONS_LEARNED
1. Hidden-at-launch behavior must be explicitly protected from bootstrap summon regressions.
2. Typed IPC features should not be considered complete until renderer UX wiring exists.
3. Manual QA evidence should be captured during implementation, not deferred to review.
