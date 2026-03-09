# Implementation Review

## Plan Path

- `docs/plans/2026-03-07-docs-discovery-implementation.md`

## Traceability Summary

| Plan task | Evidence | Status | Notes |
| --- | --- | --- | --- |
| Task 1: Update default doc globs in config.rs | `crates/unship-core/src/config.rs`, `crates/unship-core/tests/config_test.rs` | implemented | Default config now includes both `.unship/docs/**/*.md` and `docs/**/*.md`. |
| Task 2: Simplify `doc_patterns()` in docs.rs | `crates/unship-core/src/docs.rs` | implemented | `DocsStore` uses `config.docs` as the authoritative source. |
| Task 3: Update watcher.rs in desktop app | `apps/desktop/src-tauri/src/watcher.rs` | implemented | Watcher checks `config.docs` directly and no longer merges a hidden default. |
| Task 4: Fix existing tests | `crates/unship-core/tests/docs_test.rs`, `crates/unship-core/tests/config_test.rs` | implemented | Tests now reflect config-authoritative behavior and the expanded default docs globs. |
| Task 5: Add CLI subcommands | `crates/unship-cli/src/cli.rs` | implemented | `Paths`, `AddPath`, and `RemovePath` are present in `DocsCommands`. |
| Task 6: Implement docs path commands | `crates/unship-cli/src/commands/docs.rs` | implemented | Plain-text and JSON output exist for listing, adding, and removing doc globs. |
| Task 7: Wire new subcommands in main.rs | `crates/unship-cli/src/main.rs` | implemented | All new docs path commands are dispatched from the CLI entry point. |
| Task 8: Add tests for new CLI commands | `crates/unship-cli/src/cli.rs`, `crates/unship-cli/tests/commands_test.rs` | implemented | Parsing and integration coverage exists for the new subcommands. |
| Task 9: Add test for zero-config docs discovery | `crates/unship-core/tests/docs_test.rs`, `crates/unship-cli/tests/commands_test.rs` | implemented | Tightened during review so the tests now exercise a missing-config project instead of a default-written config file. |

## Findings (by severity)

### P2

1. Task 9's "zero-config" tests were only partial before review. Both tests created a project via init helpers that also wrote `.unship/config.yml`, so they covered default-config behavior rather than the intended missing-config fallback. Fixed during review in `crates/unship-core/tests/docs_test.rs` and `crates/unship-cli/tests/commands_test.rs`.

## Improvements Applied

- Changed the core zero-config test to use a raw temp directory with no `.unship/config.yml`.
- Changed the CLI zero-config test to create only the `.unship` marker directory so project-root discovery still works without writing config.

## Test Delta
- Before:
  - `cargo test -p unship-core --test docs_test`
  - `cargo test -p unship-core --test config_test`
  - `cargo test -p unship --test commands_test docs_`
  - `cargo test -p unship parses_docs_path_subcommands`
  - `cargo test -p unship-desktop watcher`
  - `cargo run -p unship -- docs paths`
  - `cargo run -p unship -- docs`
  - Manual smoke: temp project with `.unship/` but no config listed `docs/guide.md`
- After:
  - `cargo test -p unship-core --test docs_test`
  - `cargo test -p unship-core --test config_test`
  - `cargo test -p unship --test commands_test docs_`
  - `cargo test -p unship parses_docs_path_subcommands`
  - `cargo test -p unship-desktop watcher`
- Gaps:
  - Verification stayed scoped to docs discovery and watcher paths; no workspace-wide run was needed for the test-only review change.
  - Existing unrelated worktree changes in desktop files and CLI snapshot files were outside this audit's scope.

## Verification Run

- `cargo test -p unship-core --test docs_test`
- `cargo test -p unship-core --test config_test`
- `cargo test -p unship --test commands_test docs_`
- `cargo test -p unship parses_docs_path_subcommands`
- `cargo test -p unship-desktop watcher`
- `cargo run -p unship -- docs paths`
- `cargo run -p unship -- docs`

## Verdict
PASS_WITH_CHANGES

## LESSONS_LEARNED
1. "Zero-config" needs an actually missing config file, not just default-config behavior.
2. Traceability reviews should verify test setup, not only test names and assertions.
3. Narrow review fixes are safer when the worktree already contains unrelated changes.
