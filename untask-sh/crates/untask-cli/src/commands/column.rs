use std::path::Path;

use untask_core::config::Config;
use untask_core::error::{Result, UntaskError};
use untask_core::store::TaskStore;

pub fn list(root: &Path, json: bool) -> Result<()> {
    let config = Config::load(root);
    if json {
        println!("{}", serde_json::to_string_pretty(&config.columns)?);
    } else {
        for (i, col) in config.columns.iter().enumerate() {
            let done_marker = if col.done { " (done)" } else { "" };
            let default_marker = if i == 0 { " (default)" } else { "" };
            println!("{}{}{}", col.id, done_marker, default_marker);
        }
    }
    Ok(())
}

pub fn add(root: &Path, name: &str, after: Option<&str>, done: bool, json: bool) -> Result<()> {
    let mut config = Config::load(root);
    let id = config.column_add(name, after, done)?;
    config.save(root)?;

    if json {
        println!("{}", serde_json::to_string_pretty(&config.columns)?);
    } else {
        println!("Added column '{}'", id);
    }
    Ok(())
}

pub fn rename(store: &mut TaskStore, root: &Path, old: &str, new: &str, json: bool) -> Result<()> {
    let mut config = Config::load(root);
    let (old_id, new_id) = config.column_rename(old, new)?;
    config.save(root)?;

    store.reload_config();
    let count = store.migrate_tasks_status(&old_id, &new_id)?;

    if json {
        println!("{}", serde_json::to_string_pretty(&config.columns)?);
    } else {
        println!("Renamed '{}' -> '{}'", old_id, new_id);
        if count > 0 {
            println!("Migrated {} task(s)", count);
        }
    }
    Ok(())
}

pub fn move_column(root: &Path, name: &str, after: Option<&str>, before: Option<&str>, json: bool) -> Result<()> {
    let mut config = Config::load(root);
    config.column_move(name, after, before)?;
    config.save(root)?;

    if json {
        println!("{}", serde_json::to_string_pretty(&config.columns)?);
    } else {
        println!("Moved column '{}'", name);
    }
    Ok(())
}

pub fn delete(
    store: &mut TaskStore,
    root: &Path,
    name: &str,
    move_to: Option<&str>,
    delete_tasks: bool,
    json: bool,
) -> Result<()> {
    let mut config = Config::load(root);
    let col_id = config
        .normalize_status(name)
        .ok_or_else(|| UntaskError::InvalidConfig(format!("column not found: {name}")))?;

    let task_count = store.count_tasks_in_column(&col_id)?;

    if task_count > 0 && move_to.is_none() && !delete_tasks {
        return Err(UntaskError::InvalidConfig(format!(
            "column '{}' has {} task(s). Use --move-to <column> or --delete-tasks",
            col_id, task_count
        )));
    }

    if let Some(target) = move_to {
        store.migrate_tasks_status(&col_id, target)?;
    } else if delete_tasks {
        store.delete_tasks_by_status(&col_id)?;
    }

    config.column_delete(&col_id)?;
    config.save(root)?;
    store.reload_config();

    if json {
        println!("{}", serde_json::to_string_pretty(&config.columns)?);
    } else {
        println!("Deleted column '{}'", col_id);
        if task_count > 0 {
            if move_to.is_some() {
                println!("Moved {} task(s)", task_count);
            } else {
                println!("Deleted {} task(s)", task_count);
            }
        }
    }
    Ok(())
}
