# Implementation Review

## Plan Path

- `docs/plans/2026-03-07-task-crud-improvements-design.md`

## Traceability Summary

| Plan task | Evidence | Status | Notes |
| --- | --- | --- | --- |
| Inline quick-add in Kanban/List | `apps/desktop/src/lib/components/Kanban.svelte`, `apps/desktop/src/lib/components/TaskList.svelte` | partial | UI exists in both views, but new tasks still rely on backend defaults and are created without the plan-required persisted `position`. |
| Replace detail panel with centered task modal | `apps/desktop/src/App.svelte`, `apps/desktop/src/lib/components/TaskModal.svelte` | partial | Modal wiring exists for managed tasks only. Unindexed tasks cannot open the required read-only modal. |
| Delete from modal with confirmation | `apps/desktop/src/lib/components/TaskModal.svelte` | implemented | Inline confirmation and delete command are present. |
| Autosave editable fields | `apps/desktop/src/lib/components/TaskModal.svelte` | partial | Status/tags/body/title update paths exist, but refreshes overwrite in-progress edits and priority cannot cycle back to `none`. |
| Kanban drag-and-drop and reorder | `apps/desktop/src/lib/components/Kanban.svelte` | partial | Drag/drop UI exists, but first-reorder migration and rebalance behavior are not persisted. Modal-open drag disable is also missing. |
| Manual ordering via `position` | `apps/desktop/src/lib/api.ts`, `apps/desktop/src-tauri/src/commands.rs`, `crates/unship-core/src/task.rs`, `crates/unship-core/src/store.rs` | partial | `position` is modeled end-to-end, but create/update logic does not satisfy the default-position and migration rules from the plan. |
| Compact metadata-rich task cards | `apps/desktop/src/lib/components/Kanban.svelte`, `apps/desktop/src/lib/components/TaskList.svelte` | implemented | Priority dots, tags, subtask progress, and updated timestamps are rendered in dense monochrome rows. |

## Findings (by severity)

### P1

1. Unindexed tasks cannot open the planned read-only modal. `onTaskClick()` stores `task.id`, and the modal only renders when `selectedTaskId != null`, so every unindexed task click is a no-op instead of opening the required warning-only experience.
2. First reorder does not persist migrated positions. `ensurePositions()` only creates local in-memory values, while `handleDrop()` updates the dragged task alone. After refresh, null-position siblings remain unindexed and the manual order contract is broken.
3. Modal refreshes clobber in-progress edits. Every `refreshRevision` change triggers `loadTask()`, which replaces `task` even while the user is editing title/body/tags. The plan explicitly required preserving in-progress edits during watcher-driven refreshes.

### P2

1. Priority cannot cycle back to `none`. The UI sends `priority: undefined`, which is indistinguishable from "no update", so the backend never clears the stored priority.
2. New tasks are created without a persisted `position`. The plan required `max_position_in_column + 1`, but `TaskStore::add()` leaves `position` unset, so quick-add does not establish stable ordering.
3. Keyboard accessibility is below the plan target. `pnpm check` still reports six Svelte a11y warnings, including the modal dialog lacking focusability and autofocus usage in quick-add/modal fields.

## Improvements Applied

- No code changes applied during review. The remaining gaps are feature-level and should be handled in a follow-up implementation batch rather than patched ad hoc during audit.

## Test Delta

- Before:
  - `cargo test --workspace` passed.
  - `pnpm check` passed with 0 errors and 6 Svelte accessibility warnings.
- After:
  - `cargo test --workspace` passed.
  - `pnpm check` passed with 0 errors and 6 Svelte accessibility warnings.
- Gaps:
  - No desktop interaction tests cover modal edit preservation, unindexed-task modal behavior, or drag-and-drop/manual ordering persistence.

## Verification Run

- `cargo test --workspace`
- `pnpm check`

## Verdict
FAIL

## LESSONS_LEARNED
1. UI parity with a design plan is not enough; reorder and migration behavior need persistence-level tests.
2. Watcher-driven refresh paths need explicit draft-preservation rules or they will silently violate autosave UX.
3. Accessibility warnings are a useful regression signal here because they map directly to plan requirements around keyboard navigation.
