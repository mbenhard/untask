# Column Management Design

## Summary

Columns are per-project, stored in `.unship/config.yml`. Users pick a preset or create custom columns at init time. Columns can be added, renamed, reordered, and deleted after setup — from both CLI and desktop.

## Data Model

Columns use the existing `Column { id, aliases }` structure in config. One addition: a `done` boolean flag to mark terminal columns (for `completed` timestamp behavior).

```yaml
columns:
  - id: backlog
  - id: todo
    aliases: [to-do, pending]
  - id: in-progress
    aliases: [wip, doing]
  - id: done
    aliases: [complete, finished]
    done: true
```

### Column struct change

```rust
pub struct Column {
    pub id: String,
    #[serde(default)]
    pub aliases: Vec<String>,
    #[serde(default)]
    pub done: bool, // NEW — marks terminal/completed columns
}
```

When `done: true`, tasks moved into this column get `completed` set. Tasks moved out get `completed` cleared. This replaces the current hardcoded `== "done"` check in `store.rs:apply_status_change`.

### Config persistence

Add `Config::save()` to write config back to `.unship/config.yml`. Currently config is read-only — all column operations need this.

```rust
impl Config {
    pub fn save(&self, project_root: &Path) -> Result<()> {
        let config_path = project_root.join(".unship/config.yml");
        let content = serde_yaml::to_string(self)?;
        atomic_write(&config_path, content.as_bytes())?;
        Ok(())
    }
}
```

## Init Flow

Both CLI and desktop share the same core logic:

1. User picks a preset OR creates custom columns
2. `init()` creates directories (existing behavior) AND writes chosen columns to `.unship/config.yml` (new behavior)
3. No choice = current defaults (Kanban preset)

### Presets (hardcoded, not a config system)

- **Simple** — todo, in-progress, done
- **Kanban** — backlog, todo, in-progress, review, done (current default)
- **Bug tracking** — reported, confirmed, fixing, testing, resolved
- **Custom** — user defines their own list

All presets mark their last column as `done: true`.

### Existing project

- If `.unship/config.yml` exists with columns, skip the preset picker
- `unship init --reset-columns` to re-pick

## Column Operations

All operations acquire the project lock, modify config, and call `Config::save()`.

### Add

- Append to end by default, or insert at position
- CLI: `unship column add <name> [--after <column>] [--done]`
- Validate: no duplicate IDs, no collision with existing aliases

### Rename

- Changes column ID in config, then batch-updates all task files with the old status
- Old name added to `aliases` automatically (so unmatched tasks still resolve)
- Batch update: iterate all tasks under project lock, rewrite any task where `status == old_name`
- CLI: `unship column rename <old> <new>`
- Reject if new name collides with existing ID or alias

### Reorder

- Move column to new position
- CLI: `unship column move <name> --after <column>` or `--before <column>`
- Desktop: drag-and-drop on column headers
- Config-only change, no task files modified

### Delete

- CLI: `unship column delete <name> [--move-to <column>] [--delete-tasks]`
  - Tasks exist + no flag = prompt (interactive) or error (non-interactive)
  - `--move-to` migrates tasks: batch-updates status on all affected task files
  - `--delete-tasks` removes task files belonging to that column
- Desktop: dialog with "move to [picker]" or "delete tasks" options
- Blocked if it's the last remaining column

## Tauri Commands (Desktop)

New Tauri commands to expose column operations to the frontend:

```rust
#[tauri::command]
fn column_add(name: String, after: Option<String>, done: Option<bool>) -> Result<Vec<ColumnDto>>;

#[tauri::command]
fn column_rename(old: String, new: String) -> Result<Vec<ColumnDto>>;

#[tauri::command]
fn column_move(name: String, after: Option<String>, before: Option<String>) -> Result<Vec<ColumnDto>>;

#[tauri::command]
fn column_delete(name: String, move_to: Option<String>, delete_tasks: bool) -> Result<Vec<ColumnDto>>;
```

All return the updated column list so the frontend can refresh immediately.

## Constraints

- Minimum 1 column at all times
- Column IDs: lowercase, kebab-case
- First column in the list = default status for new tasks
- At least one column should have `done: true` (warn if not, don't block)

## Edge Cases

### Unmatched statuses

Already handled — unmatched bucket on Kanban board. After rename, old name becomes alias so no orphans.

### Terminal column detection

The `done` flag on `Column` replaces the hardcoded `== "done"` check. Multiple columns can be terminal (e.g. "done" and "cancelled" both set `completed`). If no column has `done: true`, the `completed` timestamp is never auto-set — user must manage it manually.

### Init on existing project

Idempotent for directories. If `.unship/config.yml` exists, don't overwrite unless `--reset-columns`. Existing configs without the `done` field default to `false` via `#[serde(default)]` — backward compatible.

### Desktop first launch

No `.unship/` directory = show preset picker inline before loading board. Config exists = load directly.

### Concurrent edits (CLI + desktop)

Config read from disk each time. Desktop reloads config on window focus. Write operations acquire project lock to prevent races.

### Batch task migration atomicity

Rename and delete-with-move iterate all tasks under a single project lock hold. If a write fails mid-batch, already-written files keep their new status (old name is in aliases, so they still resolve). This is acceptable — partial migration doesn't orphan tasks.

### Validation

Empty names, whitespace, duplicates all rejected. Column ID must be non-empty, trimmed, kebab-case. New column ID must not collide with any existing column ID or alias.
