# Menu Bar Shortcuts (Task 9) Execution Plan

## Preconditions
- Task dependencies (`5`, `6`, `7`) remain complete in Taskmaster.
- Existing main/renderer typed IPC baseline is healthy (`npm run lint` and `npx tsc --noEmit -p tsconfig.main.json && npx tsc --noEmit -p tsconfig.preload.json && npx tsc --noEmit -p tsconfig.renderer.json` pass before edits).
- Tray template icon assets are not currently present and must be created as part of this plan.
- Existing settings service remains the only write path for persisted app/window preferences.

## Task List
1. Add verification command strategy and minimal test harness entrypoints
2. Add typed contracts for app/window integrations
3. Remove startup auto-reveal and enforce hidden-at-launch summon baseline
4. Implement summon controller and window persistence behavior
5. Create tray icon assets and validate packaging/runtime paths
6. Implement tray manager with dynamic Today badge updates
7. Extend global shortcuts for toggle + quick add routing
8. Add clipboard quick-add service and renderer prefill integration
9. Implement layered Escape + click-outside hide coordination
10. Add launch-at-login and single-instance lifecycle handling
11. Add targeted tests and run verification checklist

## Verification Per Task
- Task 1:
  - `package.json` contains explicit commands used for this slice (at minimum `lint` and a typecheck command).
  - Unit test execution path is documented and runnable (script or direct runner command).
- Task 2:
  - Build succeeds with new `app:*` channel typings in preload/main/renderer.
  - Invalid payloads are rejected with typed errors.
- Task 3:
  - `flusk/src/main/index.ts` no longer shows the window on `ready-to-show`, `did-finish-load`, or startup timeout.
  - App launches hidden and can only be revealed by summon paths.
- Task 4:
  - First summon is centered.
  - Dragged position persists after relaunch.
  - Off-screen stored bounds auto-recenter.
- Task 5:
  - Tray assets exist in project source with macOS template variant.
  - Packaged and dev runtime resolve the same icon path without fallback errors.
- Task 6:
  - Tray icon appears on macOS.
  - Badge updates on Today/done mutations and hides at zero.
- Task 7:
  - `Cmd+Shift+Space` toggles visibility reliably from other apps.
  - `Cmd+Shift+A` summons window and routes quick-add intent.
- Task 8:
  - Clipboard URL/text prefill appears in input on quick add.
  - Clipboard failures produce empty prefill without crashes.
- Task 9:
  - Escape resolves chat -> view -> hide in order.
  - Clicking outside hides window without show/blur race regressions.
- Task 10:
  - Single-instance lock focuses existing window on second launch.
  - Launch-at-login toggle persists and applies at startup.
- Task 11:
  - Targeted unit tests pass for clipboard, shortcut guards, and persistence logic.
  - Manual QA matrix passes twice consecutively.

## Batch Size
Default: 3 tasks per batch

Batch A (Day 1): Tasks 1-4  
Batch B (Day 1/2): Tasks 5-8  
Batch C (Day 2): Tasks 9-11

## Blockers and Escalation
- Global shortcut registration blocked by OS conflicts:
  - Escalate with fallback behavior and visible status note; do not block release.
- Tray icon asset invalid/missing:
  - Escalate immediately; fallback to menu-only summon while asset is fixed.
- Typecheck/test runner command instability:
  - Escalate with exact failing command output and keep manual QA path active while tooling is corrected.
- Launch-at-login API permissions differ by environment:
  - Escalate with explicit environment notes; keep preference persisted even if apply fails.
- Blur behavior regressions on specific macOS versions:
  - Gate with suppression timing config and document tested OS build.

## Completion Criteria
- All Task 9 acceptance scenarios pass on macOS manual QA.
- Targeted automated tests are added and passing for selected deterministic logic, with explicit runnable commands captured in project scripts or plan notes.
- No startup crash on non-mac platforms (graceful no-op behavior).
- Task notes updated with implementation decisions, trade-offs, and validation outcomes.
- Task is eligible for move to done after acceptance checks and regression sweep.
