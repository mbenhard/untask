# Implementation Review

## Plan Path

- `.taskmaster/tasks/task_015.md`
- `.taskmaster/tasks/tasks.json` (`id: 15`)

## Traceability Summary

- Taskmaster 15 (`TUI File Watching and Real-time Updates`) is implemented across `crates/untask-cli/src/tui/watcher.rs`, `crates/untask-cli/src/tui/mod.rs`, and `crates/untask-cli/src/tui/app.rs`.
- The review confirmed debounced filesystem polling, TUI-triggered `done` and status updates, and refresh wiring are present. Review changes closed the remaining real-time update gaps around config reloads, root-level and not-yet-created configured doc paths, and watcher reconfiguration after filesystem changes.

## Findings (by severity)

- P1: `App::refresh()` reused the startup `TaskStore` and `DocsStore`, so edits to `.untask/config.yml` or externally configured docs did trigger a watcher event but did not change the running TUI's columns, doc globs, or docs list until a full restart. Fixed by recreating both stores on refresh and covering the behavior with a regression in `crates/untask-cli/src/tui/app.rs`.
- P1: The watcher intentionally skipped the project root when resolving extra doc paths, which meant configured root-level docs and doc directories created after startup were never observed. Because the watcher was also never rebuilt after refresh, newly created doc roots stayed invisible for the rest of the session. Fixed by introducing explicit watch targets with project-root fallback plus watcher rebuilds after filesystem refresh in `crates/untask-cli/src/tui/watcher.rs` and `crates/untask-cli/src/tui/mod.rs`.
- P2: `cargo clippy -p untask --tests -- -D warnings` failed on the watcher debounce test helper, so the Task 15 implementation was not actually passing the repo's lint gate. Fixed while refactoring the watcher tests.

## Improvements Applied

- Reloaded `TaskStore` and `DocsStore` inside `App::refresh()` so config and docs changes are reflected without restarting the TUI.
- Rebuilt the file watcher after refresh-triggered filesystem events so config updates and newly created doc roots update the active watch set.
- Replaced the ad-hoc extra-doc root discovery with explicit watch targets that distinguish recursive directory watches, direct file watches, and project-root fallback when a configured doc path does not exist yet.
- Added regressions for config reload, existing root-level doc watches, missing external doc directories, and existing external doc directories.

## Test Delta

- Before:
  - `cargo test -p untask` -> passed (`87 passed`)
  - `cargo clippy -p untask --tests -- -D warnings` -> failed (`clippy::collapsible_if` in the watcher debounce test helper)
- After:
  - `cargo test -p untask` -> passed (`91 passed`)
  - `cargo clippy -p untask --tests -- -D warnings` -> passed
- Gaps:
  - No interactive terminal session was available for a manual end-to-end smoke test of live `notify` events while the TUI was running, so verification stayed at the automated unit/integration/lint layer.

## Verification Run

- `cargo fmt --all`
- `cargo test -p untask`
- `cargo clippy -p untask --tests -- -D warnings`

## Verdict
PASS_WITH_CHANGES

## LESSONS_LEARNED
1. Watching config files is not enough if the runtime keeps config-cached stores alive across refreshes.
2. File-watch root selection has to account for paths that do not exist yet, or "real-time" updates quietly degrade into restart-only behavior.
3. Rebuilding watcher state after config-driven refreshes keeps the watch graph aligned with the user's current project layout.
