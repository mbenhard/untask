# Implementation Review

## Plan Path

- `.taskmaster/tasks/task_007.md`
- `docs/plans/2026-03-06-unship-implementation.md`

## Traceability Summary

- Doc discovery now honors configured repo-scoped globs while always including the default `.unship/docs/**/*.md` path in `crates/unship-core/src/docs.rs`.
- Canonical-path deduplication and basename ambiguity handling are implemented in `crates/unship-core/src/docs.rs`.
- Search now covers tasks and discovered docs, returns highlighted snippets, respects `tasks_only`, and ranks title matches ahead of body/doc matches in `crates/unship-core/src/search.rs`.
- Regression coverage for the reviewed behaviors lives in `crates/unship-core/tests/docs_test.rs` and `crates/unship-core/tests/search_test.rs`.

## Findings (by severity)

- `P1` Fixed: custom `config.docs` entries replaced the default `.unship/docs/**/*.md` discovery path, which caused built-in project docs to disappear as soon as a repo added any extra doc glob.
- `P2` Fixed: search results were emitted in task iteration order instead of relevance order, so body hits could appear before stronger title matches.
- `P2` Fixed: doc discovery failures during search were swallowed, which could silently return incomplete search results.
- `P3` Fixed: the crate-level `clippy` gate was blocked by pre-existing derive/collapsible-if warnings in adjacent core modules.

## Improvements Applied

- Added a shared default doc glob constant and merged default/configured patterns inside `DocsStore`.
- Sorted discovered docs deterministically by relative path and kept relative-path disambiguation for ambiguous basenames.
- Ranked search results, highlighted tag matches, short-circuited blank queries, and propagated doc-search failures.
- Added regression tests for default doc inclusion and title-priority search ordering.
- Cleaned the existing `clippy` blockers in `repair.rs`, `store.rs`, `task.rs`, and `types.rs`.

## Test Delta

- Before:
  - `cargo fmt --all --check` failed on formatting in the new Task 7 files.
  - `cargo clippy -p unship-core --all-targets --all-features -- -D warnings` failed on existing warnings in `repair.rs`, `store.rs`, `task.rs`, and `types.rs`.
  - `cargo test -p unship-core` passed.
- After:
  - `cargo fmt --all --check` passed.
  - `cargo clippy -p unship-core --all-targets --all-features -- -D warnings` passed.
  - `cargo test -p unship-core --test docs_test --test search_test` passed.
  - `cargo test -p unship-core` passed.
- Gaps:
  - none

## Verification Run

- `cargo fmt --all --check`
- `cargo clippy -p unship-core --all-targets --all-features -- -D warnings`
- `cargo test -p unship-core --test docs_test --test search_test`
- `cargo test -p unship-core`

## Verdict
PASS_WITH_CHANGES

## LESSONS_LEARNED
1. Default discovery paths should be additive, not replaced by optional config.
2. Search behavior needs explicit ranking rules or tests quickly drift to iteration-order results.
3. Running `clippy` before refactors makes unrelated gate failures visible early and easier to separate from review findings.
