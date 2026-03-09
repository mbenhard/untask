# Implementation Review

## Plan Path

`docs/plans/2026-03-06-unship-implementation.md`

## Traceability Summary

- Task 1 `Root Workspace Scaffold`: implemented in `Cargo.toml`, `crates/unship-core/Cargo.toml`, `crates/unship-cli/Cargo.toml`, `crates/unship-core/src/lib.rs`, `crates/unship-cli/src/main.rs`, `.gitignore`, `apps/desktop/.gitkeep`.
- Task 2 `Config, Errors, and Shared Domain Types`: implemented in `crates/unship-core/src/error.rs`, `crates/unship-core/src/types.rs`, `crates/unship-core/src/config.rs`, `crates/unship-core/tests/config_test.rs`.
- Task 3 `Task Parsing, Serialization, and Metadata Rules`: implemented in `crates/unship-core/src/task.rs`, `crates/unship-core/src/slug.rs`, `crates/unship-core/tests/task_test.rs`.
- Task 4 `Project Initialization, Locking, and Atomic File IO`: implemented in `crates/unship-core/src/init.rs`, `crates/unship-core/src/lock.rs`, `crates/unship-core/src/fs.rs`, `crates/unship-core/tests/init_test.rs`.

## Findings (by severity)

- P1 fixed: `Config::load` accepted syntactically valid configs whose `docs` globs escaped the repo, because scope validation only existed as a separate helper and was never enforced during load.
- P2 fixed: `serialize_task` mutated markdown on a no-op round-trip by inserting extra body whitespace and serializing `id: null` for tasks without IDs.
- P2 fixed: `parse_task` treated recoverable frontmatter omissions like a missing `status` as a full parse failure, dropping usable metadata such as `title`.
- P2 fixed: `init` bypassed the shared write rules by writing `.unship/.gitignore` without the project lock or atomic write helper, and `ProjectLock::acquire` returned `LockFailed` instead of `NotInitialized` for missing projects.

## Improvements Applied

- Enforced repo-scoped doc-glob validation during config load, with fallback to defaults for invalid configs and extra coverage for Windows-style absolute paths.
- Refactored task frontmatter parsing through a dedicated partial frontmatter type so recoverable metadata survives, and made serialization preserve body bytes exactly while omitting absent IDs.
- Updated initialization to create `.unship/` first, acquire the project lock, and write `.unship/.gitignore` through `atomic_write`.
- Tightened file-write durability with flush and `sync_all`, and added focused regression tests for the new edge cases.

## Test Delta
- Before:
  - `cargo fmt --all --check` passed.
  - `cargo clippy --workspace --all-targets --all-features -- -D warnings` passed.
  - `cargo test --workspace` passed.
- After:
  - `cargo build --workspace` passed.
  - `cargo fmt --all --check` passed.
  - `cargo clippy --workspace --all-targets --all-features -- -D warnings` passed.
  - `cargo test --workspace` passed.
- Gaps:
  - No automated coverage yet for OS-specific lock and rename semantics outside the current local environment.

## Verification Run

Reviewed code against Tasks 1-4 in the implementation plan, extended the regression suite from 30 to 35 tests across config, task, and init coverage, and re-ran the Rust workspace verification gates after the review-driven refactors.

## Verdict
PASS_WITH_CHANGES

## LESSONS_LEARNED
1. Repo-scoping rules need to be enforced at config load boundaries, not only in helper methods or tests.
2. Markdown round-trip tests should assert exact output when the design depends on side-effect-free reads and narrow writes.
3. Shared write primitives are only useful if initialization paths use them too.
