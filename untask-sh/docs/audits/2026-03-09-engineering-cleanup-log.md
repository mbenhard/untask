# Untask Engineering Cleanup Log

Date: 2026-03-09
Status: In Progress

## Batch Log

### Batch 1

- Initialized cleanup plan and execution log.
- Added shared column workflow orchestration in `untask-core/src/columns.rs`.
- Moved CLI and Tauri column rename/delete/move/add flows onto shared core helpers.
- Fixed invalid `move_to` handling by canonicalizing targets in core before task migration.
- Hardened `TaskStore::migrate_tasks_status` and `delete_tasks_by_status` so direct callers also validate statuses.
- Fixed `next` done-column logic to respect `Config::is_done_status`.
- Added regression tests for column workflows and custom done-column handling.

### Batch 2

- Added `Config::load_strict` and moved user-facing config/doc command paths to strict loading.
- Added `TaskStore::new_strict` and moved CLI/Tauri task command paths to strict loading.
- Added `DocsStore::new_strict` and `DocsStore::save_doc`.
- Routed desktop doc saves through `untask-core` instead of raw Tauri-side file writes.
- Applied project locking to docs create/rename/move/delete/save operations.
- Fixed existing clippy issues in `untask-core` and one in CLI dispatch.

### Batch 3

- Removed confirmed dead frontend file `apps/desktop/src/lib/components/TaskDetail.svelte`.
- Removed unused `selectedTask` store export.
- Removed unused `listDocs()` frontend API export.
- Centralized duplicate frontend helpers into:
  - `apps/desktop/src/lib/actions.ts`
  - `apps/desktop/src/lib/format.ts`
- Updated `TaskList.svelte`, `ReviewView.svelte`, `Kanban.svelte`, `SubtaskList.svelte`, and `TaskModal.svelte` to use shared helpers.
- Narrowed desktop external refresh behavior so watcher-driven updates no longer always reload config, tasks, and docs together.
- Cleared all current `svelte-check` warnings.

### Batch 4

- Split the Tauri backend command monolith into domain modules under `apps/desktop/src-tauri/src/commands/`.
- Added shared Tauri command helpers in `commands/shared.rs`.
- Updated `src-tauri/src/lib.rs` to register command handlers from explicit domain modules.
- Preserved backend test coverage while moving command-adjacent tests out of the old monolith.

### Batch 5

- Reduced `TaskStore` scan-heavy point lookups by separating task-path discovery from single-task loading.
- Added a direct ID lookup path so `get`, update/delete flows, and attachment reads no longer require reparsing the full task set for common managed-task operations.
- Fixed `TaskStore::mark_done` to honor the configured terminal column instead of assuming the literal status `done`.
- Normalized `count_tasks_in_column` input through core status rules.
- Added regression tests for legacy frontmatter-only IDs and custom done-column behavior.
- Extracted TaskModal body parsing/composition logic into `apps/desktop/src/lib/taskBody.ts`.
- Extracted TaskModal prompt construction into `apps/desktop/src/lib/taskPrompt.ts`.
- Added shared byte formatting in `apps/desktop/src/lib/format.ts` and moved TaskModal to the shared helpers.

### Batch 6

- Reduced `apps/desktop/src/lib/components/Kanban.svelte` from 887 lines to 627 lines by extracting repeated structure and pure board helpers.
- Added `apps/desktop/src/lib/kanban.ts` for derived column, done-column, dragability, unmatched-column, and insertion helpers.
- Added `apps/desktop/src/lib/components/KanbanTaskCard.svelte` to centralize the duplicated active/done task card rendering.
- Added `apps/desktop/src/lib/components/KanbanQuickAdd.svelte` to centralize the duplicated quick-add editor and pasted-image indicator UI.
- Kept the existing drag/drop and quick-add flows in `Kanban.svelte`, but removed repeated rendering branches so the remaining file is more focused on board state and orchestration.

### Batch 7

- Reduced `apps/desktop/src/lib/components/DocsViewer.svelte` from 892 lines to 726 lines by moving document-tree traversal and naming utilities into a shared helper module.
- Added `apps/desktop/src/lib/docsTree.ts` for flattening, ancestor lookup, move-target collection, writable-root lookup, and conflict-free naming.
- Removed dead `DocsViewer` helpers and unused derived state that were left in the component after earlier feature work.
- Kept document action flows in the component, but narrowed the file so it now focuses more on selection and action orchestration than recursive tree utility code.

### Batch 8

- Added an internal `scan_tasks` helper in `crates/untask-core/src/store.rs` so aggregate/task-migration paths no longer pay the sort-and-full-list cost of `list(None)`.
- Moved `next_position_for_status`, `migrate_tasks_status_locked`, `delete_tasks_by_status_locked`, `count_by_prd`, and `count_tasks_in_column` onto the lighter scan path.
- Kept `list()` behavior intact for user-facing ordered reads, while narrowing internal aggregate/write helpers to the simpler traversal they actually need.

### Batch 9

- Reduced `apps/desktop/src/lib/components/TaskModal.svelte` from 1106 lines to 901 lines by extracting pure rendering branches instead of leaving them embedded in the main stateful component.
- Added `apps/desktop/src/lib/components/TaskAgentSections.svelte` for agent/review section rendering and speech-bubble styling.
- Added `apps/desktop/src/lib/components/TaskModalActionBar.svelte` for the footer action state, delete confirmation branch, revise actions, and prompt-mode split-button UI.
- Kept TaskModal’s state model intact, but narrowed the remaining file so it now owns more of the state transitions and less of the repeated rendering branches.

### Batch 10

- Reduced `apps/desktop/src/lib/components/DocsViewer.svelte` from 726 lines to 584 lines by extracting the sidebar tree and folder-preview rendering branches.
- Added `apps/desktop/src/lib/components/DocsTreePane.svelte` for document-tree rendering, tree-row interaction, and tree scrollbar styling.
- Added `apps/desktop/src/lib/components/DocsFolderView.svelte` for the folder-only child listing branch.
- Kept DocsViewer responsible for selection, document actions, and editor orchestration while removing most of the pure sidebar/folder rendering surface.

### Batch 11

- Inspected the remaining repository-hygiene backlog around tracked live project state, fixture state, and planning archives.
- Added `docs/audits/2026-03-09-repo-hygiene-proposal.md` with exact current paths, sizes, recommended boundary policy, and a controlled migration proposal.
- Intentionally did not move `.untask/`, `test-dir/.untask/`, or `docs/plans/` yet because that is a repository-organization decision rather than a safe unilateral code cleanup.

## Verification

- `cargo test --workspace`: passed
- `cargo clippy --workspace --all-targets -- -D warnings`: passed
- `npm run check` in `apps/desktop`: passed

## Deferred Work

- Break up the remaining state-heavy parts of `TaskModal.svelte` and the document-action header in `DocsViewer.svelte` only if the extra churn is justified.
- Decide whether the remaining aggregate/list scan paths in `TaskStore` justify a larger indexing or cache layer.
- Approve or reject the repository-boundary proposal for `.untask/`, `test-dir/.untask/`, and `docs/plans/`.
