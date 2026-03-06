# Implementation Review

## Plan Path

- `.taskmaster/tasks/task_010.md`
- `.taskmaster/tasks/tasks.json` (`id: 10`)

## Traceability Summary

- Taskmaster 10 (`Core Task CLI Commands`): implemented across [crates/untask-cli/src/main.rs](/Users/marcusbenhard/Development/untitled/untask-sh/crates/untask-cli/src/main.rs), [crates/untask-cli/src/cli.rs](/Users/marcusbenhard/Development/untitled/untask-sh/crates/untask-cli/src/cli.rs), [crates/untask-cli/src/commands/add.rs](/Users/marcusbenhard/Development/untitled/untask-sh/crates/untask-cli/src/commands/add.rs), [crates/untask-cli/src/commands/delete.rs](/Users/marcusbenhard/Development/untitled/untask-sh/crates/untask-cli/src/commands/delete.rs), [crates/untask-cli/src/commands/done.rs](/Users/marcusbenhard/Development/untitled/untask-sh/crates/untask-cli/src/commands/done.rs), [crates/untask-cli/src/commands/edit.rs](/Users/marcusbenhard/Development/untitled/untask-sh/crates/untask-cli/src/commands/edit.rs), [crates/untask-cli/src/commands/list.rs](/Users/marcusbenhard/Development/untitled/untask-sh/crates/untask-cli/src/commands/list.rs), [crates/untask-cli/src/commands/show.rs](/Users/marcusbenhard/Development/untitled/untask-sh/crates/untask-cli/src/commands/show.rs), [crates/untask-cli/src/commands/status.rs](/Users/marcusbenhard/Development/untitled/untask-sh/crates/untask-cli/src/commands/status.rs), and [crates/untask-cli/tests/commands_test.rs](/Users/marcusbenhard/Development/untitled/untask-sh/crates/untask-cli/tests/commands_test.rs). Review changes tightened the command contract rather than replacing the implementation wholesale.
- The repo-level planning document [docs/plans/2026-03-06-untask-implementation.md](/Users/marcusbenhard/Development/untitled/untask-sh/docs/plans/2026-03-06-untask-implementation.md) renumbers later CLI output work as task 12, so this audit treated Taskmaster’s generated task file and `tasks.json` entry as the canonical source for task 10 scope.

## Findings (by severity)

- P1: `show --json` serialized the shared `Task` type directly, but `Task` intentionally skips `body` and `subtask_progress`, so the detail command was incomplete for agent consumers even though the human view rendered the body. Fixed in [crates/untask-cli/src/commands/show.rs](/Users/marcusbenhard/Development/untitled/untask-sh/crates/untask-cli/src/commands/show.rs) and covered in [crates/untask-cli/tests/commands_test.rs](/Users/marcusbenhard/Development/untitled/untask-sh/crates/untask-cli/tests/commands_test.rs).
- P1: `edit` treated the entire `EDITOR` value as the executable path, which breaks common configurations like `EDITOR="code --wait"` and `EDITOR="nvim -f"`. Fixed in [crates/untask-cli/src/commands/edit.rs](/Users/marcusbenhard/Development/untitled/untask-sh/crates/untask-cli/src/commands/edit.rs) by shell-splitting the configured command and adding focused unit plus integration coverage.
- P2: `list --status <invalid>` silently normalized to an empty match set because the store filter defaulted unknown statuses to `""`, which turned user input errors into misleading “No tasks found” output. Fixed in [crates/untask-cli/src/commands/list.rs](/Users/marcusbenhard/Development/untitled/untask-sh/crates/untask-cli/src/commands/list.rs) so invalid status filters now fail explicitly.

## Improvements Applied

- Added explicit status-filter validation in `list`, surfaced tags in the human list view, and preserved stable priority ordering with regression coverage.
- Added a `TaskDetail` JSON wrapper for `show` so detail responses now include body text and structured subtask progress without changing the leaner list/add/status payloads.
- Added shell-style parsing for `EDITOR` / `VISUAL` commands via `shlex` and strengthened the editor failure messaging.
- Expanded CLI coverage with new tests for invalid status filters, priority filtering/sorting, JSON detail completeness, editor commands with arguments, delete cancellation, and non-initialized `edit`.

## Test Delta
- Before:
  - `cargo test -p untask` -> passed (25 passed)
- After:
  - `cargo test -p untask` -> passed (33 passed)
  - `cargo test --workspace` -> passed (109 passed)
- Gaps:
  - No manual smoke run was performed against a real interactive editor like `vim`, `nano`, or `code --wait`; the editor path is covered with command-invocation tests only.
  - Real TTY/color behavior was not re-verified here because the task 10 implementation still emits monochrome-only terminal output; task 12 remains the place for full output-mode coverage.

## Verification Run

- `cargo fmt --all`
- `cargo test -p untask`
- `cargo test --workspace`

## Verdict
PASS_WITH_CHANGES

## LESSONS_LEARNED
1. Reusing a shared serialized model across list and detail commands is convenient until the detail contract needs fields the shared model intentionally hides.
2. CLI integration tests need to exercise real process semantics like stdin, stderr, and env-driven command parsing or they miss the failures users actually hit.
3. Filter validation belongs at the CLI boundary when silent normalization would turn bad input into misleading empty-state output.
