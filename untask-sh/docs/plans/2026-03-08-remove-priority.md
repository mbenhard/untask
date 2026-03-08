# Remove Priority from Untask

**Date:** 2026-03-08
**Decision:** Priority (low/medium/high/urgent) is unused and adds unnecessary complexity. Remove it entirely.

## Context

- Only one user (developer) currently uses the app
- Priority was never used in practice — tasks are either batch-processed or cherry-picked manually
- The 4-level priority system solves the wrong problem; if smart ordering is ever needed, it should be dependency/context-aware, not a manual label
- A simple pin/star can be added later if "flag this task" becomes a real need

## Scope

### Desktop UI (Svelte)

- [ ] Delete `PriorityDot.svelte`
- [ ] Remove priority cycling button from `TaskModal.svelte`
- [ ] Remove priority cycling from `TaskList.svelte`
- [ ] Remove priority dot from Kanban cards in `Kanban.svelte`
- [ ] Remove priority metadata row from `TaskDetail.svelte`
- [ ] Remove priority dot from `ReviewView.svelte`
- [ ] Replace `bg-priority-medium` in `App.svelte` (health indicator dot) with `bg-border`
- [ ] Remove priority color CSS tokens from `app.css` (`--color-priority-low/medium/high`)
- [ ] Remove `Priority` type from `api.ts`

### Tauri Commands (`apps/desktop/src-tauri/`)

- [ ] Remove `Priority` import from `commands.rs`
- [ ] Remove `priority` field from `TaskDto` and `TaskUpdateDto`
- [ ] Remove `priority` pass-through in `update_task` handler

### Rust Core (`untask-core`)

- [ ] Remove `Priority` enum from `types.rs`
- [ ] Remove `priority` field from `Task` struct in `task.rs`
- [ ] Update `next.rs` sort: `b.updated.cmp(&a.updated)` only
- [ ] Remove priority from serialization/deserialization logic

### Rust CLI (`untask-cli`)

- [ ] Remove `--priority` filter flag from `list` command
- [ ] Remove `priority` from `--sort` options and valid sort fields error message
- [ ] Remove `priority_marker()` and `format_priority()` from `output.rs`
- [ ] Update CLI help text

### Tests

- [ ] `next_test.rs` — rewrite `next_includes_open_tasks_sorted_by_priority` to test updated-descending sort
- [ ] `store_test.rs` — delete `update_can_clear_priority` test
- [ ] `task_test.rs` — update `parse_rich_task` assertion (remove priority check)
- [ ] `cli.rs` — update `parses_global_flags` pattern match (remove `priority: None`)
- [ ] `output.rs` — delete `priority_marker_mapping` test; update `color_task_rows_keep_plain_alignment_after_stripping_ansi`
- [ ] `commands_test.rs` — delete `list_filters_by_priority`, `list_sort_by_priority_is_stable`; update `next_outputs_formatted_sections_and_json`
- [ ] `cli_snapshot_test.rs` — remove priority from `setup_project_with_tasks`
- [ ] Regenerate snapshots: `cargo insta review` (`*__list_json.snap`, `*__show_json.snap`)

### Docs

- [ ] `docs/untask-design-language.md` — remove priority dot/color references
- [ ] `CLAUDE.md` — remove "Tiny priority dots" from design language summary

### Task Files (Markdown)

- No migration script needed — serde skips unknown fields on read
- On next write, `priority:` lines are silently dropped (lazy migration)

## Sort Order After Removal

`next` command: **updated descending** (most recently touched task first)
`list` default: by ID (unchanged)
