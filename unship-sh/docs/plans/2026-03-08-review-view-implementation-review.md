# Implementation Review

## Plan Path

- `docs/plans/2026-03-08-review-view-design.md`

## Traceability Summary

| Plan task | Status | Code evidence | Notes |
| --- | --- | --- | --- |
| Review view replaces slot 4 / keyboard shortcut `4` / review badge | implemented | `apps/desktop/src/App.svelte`, `apps/desktop/src/lib/components/SidebarNav.svelte`, `apps/desktop/src/lib/components/ReviewView.svelte`, `apps/desktop/src/lib/stores.ts` | Review is wired into the shell view state, sidebar, shortcut map, and dedicated view component. |
| Review list sorts by confidence then updated date and supports Approve all | implemented | `apps/desktop/src/lib/components/ReviewView.svelte` | Review tasks are filtered from the shared task store, ordered `low -> medium -> high`, and bulk-approved into the configured done column. |
| Task format extension adds `confidence` and agent sections | implemented | `crates/unship-core/src/task.rs`, `apps/desktop/src-tauri/src/commands.rs`, `apps/desktop/src/lib/api.ts`, `apps/desktop/src/lib/components/TaskModal.svelte` | Rust parsing/serialization, Tauri DTOs, TS DTOs, and modal rendering all handle the new metadata. |
| Kick-back / approve workflow inside `TaskModal` | implemented | `apps/desktop/src/lib/components/TaskModal.svelte` | Review-only actions are present, including optional review notes persisted back into the task body. |
| Locked core columns and review-safe config | implemented with review fix | `crates/unship-core/src/config.rs`, `crates/unship-core/tests/config_test.rs`, `crates/unship-core/src/init.rs` | Deletion protection was already present; this review added rename protection so the canonical core workflow cannot be renamed away. |
| Agent config (`auto_done`, `max_parallel`) | implemented | `crates/unship-core/src/config.rs`, `docs/plans/2026-03-08-review-view-design.md` | `auto_done` and the planned `max_parallel` default both exist in config. |
| Skill split and provider-aware install | implemented | `crates/unship-cli/src/cli.rs`, `crates/unship-cli/src/commands/skill.rs`, `crates/unship-cli/skill/unship.md`, `crates/unship-cli/skill/unship-finish.md`, `crates/unship-cli/skill/unship-docs.md`, `crates/unship-cli/skill/unship-batch.md` | The bundled skill set is split and install supports `claude-code`, `cursor`, `codex`, and `generic`. |

## Findings (by severity)

### P1 - Required core columns could still be renamed away
- Evidence: `crates/unship-core/src/config.rs`
- Impact: the plan requires `backlog -> todo -> in-progress -> review -> done` to remain locked core columns. Allowing `column_rename()` on `review` or `done` breaks the canonical workflow, review filtering, and status normalization even though deletion was already blocked.
- Resolution: fixed during review by rejecting rename attempts for required columns and adding config coverage for delete/rename/custom-column behavior.

## Improvements Applied

- Added a shared required-column guard in `crates/unship-core/src/config.rs` so required columns now reject both delete and rename operations.
- Added regression coverage in `crates/unship-core/tests/config_test.rs` for required-column delete protection, required-column rename protection, and custom-column rename behavior.

## Test Delta
- Before:
  - `cargo test` passed.
  - `pnpm --dir apps/desktop check` passed.
- After:
  - `cargo test` passed after the review fix; `crates/unship-core/tests/config_test.rs` increased from 13 to 16 passing tests.
  - `pnpm --dir apps/desktop check` still passed with 0 errors and 0 warnings.
- Gaps:
  - No automated desktop interaction tests exercise the review queue, Approve all, or kick-back UI paths end-to-end.
  - The review relied on static inspection plus type/test coverage for the Svelte review flow.

## Verification Run

- `cargo test`
- `pnpm --dir apps/desktop check`

## Verdict
PASS_WITH_CHANGES

## LESSONS_LEARNED
1. Locking workflow-critical columns needs symmetric protection on rename and delete paths, not just destructive removal.
2. Plan traceability catches contract gaps that green tests alone will not surface.
3. The review flow now has solid compile/test coverage, but it still lacks end-to-end UI interaction tests.
