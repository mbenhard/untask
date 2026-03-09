use std::path::Path;

use crate::config::Config;
use crate::error::{Result, UntaskError};
use crate::lock::ProjectLock;
use crate::store::TaskStore;

#[derive(Debug)]
pub struct ColumnOperationResult {
    pub config: Config,
    pub migrated_tasks: u32,
    pub deleted_tasks: u32,
}

pub fn add_column(
    project_root: &Path,
    name: &str,
    after: Option<&str>,
    done: bool,
) -> Result<ColumnOperationResult> {
    let _lock = ProjectLock::acquire(project_root)?;
    let mut config = Config::load_strict(project_root)?;
    config.column_add(name, after, done)?;
    config.save(project_root)?;
    Ok(ColumnOperationResult {
        config,
        migrated_tasks: 0,
        deleted_tasks: 0,
    })
}

pub fn move_column(
    project_root: &Path,
    name: &str,
    after: Option<&str>,
    before: Option<&str>,
) -> Result<ColumnOperationResult> {
    let _lock = ProjectLock::acquire(project_root)?;
    let mut config = Config::load_strict(project_root)?;
    config.column_move(name, after, before)?;
    config.save(project_root)?;
    Ok(ColumnOperationResult {
        config,
        migrated_tasks: 0,
        deleted_tasks: 0,
    })
}

pub fn rename_column(project_root: &Path, old: &str, new: &str) -> Result<ColumnOperationResult> {
    let _lock = ProjectLock::acquire(project_root)?;
    let mut config = Config::load_strict(project_root)?;
    let (old_id, new_id) = config.column_rename(old, new)?;
    config.save(project_root)?;

    let store = TaskStore::with_config(project_root.to_path_buf(), config.clone());
    let migrated_tasks = store.migrate_tasks_status_locked(&old_id, &new_id)?;

    Ok(ColumnOperationResult {
        config,
        migrated_tasks,
        deleted_tasks: 0,
    })
}

pub fn delete_column(
    project_root: &Path,
    name: &str,
    move_to: Option<&str>,
    delete_tasks: bool,
) -> Result<ColumnOperationResult> {
    let _lock = ProjectLock::acquire(project_root)?;
    let mut config = Config::load_strict(project_root)?;
    let col_id = config
        .normalize_status(name)
        .ok_or_else(|| UntaskError::InvalidConfig(format!("column not found: {name}")))?;
    let store = TaskStore::with_config(project_root.to_path_buf(), config.clone());
    let task_count = store.count_tasks_in_column(&col_id)?;

    if task_count > 0 && move_to.is_none() && !delete_tasks {
        return Err(UntaskError::InvalidConfig(format!(
            "column '{}' has {} task(s). Use --move-to <column> or --delete-tasks",
            col_id, task_count
        )));
    }

    let target_status = move_to
        .map(|target| {
            config
                .normalize_status(target)
                .ok_or_else(|| UntaskError::InvalidConfig(format!("column not found: {target}")))
        })
        .transpose()?;

    if target_status.as_deref() == Some(col_id.as_str()) {
        return Err(UntaskError::InvalidConfig(format!(
            "cannot move tasks into the same column being deleted: {col_id}"
        )));
    }

    let migrated_tasks = if let Some(target) = target_status.as_deref() {
        store.migrate_tasks_status_locked(&col_id, target)?
    } else {
        0
    };

    let deleted_tasks = if delete_tasks {
        store.delete_tasks_by_status_locked(&col_id)?
    } else {
        0
    };

    config.column_delete(&col_id)?;
    config.save(project_root)?;

    Ok(ColumnOperationResult {
        config,
        migrated_tasks,
        deleted_tasks,
    })
}
