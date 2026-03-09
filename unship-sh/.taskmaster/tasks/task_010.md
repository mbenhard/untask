# Task ID: 10

**Title:** Core Task CLI Commands

**Status:** pending

**Dependencies:** 5, 9

**Priority:** high

**Description:** Implement init, add, list, show, edit, status, done, and delete commands wiring to the core store layer with proper output formatting.

**Details:**

Implement the primary task management commands:

1. Create `crates/unship-cli/src/commands/mod.rs` with submodules.

2. Implement each command:

**init**: Create .unship/ structure, print success message.

**add**: 
```rust
pub fn add(title: &str, status: Option<&str>, json: bool) -> Result<()> {
    let root = find_project_root()?;
    let store = TaskStore::new(root)?;
    let task = store.add(title, status)?;
    if json {
        println!("{}", serde_json::to_string_pretty(&task)?);
    } else {
        println!("Created task #{}: {}", task.id.unwrap(), task.title);
    }
    Ok(())
}
```

**list**: Display tasks in table format, support --status, --tag, and --priority filters plus stable sort options for priority, updated, created, or title.

**show**: Display single task with full details, body rendered.

**edit**: Open task file in $EDITOR (fallback: vim, nano).

**status**: Change task status, normalize to canonical ID.

**done**: Shortcut for `status <ref> done`.

**delete**: Remove task file with confirmation (unless --force).

3. Output formatting:
   - Respect --json for structured output
   - Respect --no-color and NO_COLOR env
   - Keep error messages concise and actionable

**Test Strategy:**

Create integration tests in `crates/unship-cli/tests/`:
1. Test full workflow: init → add → list → show → status → done → delete.
2. Test add creates file in .unship/tasks/ with correct format.
3. Test list displays all tasks.
4. Test list --status filters correctly.
5. Test list --tag filters correctly.
6. Test list --priority filters correctly.
7. Test list sort options are stable for priority, updated, created, and title.
8. Test list --json outputs valid JSON array.
9. Test show displays task details.
10. Test show --json outputs valid JSON object.
11. Test status changes task status and normalizes aliases.
12. Test done sets status to 'done' and adds completed timestamp.
13. Test delete removes the task file.
14. Test commands fail gracefully when not initialized.
