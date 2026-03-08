# Implementation Review

## Plan Path

`docs/plans/2026-03-08-remove-priority.md`

## Traceability Summary

| Plan area | Evidence | Status | Notes |
| --- | --- | --- | --- |
| Desktop UI | `apps/desktop/src/lib/components/TaskModal.svelte`, `apps/desktop/src/lib/components/TaskList.svelte`, `apps/desktop/src/lib/components/Kanban.svelte`, `apps/desktop/src/lib/components/TaskDetail.svelte`, `apps/desktop/src/lib/components/ReviewView.svelte`, `apps/desktop/src/App.svelte`, `apps/desktop/src/app.css`, `apps/desktop/src/lib/api.ts` | implemented | Priority UI, API types, and color tokens were removed; `PriorityDot.svelte` was deleted. |
| Tauri commands | `apps/desktop/src-tauri/src/commands.rs` | implemented | `TaskDto` / `TaskUpdateDto` no longer expose priority and the update handler no longer forwards it. |
| Rust core | `crates/untask-core/src/task.rs`, `crates/untask-core/src/store.rs`, `crates/untask-core/src/next.rs`, `crates/untask-core/src/types.rs` | implemented | Priority enum and task field were removed; lazy migration behavior is preserved because unknown frontmatter fields are ignored on read and omitted on write. |
| Rust CLI | `crates/untask-cli/src/cli.rs`, `crates/untask-cli/src/main.rs`, `crates/untask-cli/src/commands/list.rs`, `crates/untask-cli/src/output.rs` | implemented | Priority filter/sort/output paths were removed and help text was updated. |
| Tests and snapshots | `crates/untask-core/tests/next_test.rs`, `crates/untask-core/tests/store_test.rs`, `crates/untask-core/tests/task_test.rs`, `crates/untask-cli/tests/commands_test.rs`, `crates/untask-cli/tests/cli_snapshot_test.rs`, `crates/untask-cli/tests/snapshots/cli_snapshot_test__list_json.snap`, `crates/untask-cli/tests/snapshots/cli_snapshot_test__show_json.snap` | implemented | Planned coverage changes landed and the snapshots match the new JSON shape. |
| Docs | `docs/untask-design-language.md`, `CLAUDE.md`, `knowledgebase/index.html`, `knowledgebase/style.css`, `AGENTS.md` | implemented | Planned doc cleanup landed; review also removed stale priority references from static docs and repo instructions that were outside the original plan checklist. |

## Findings (by severity)

### P2

- Fixed during review: `knowledgebase/index.html`, `knowledgebase/style.css`, and `AGENTS.md` still documented priority filters/frontmatter/dots after the feature had been removed from the product. That would have left shipped docs and future repo instructions inconsistent with the implementation.

## Improvements Applied

- Removed stale priority references from the static knowledgebase docs.
- Removed the stale priority-dot rule from `AGENTS.md`.

## Test Delta

- Before:
  - `cargo test` passed.
  - `pnpm --dir apps/desktop check` passed with 2 existing accessibility warnings in `apps/desktop/src/lib/components/TaskModal.svelte` for unlabeled icon-only buttons.
- After:
  - `cargo test` passed.
  - `pnpm --dir apps/desktop check` passed with the same 2 existing accessibility warnings in `apps/desktop/src/lib/components/TaskModal.svelte`.
- Gaps:
  - No automated test covers the static `knowledgebase/` docs; review used a repository-wide `rg` scan to verify that only the intentional legacy `priority:` fixture in `crates/untask-core/tests/task_test.rs` remains outside plan docs.

## Verification Run

- `cargo test`
- `pnpm --dir apps/desktop check`
- `rg -n "priority|Priority|bg-priority|color-priority" . --glob '!target/**' --glob '!node_modules/**' --glob '!.git/**' --glob '!docs/plans/**'`

## Verdict
PASS_WITH_CHANGES

## LESSONS_LEARNED
1. Removing a field cleanly means auditing static docs and agent instructions, not just code paths and snapshots.
2. Leaving one intentional legacy fixture is acceptable when it proves backward-compatible reads for stale task frontmatter.
3. Baseline and post-fix verification made it clear the remaining `TaskModal` warnings predated this review.
