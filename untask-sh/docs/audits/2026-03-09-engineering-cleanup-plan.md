# Untask Engineering Cleanup Plan

Date: 2026-03-09
Source audit: `docs/audits/2026-03-09-engineering-audit.md`
Status: In Progress

## Goals

1. Fix confirmed correctness issues before adding features.
2. Remove duplicated workflow orchestration where possible.
3. Strengthen persistence and config handling in shared core code.
4. Reduce dead code and low-value maintenance surface.
5. Leave the repository in a cleaner, verified state.

## Execution Order

### Batch 1: Core correctness and write orchestration

- Move column rename/delete workflow orchestration into `untask-core`
- Validate and canonicalize column delete destinations
- Make column rename/delete updates atomic under one lock

### Batch 2: Shared persistence and config handling

- Route desktop doc saves through `untask-core`
- Apply locking/atomic-write policy to docs mutations
- Introduce explicit config loading for command paths that should not silently reset to defaults

### Batch 3: Surface cleanup and duplication reduction

- Remove confirmed dead desktop surface
- Centralize repeated frontend helpers
- Trim unused desktop API/backend commands where confirmed safe

### Batch 4: Tauri backend structure

- Split `apps/desktop/src-tauri/src/commands.rs` into domain modules
- Centralize command-shared helpers and test utilities
- Keep desktop backend verification green after the split

### Batch 5: Core scan reduction and frontend helper extraction

- Reduce scan-heavy point lookups in `TaskStore`
- Fix remaining config-driven done-column drift in `mark_done`
- Move pure `TaskModal` body/prompt logic into shared TS modules

### Batch 6: Kanban component decomposition

- Extract repeated card rendering into a focused component
- Extract repeated quick-add editor UI into a focused component
- Move pure board derivation helpers out of the Svelte file

### Batch 7: Docs viewer tree-helper extraction

- Move recursive tree/path helpers into a shared document-tree module
- Remove dead local helpers and unused derived state from `DocsViewer.svelte`
- Keep document actions and editor wiring intact while narrowing the component

### Batch 8: Verification and follow-up

- Run workspace verification
- Update the audit log with completed fixes and deferred work
- Record residual refactors that still make sense but were intentionally left out of this pass

### Batch 9: Aggregate scan simplification

- Move internal aggregate/task-migration paths off the sorted `list(None)` code path
- Keep user-facing ordered reads intact while using a lighter internal traversal for counts and migrations

### Batch 10: Verification and follow-up

- Run workspace verification
- Update the audit log with completed fixes and deferred work
- Reassess whether remaining items are code cleanup or repo-policy decisions

### Batch 11: Task modal rendering extraction

- Move agent/review section rendering out of `TaskModal.svelte`
- Move the modal footer action branches out of `TaskModal.svelte`
- Keep the modal’s state transitions intact while reducing its rendering surface

### Batch 12: Docs viewer rendering extraction

- Move the sidebar tree rendering out of `DocsViewer.svelte`
- Move the folder-only preview branch out of `DocsViewer.svelte`
- Keep document actions and editor orchestration in the parent component

### Batch 13: Verification and follow-up

- Run workspace verification
- Update the audit log with completed fixes and deferred work
- Reassess whether remaining work is still high-value cleanup or mostly churn

### Batch 14: Repository hygiene decision prep

- Inspect tracked live-state, fixture, and archive-heavy paths
- Record exact recommendations in a repository-boundary proposal
- Separate “safe cleanup already done” from “needs explicit approval”

## Outcome

- Batch 1: completed
- Batch 2: completed
- Batch 3: completed
- Batch 4: completed
- Batch 5: completed
- Batch 6: completed
- Batch 7: completed
- Batch 8: completed
- Batch 9: completed
- Batch 10: completed
- Batch 11: completed
- Batch 12: completed
- Batch 13: completed
- Batch 14: completed

## Remaining Backlog

- Split the remaining state-heavy parts of `TaskModal.svelte` and the document-action header in `DocsViewer.svelte` only if the additional churn is justified.
- Decide whether the remaining full-list scan paths in `TaskStore` justify a larger indexing/cache layer.
- Approve or reject the repository-boundary proposal for `.untask/`, `test-dir/.untask/`, and `docs/plans/`.
