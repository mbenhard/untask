# Implementation Review

## Plan Path

- `.taskmaster/tasks/task_014.md`
- `.taskmaster/tasks/tasks.json` (`id: 14`)

## Traceability Summary

- Taskmaster 14 (`TUI Views: Kanban, List, Docs, and Detail`) is implemented across `crates/untask-cli/src/main.rs`, `crates/untask-cli/src/tui/mod.rs`, `crates/untask-cli/src/tui/app.rs`, `crates/untask-cli/src/tui/kanban.rs`, `crates/untask-cli/src/tui/list.rs`, `crates/untask-cli/src/tui/docs.rs`, and `crates/untask-cli/src/tui/detail.rs`.
- The review confirmed the four main views, keyboard routing, docs browsing, detail rendering, and `$EDITOR` integration are present. Review changes closed the remaining Task 14 gaps around back-navigation, explicit unindexed visibility, and failure handling in TUI-triggered actions.

## Findings (by severity)

- P1: Detail view always returned to `List` on `Esc`, even when entered from `Kanban`. That broke the required `Escape -> back` behavior and made the kanban-to-detail flow lossy.
- P2: Unindexed tasks were only mixed into the kanban columns with a small inline marker, instead of staying visible in a dedicated `Unindexed` section as required by Taskmaster 14 and the design notes. Tasks without IDs also failed silently on `Enter` and `d`.
- P2: The TUI code compiled and passed tests, but it did not satisfy the project quality bar: `cargo clippy -p untask --tests -- -D warnings` failed on the new control-flow paths, and editor/status actions swallowed failures instead of surfacing them to the user.

## Improvements Applied

- Added explicit detail-return tracking so `Esc` returns to the originating main view and the selected tab stays aligned while a detail view is open.
- Split kanban cleanup items into a dedicated `unindexed` column, kept unmatched managed tasks separate, and added regressions for column grouping and unindexed task guidance.
- Refactored task-open/task-done/editor-refresh flows into small helpers, surfaced action failures in the TUI message area, and cleaned up the new code until `clippy -D warnings` passed.
- Kept kanban cards dense but more informative by carrying tags alongside priority and subtask progress.

## Test Delta

- Before:
  - `cargo test -p untask` -> passed (`75 passed`)
  - `cargo clippy -p untask --tests -- -D warnings` -> failed (`12` warnings promoted to errors in the new TUI code)
- After:
  - `cargo test -p untask` -> passed (`79 passed`)
  - `cargo clippy -p untask --tests -- -D warnings` -> passed
- Gaps:
  - No interactive terminal session was available for a manual smoke test of live `$EDITOR` launching or visual kanban/list rendering. Verification stayed at the automated Rust test and lint layer.

## Verification Run

- `cargo fmt --all`
- `cargo test -p untask`
- `cargo clippy -p untask --tests -- -D warnings`

## Verdict
PASS_WITH_CHANGES

## LESSONS_LEARNED
1. TUI navigation needs explicit return-state tracking; otherwise "back" behavior quietly regresses to a fixed destination.
2. Cleanup-state visibility is part of correctness for Untask, not a cosmetic extra; unmanaged items need their own explicit surface.
3. Passing tests are not enough for new terminal flows if the project also treats `clippy -D warnings` as a release gate.
