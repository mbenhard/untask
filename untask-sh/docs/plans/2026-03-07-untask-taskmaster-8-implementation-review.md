# Implementation Review

## Plan Path

- `.taskmaster/tasks/task_008.md`
- `.taskmaster/tasks/tasks.json` (`id: 8`)

## Traceability Summary

- Taskmaster 8 (`Git Summary and Next Command Implementation`) is implemented in [crates/untask-core/src/git.rs](/Users/marcusbenhard/Development/untitled/untask-sh/crates/untask-core/src/git.rs), [crates/untask-core/src/next.rs](/Users/marcusbenhard/Development/untitled/untask-sh/crates/untask-core/src/next.rs), and [crates/untask-core/tests/next_test.rs](/Users/marcusbenhard/Development/untitled/untask-sh/crates/untask-core/tests/next_test.rs).
- The repo-level implementation plan [docs/plans/2026-03-06-untask-implementation.md](/Users/marcusbenhard/Development/untitled/untask-sh/docs/plans/2026-03-06-untask-implementation.md) labels a different CLI scope as task 8, so this audit uses Taskmaster’s generated task file as the canonical source for scope and numbering.

## Findings (by severity)

- P1: `generate_next` classified tasks by the raw `status` string instead of the configured canonical status map, so valid done aliases like `finished` or `closed` were incorrectly shown as open work and omitted from recently completed output. Fixed in [crates/untask-core/src/next.rs](/Users/marcusbenhard/Development/untitled/untask-sh/crates/untask-core/src/next.rs) with regression coverage in [crates/untask-core/tests/next_test.rs](/Users/marcusbenhard/Development/untitled/untask-sh/crates/untask-core/tests/next_test.rs).

## Improvements Applied

- Reused config-backed status normalization when building the open and recently completed sections so `next` now matches the store and repair behavior for canonical and alias statuses.
- Tightened the seven-day completion window check to include tasks completed exactly at the cutoff boundary.
- Simplified the git integration tests by extracting shared repo setup helpers and added a regression that exercises non-canonical done aliases end to end.

## Test Delta
- Before:
  - `cargo test -p untask-core --test next_test` -> passed (12 passed)
  - `cargo test -p untask-core` -> passed (109 passed)
- After:
  - `cargo test -p untask-core --test next_test` -> passed (13 passed)
  - `cargo test --workspace` -> passed (151 passed)
- Gaps:
  - No manual shell smoke run of a `next` CLI command was possible here because the CLI command itself is implemented in a later Taskmaster scope; this audit covers the core aggregation layer only.

## Verification Run

- `cargo fmt --all`
- `cargo test -p untask-core --test next_test`
- `cargo test --workspace`

## Verdict
PASS_WITH_CHANGES

## LESSONS_LEARNED
1. Summary-style commands should classify task state through the same normalization path the store uses, or aliases drift into user-visible contradictions.
2. Taskmaster numbering can diverge from hand-written implementation docs, so the generated task file needs to be the review source of truth.
3. Repeated shell setup in tests hides intent; small helpers make edge-case regressions easier to add and reason about.
