# Implementation Review

## Plan Path

- `.taskmaster/tasks/task_011.md`
- `.taskmaster/tasks/tasks.json` (`id: 11`)

## Traceability Summary

- Taskmaster 11 (`Docs, Search, Next, Repair, and Skill CLI Commands`) is implemented across `crates/untask-cli/src/main.rs`, `crates/untask-cli/src/cli.rs`, `crates/untask-cli/src/commands/docs.rs`, `crates/untask-cli/src/commands/search.rs`, `crates/untask-cli/src/commands/next.rs`, `crates/untask-cli/src/commands/repair.rs`, `crates/untask-cli/src/commands/skill.rs`, `crates/untask-cli/src/commands/open.rs`, and `crates/untask-cli/skill/untask.md`.
- Core support for the reviewed commands remains in `crates/untask-core/src/docs.rs`, `crates/untask-core/src/search.rs`, `crates/untask-core/src/next.rs`, `crates/untask-core/src/git.rs`, and `crates/untask-core/src/repair.rs`.
- This review added the missing CLI integration coverage for task 11 in `crates/untask-cli/tests/commands_test.rs` and tightened the CLI contract where the implementation diverged from the task spec.

## Findings (by severity)

- P1: `next --json` serialized a hand-written wrapper that dropped cleanup hint `kind`/`path` data and git commit timestamps, so the JSON output did not actually match the full `NextSummary` structure promised by task 11. Fixed by deriving `Serialize` on the core summary types in `crates/untask-core/src/next.rs` and `crates/untask-core/src/git.rs`, then serializing `NextSummary` directly in `crates/untask-cli/src/commands/next.rs`.
- P1: `open` called `std::process::exit(1)` inside the command module, which bypassed the CLI's normal error handling path and made the failure contract inconsistent with the rest of the command surface. Fixed in `crates/untask-cli/src/commands/open.rs` by returning a typed command error and keeping failure messaging in the shared top-level CLI flow.
- P2: `repair` accepted `--check --write` simultaneously even though the task explicitly requires those modes to be mutually exclusive. Fixed in `crates/untask-cli/src/cli.rs` with clap conflicts and a regression test.

## Improvements Applied

- Added end-to-end CLI integration coverage for `docs`, `search`, `next`, `repair`, `skill install`, and `open` in `crates/untask-cli/tests/commands_test.rs`.
- Refactored `skill install` in `crates/untask-cli/src/commands/skill.rs` to resolve `HOME` deterministically, isolate target-path detection, and verify both install and fallback paths under test.
- Updated the bundled skill guidance in `crates/untask-cli/skill/untask.md` so it now points agents at tracked planning locations such as `docs/plans/` in addition to `.untask/docs/`.
- Added a general `CommandFailed` error variant in `crates/untask-core/src/error.rs` so command-level failures can stay inside the normal CLI error contract instead of hard-exiting from leaf modules.

## Test Delta
- Before:
  - `cargo test -p untask --test commands_test` -> passed (24 passed)
  - `cargo test -p untask --test cli_smoke_test` -> passed (2 passed)
  - `cargo test -p untask-core --test docs_test --test search_test --test next_test --test repair_test` -> passed (46 passed)
- After:
  - `cargo fmt --all` -> passed
  - `cargo test -p untask --test commands_test` -> passed (34 passed)
  - `cargo test -p untask-core --test docs_test --test search_test --test next_test --test repair_test` -> passed (46 passed)
  - `cargo test --workspace` -> passed (168 passed)
- Gaps:
  - No real successful `untask open` launch was exercised during review; the regression test intentionally stubs `open` so the suite can verify the failure path without launching the desktop app.

## Verification Run

- `cargo fmt --all`
- `cargo test -p untask --test commands_test`
- `cargo test -p untask-core --test docs_test --test search_test --test next_test --test repair_test`
- `cargo test --workspace`

## Verdict
PASS_WITH_CHANGES

## LESSONS_LEARNED
1. JSON command contracts drift quickly when the CLI hand-wraps shared structs instead of serializing the canonical model directly.
2. Command modules should return typed errors instead of calling `process::exit`, or the CLI loses consistency and testability at exactly the failure paths that matter most.
3. Taskmaster acceptance criteria about flag semantics and install flows need explicit CLI integration coverage, not just core-layer tests.
