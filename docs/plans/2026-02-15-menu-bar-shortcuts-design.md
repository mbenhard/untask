# Menu Bar Shortcuts (Task 9) Design

## Objective
Deliver Task 9 as a 2-day production slice with macOS-first behavior and graceful fallback on other platforms. The primary outcome is reliable Spotlight-like window summon behavior: deterministic show/hide, first-open centering, position persistence, click-outside hide, and layered Escape dismissal. Secondary outcomes are tray visibility signal (remaining Today count badge), global shortcuts (`Cmd+Shift+Space`, `Cmd+Shift+A`), clipboard-aware quick add prefill, launch-at-login toggle support, and single-instance handoff.

The design keeps control of all window lifecycle behavior in the main process so renderer state cannot drift from Electron focus/visibility reality.

## Scope
- Implement tray icon and dynamic Today badge updates.
- Register global shortcuts for toggle window and quick add.
- Add clipboard prefill for quick add (raw/normalized text only).
- Implement window behavior: center first summon, restore saved bounds, click-outside hide, layered Escape handoff.
- Add launch-at-login setting wiring and single-instance handling.
- Add targeted unit tests plus manual QA checklist coverage.

## Non-Goals
- Cross-platform parity feature completeness (non-mac remains graceful no-op/fallback).
- AI rewrite/suggestion of clipboard title in quick add.
- Broad e2e automation for tray/shortcut OS flows in this slice.
- Refactoring unrelated chat/task architecture.

## Constraints
- Respect assistant-first guardrails and typed IPC boundaries.
- Main process owns tray, filesystem/settings writes, and OS integrations.
- Renderer must not access Node/Electron internals directly.
- Keep payload validation on write/intention channels.
- Keep scope viable for a 2-day delivery horizon.

## Architecture
Use a main-process "Summon Controller" as single authority for window behavior and invocation sources. `src/main/index.ts` bootstraps controller dependencies and registers lifecycle hooks. `src/main/tray.ts` and `src/main/shortcuts.ts` become thin adapters that delegate to controller methods (`toggleWindow`, `showQuickAdd`, `hideWindow`). A new `src/main/clipboard.ts` handles quick-add clipboard extraction and normalization. A new window behavior module in `src/main/window/` handles bounds validation, centering, restore/save logic, and blur suppression timing.

Settings persistence remains behind existing settings service contracts, with JSON payloads for window bounds and login-item preference. Task Today badge count is derived from task service reads in main process and refreshed after relevant task mutations.

IPC remains domain-first and typed (`app:*`, `settings:*`, `task:*`). Renderer signals UI-layer state transitions for Escape layering and receives quick-add payload events; main process remains final authority on hide/show.

## Components and Interfaces
- `src/main/window/summonController.ts`
  - Owns summon state machine and all window visibility transitions.
  - Methods: `toggleWindow()`, `showQuickAdd()`, `requestHide()`, `onRendererLayerExit()`.
- `src/main/tray.ts`
  - Creates macOS template icon tray.
  - Exposes `updateTodayBadge(count: number)`.
  - Tray click routes to `toggleWindow()`.
- `src/main/shortcuts.ts`
  - Registers/unregisters global shortcuts with idempotent guards.
  - Delegates behavior to summon controller, no direct renderer mutations.
- `src/main/clipboard.ts`
  - Reads clipboard text and classifies URL/text/empty.
  - Normalizes prefill text; no AI transformation.
- `src/main/index.ts`
  - Initializes single-instance lock and launch-at-login application.
  - Wires task mutation hooks to tray badge refresh.
- `src/preload/index.ts` + `src/types/ipc.ts` + `src/types/preload.d.ts`
  - Typed channels for quick-add dispatch and hide requests.
- `src/renderer/stores/appStore.ts` + shortcut hook usage
  - UI-layer collapse state for Escape layering before final hide request.

## Data Flow
Summon toggle flow:
1. Shortcut/tray triggers main `toggleWindow()`.
2. If hidden, controller resolves target bounds (restored if valid, else centered), shows and focuses window.
3. If visible, controller hides window.

Quick add flow:
1. `Cmd+Shift+A` triggers `showQuickAdd()`.
2. Controller reads and normalizes clipboard content.
3. Controller ensures window visible/focused.
4. Main emits typed quick-add payload to renderer.
5. Renderer focuses input and pre-fills text.

Tray badge flow:
1. Main computes remaining Today count (`today=true` and not done).
2. Tray badge updates on startup and after relevant task writes.
3. Zero count hides badge.

Escape/click-outside flow:
1. Renderer handles chat/view layer exits first.
2. Renderer requests main hide only when no deeper layer remains.
3. Main blur handler hides on outside click, with short suppression to avoid show/blur race.

Persistence flow:
1. Debounced move/resize writes bounds setting.
2. Startup validates persisted bounds against active displays.
3. Login-item preference persisted and applied on startup and toggle.

## Error Handling
- Tray initialization failure: log scoped error and continue app without tray.
- Shortcut registration failure: continue app; retain tray/manual summon paths.
- Clipboard read failure: fall back to empty prefill, never block quick add.
- Invalid/off-screen bounds: reset to centered bounds and overwrite stale setting.
- Blur race during show/focus: suppression window prevents immediate accidental hide.
- Single-instance signal failure: still bring existing window to front without payload.
- Login-item apply failure: keep persisted preference, return typed error for UI.
- IPC validation failure: reject payload with structured error, no mutation side effects.
- Badge refresh failure: do not roll back successful task mutation.

## Testing Strategy
Automated (targeted unit-level):
- Clipboard classification/normalization cases.
- Bounds validation and centering decision logic.
- Shortcut registration guards and platform gating behavior.
- Settings persistence adapters for bounds and launch-at-login.
- IPC input validation for quick-add/hide/login toggle channels.
- Badge refresh trigger behavior on task mutations.

Manual QA (macOS):
- Toggle summon from another app with `Cmd+Shift+Space`.
- Quick add with `Cmd+Shift+A` focuses input and pre-fills clipboard URL/text.
- Click outside hides window consistently.
- Escape layering: chat -> view -> hide.
- First summon centers; later summons use saved bounds after relaunch.
- Tray badge increments/decrements as Today workload changes and hides at zero.
- Launch-at-login toggle persists and applies.
- Second app instance focuses existing window.

Regression checks:
- Non-mac startup remains stable with no-op integrations.
- Missing tray icon path degrades gracefully.

## Risks and Mitigations
- OS event timing flakiness around focus/blur.
  - Mitigation: central controller with suppression guards and deterministic state transitions.
- Shortcut conflicts with host applications.
  - Mitigation: registration result logging and fallback summon paths.
- Stale tray badge from missed refresh triggers.
  - Mitigation: refresh at startup and after all relevant task mutations.
- Bounds corruption from multi-display changes.
  - Mitigation: validate against current work area and auto-recenter fallback.
- Scope creep in a 2-day window.
  - Mitigation: exclude AI title suggestion and broad cross-platform parity.

## Open Questions
- None for this slice. Implementation assumptions are fixed:
  - macOS-first behavior with graceful non-mac fallback.
  - quick add uses raw/normalized clipboard prefill only.
  - balanced test strategy (targeted unit tests + manual QA).
