# Implementation Review

## Plan Path

- `.taskmaster/tasks/task_012.md`
- `.taskmaster/tasks/tasks.json` (`id: 12`)

## Traceability Summary

- Taskmaster 12 (`CLI Output Formatting and Contract Tests`) is implemented across `crates/untask-cli/src/main.rs`, `crates/untask-cli/src/output.rs`, `crates/untask-cli/src/commands/list.rs`, `crates/untask-cli/src/commands/show.rs`, `crates/untask-cli/src/commands/search.rs`, `crates/untask-cli/src/commands/next.rs`, `crates/untask-cli/src/commands/repair.rs`, `crates/untask-cli/tests/cli_snapshot_test.rs`, and the generated `crates/untask-cli/tests/snapshots/*`.
- Output mode detection, formatter wiring, and JSON snapshot coverage are all present. The review changes closed the remaining formatter gaps and added direct verification for color/plain mode selection and colored row alignment.

## Findings (by severity)

- P2: Formatter integration was incomplete for `search`, `repair`, and `next`, and `next` accepted a formatter argument without using it. This left Taskmaster 12 only partially aligned with its own “consistent formatting across commands” contract even though the baseline tests were green.
- P2: Output-mode behavior was only indirectly validated. The baseline suite checked for missing ANSI codes under `NO_COLOR` and piped stdout, but it did not directly verify TTY -> `Color`, non-TTY -> `Plain`, or that colored status rendering preserved the aligned list layout once ANSI escapes were present.

## Improvements Applied

- Routed `search`, `repair`, and `next` through `Formatter` helpers so the non-JSON command surface now shares the same output layer instead of mixing formatter-backed and ad hoc text rendering.
- Refactored `OutputMode::detect` through a pure context helper, which made TTY/plain/monochrome selection directly unit-testable.
- Fixed colored task-row rendering so status alignment is based on the visible padded status text rather than the ANSI-decorated string width.
- Cleaned up snapshot redaction helpers so `cargo clippy -p untask --tests -- -D warnings` passes cleanly.

## Test Delta

- Before:
  - `cargo test -p untask --tests -- --nocapture` -> passed (`65 passed`)
- After:
  - `cargo test -p untask --tests -- --nocapture` -> passed (`69 passed`)
  - `cargo clippy -p untask --tests -- -D warnings` -> passed
- Gaps:
  - No live interactive TTY session was available for an end-to-end ANSI/terminal smoke test; this review covered the TTY/plain/color branches through unit tests around the formatter and output-mode selection.

## Verification Run

- `cargo fmt --all`
- `cargo test -p untask --tests -- --nocapture`
- `cargo clippy -p untask --tests -- -D warnings`

## Verdict
PASS_WITH_CHANGES

## LESSONS_LEARNED
1. Formatter adoption needs to be audited command-by-command; a shared helper existing is not the same thing as the full CLI actually using it.
2. TTY-sensitive behavior should expose a small pure decision point so tests can cover it without requiring a real terminal harness.
