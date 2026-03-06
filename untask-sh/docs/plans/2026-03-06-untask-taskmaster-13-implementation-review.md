# Implementation Review

## Plan Path

- `.taskmaster/tasks/task_013.md`
- `.taskmaster/tasks/tasks.json` (`id: 13`)

## Traceability Summary

- Taskmaster 13 (`TUI Scaffold with Ratatui`) is wired into the no-subcommand CLI path in [crates/untask-cli/src/main.rs](/Users/marcusbenhard/Development/untitled/untask-sh/crates/untask-cli/src/main.rs#L39) and implemented primarily in [crates/untask-cli/src/tui/mod.rs](/Users/marcusbenhard/Development/untitled/untask-sh/crates/untask-cli/src/tui/mod.rs#L11) and [crates/untask-cli/src/tui/app.rs](/Users/marcusbenhard/Development/untitled/untask-sh/crates/untask-cli/src/tui/app.rs#L18).
- The shipped scope is a shell-level foundation rather than a full editor: list, kanban, docs placeholder, and task detail navigation exist, and review changes focused on hardening lifecycle behavior plus making the navigation state safer and more legible.
- Unlike the generated task text, the crate is named `untask` in Cargo metadata, so verification was run against `cargo test -p untask` rather than `untask-cli`.

## Findings (by severity)

- P1: The TUI initialized the terminal before building app state and only called `ratatui::restore()` on the happy path, so startup errors and panics could leave the shell in raw mode. Fixed in [crates/untask-cli/src/tui/mod.rs](/Users/marcusbenhard/Development/untitled/untask-sh/crates/untask-cli/src/tui/mod.rs#L11) by wrapping setup/run/restore in a panic-safe terminal guard with regression tests.
- P2: Refreshing after external task changes could leave `selected` out of bounds or strand the UI in a detail view for a task that no longer exists. Fixed in [crates/untask-cli/src/tui/app.rs](/Users/marcusbenhard/Development/untitled/untask-sh/crates/untask-cli/src/tui/app.rs#L40) and covered with focused tests in [crates/untask-cli/src/tui/app.rs](/Users/marcusbenhard/Development/untitled/untask-sh/crates/untask-cli/src/tui/app.rs#L381).
- P2: Kanban navigation used the shared selection state but did not render which task was selected, so `j/k` plus `Enter` acted on hidden state. Fixed in [crates/untask-cli/src/tui/app.rs](/Users/marcusbenhard/Development/untitled/untask-sh/crates/untask-cli/src/tui/app.rs#L209) by surfacing the selected task in-column and tightening footer help per view.

## Improvements Applied

- Added a generic `with_terminal` wrapper so terminal restoration now happens on success, error, and panic before unwind resumes.
- Centralized view cycling, selection clamping, and detail opening helpers to simplify the TUI app state transitions.
- Made the kanban selection visible and aligned footer copy with the actual behavior of docs/detail views.
- Added eight new TUI-focused tests covering terminal restoration, quit shortcuts, view switching, detail navigation, and refresh behavior after external file removal.

## Test Delta

- Before:
  - `cargo test -p untask` -> passed (33 passed)
  - `cargo test --workspace` -> passed (130 passed)
- After:
  - `cargo fmt --all` -> passed
  - `cargo clippy -p untask --all-targets -- -D warnings` -> passed
  - `cargo test -p untask` -> passed (41 passed)
  - `cargo test --workspace` -> passed (138 passed)
- Gaps:
  - No manual interactive TTY smoke run of `cargo run -p untask` was performed here, so visual layout and raw terminal restoration were validated through unit/workspace tests rather than a live terminal session.

## Verification Run

- `cargo fmt --all`
- `cargo clippy -p untask --all-targets -- -D warnings`
- `cargo test -p untask`
- `cargo test --workspace`

## Verdict
PASS_WITH_CHANGES

## LESSONS_LEARNED
1. Terminal lifecycle code needs explicit panic/error coverage because a single missed restore call leaves the whole shell session in a bad state.
2. Shared selection state is only usable if the active view makes that selection visible and clamps it after external mutations.
3. Small TUI shells still benefit from unit tests when the behavior is mostly state transitions rather than full-screen rendering.
