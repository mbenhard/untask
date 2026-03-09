use std::path::Path;

use untask_core::columns;
use untask_core::config::Config;
use untask_core::error::{Result, UntaskError};
use untask_core::store::TaskStore;

pub fn list(root: &Path, json: bool) -> Result<()> {
    let config = Config::load_strict(root)?;
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
    let result = columns::add_column(root, name, after, done)?;
    let config = result.config;
    let id = config
        .normalize_status(name)
        .ok_or_else(|| UntaskError::InvalidConfig(format!("column not found: {name}")))?;

    if json {
        println!("{}", serde_json::to_string_pretty(&config.columns)?);
    } else {
        println!("Added column '{}'", id);
    }
    Ok(())
}

pub fn rename(store: &mut TaskStore, root: &Path, old: &str, new: &str, json: bool) -> Result<()> {
    let old_id = Config::load_strict(root)?
        .normalize_status(old)
        .ok_or_else(|| UntaskError::InvalidConfig(format!("column not found: {old}")))?;
    let result = columns::rename_column(root, old, new)?;
    store.reload_config();
    let config = result.config;
    let new_id = config
        .normalize_status(new)
        .ok_or_else(|| UntaskError::InvalidConfig(format!("column not found: {new}")))?;
    let count = result.migrated_tasks;

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

pub fn move_column(
    root: &Path,
    name: &str,
    after: Option<&str>,
    before: Option<&str>,
    json: bool,
) -> Result<()> {
    let result = columns::move_column(root, name, after, before)?;
    let config = result.config;

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
    let col_id = Config::load_strict(root)?
        .normalize_status(name)
        .ok_or_else(|| UntaskError::InvalidConfig(format!("column not found: {name}")))?;
    let result = columns::delete_column(root, name, move_to, delete_tasks)?;
    let config = result.config;
    store.reload_config();

    if json {
        println!("{}", serde_json::to_string_pretty(&config.columns)?);
    } else {
        println!("Deleted column '{}'", col_id);
        if result.migrated_tasks > 0 {
            println!("Moved {} task(s)", result.migrated_tasks);
        }
        if result.deleted_tasks > 0 {
            println!("Deleted {} task(s)", result.deleted_tasks);
        }
    }
    Ok(())
}
