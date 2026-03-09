# Implementation Review

## Plan Path

- `docs/plans/2026-03-06-unship-implementation.md`
- `.taskmaster/tasks/task_005.md`
- `.taskmaster/tasks/task_009.md`

## Traceability Summary

- Taskmaster 5 (`Store Layer CRUD Operations`): implemented in `crates/unship-core/src/store.rs` with CRUD, status transitions, locking, and atomic writes. Review changes tightened ID allocation, status validation, initial `done` completion handling, and deterministic read ordering.
- Taskmaster 9 (`CLI Scaffold and Project Root Resolution`): implemented across `crates/unship-cli/src/cli.rs`, `crates/unship-cli/src/main.rs`, and `crates/unship-core/src/project.rs`. Review changes focused on missing automated verification for flag parsing, help/version output, and `NO_COLOR` handling.

## Findings (by severity)

- P1: `TaskStore::next_id` only considered filename IDs, so a legacy or unindexed task file with frontmatter `id` could be ignored and a later `add` could allocate a duplicate ID. Fixed by scanning frontmatter IDs when filenames are unindexed.
- P1: `TaskStore::add(..., Some("done"))` created a task in the `done` column without setting `completed`, which broke the write-path timestamp contract for done transitions. Fixed by stamping `completed` at creation time for initial `done`.
- P2: `TaskStore::list` sorted `Option<u32>` directly, which placed unindexed tasks ahead of managed tasks despite the intended “managed first” ordering. Fixed with explicit ordering by task kind, then ID, then title.
- P2: Taskmaster 9 had no automated CLI coverage for help/version output, nested subcommand parsing, or `NO_COLOR` behavior. Fixed with unit and smoke tests plus a small extraction for color decision logic.

## Improvements Applied

- Added `TaskStore::normalize_status`, `resolve_status`, and `read_known_id` helpers to make add/update behavior consistent and simpler.
- Added store regressions for unknown statuses, frontmatter-only IDs, initial `done` completion timestamps, managed-vs-unindexed ordering, and concurrent deletes.
- Added CLI parser tests, a testable `should_disable_color` helper, and binary smoke tests for `--help` and `--version`.

## Test Delta
- Before:
  - `cargo test -p unship-core --test store_test -- --nocapture` -> 21 passed
  - `cargo test -p unship-core project -- --nocapture` -> 3 passed
  - `cargo test -p unship -- --nocapture` -> 0 tests
  - `cargo run -p unship -- --help` -> passed
  - `cargo run -p unship -- --version` -> passed
- After:
  - `cargo test --workspace -- --nocapture` -> 71 passed
  - `cargo run -p unship -- --help` -> passed
  - `cargo run -p unship -- --version` -> passed
- Gaps:
  - No end-to-end coverage yet for real CLI task commands beyond scaffold/help/version because later command wiring tasks are still placeholder code by design.

## Verification Run

- `cargo fmt --all`
- `cargo test --workspace -- --nocapture`
- `cargo run -p unship -- --help`
- `cargo run -p unship -- --version`

## Verdict
PASS_WITH_CHANGES

## LESSONS_LEARNED
1. ID allocation must treat frontmatter-only legacy files as authoritative input, not just managed filenames.
2. Status timestamp rules should be enforced on creation and update paths from the same normalization logic.
3. Scaffold tasks still need real tests; otherwise “implemented” can hide shallow verification.
