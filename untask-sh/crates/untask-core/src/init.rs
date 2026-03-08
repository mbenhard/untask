use std::fs;
use std::path::Path;

use crate::config::{Column, Config};
use crate::error::Result;
use crate::fs::atomic_write;
use crate::lock::ProjectLock;

/// Initialize an untask project. Idempotent — safe to call repeatedly.
/// If `columns` is provided and no config exists yet, writes them to config.yml.
pub fn init(project_root: &Path, columns: Option<Vec<Column>>) -> Result<()> {
    let untask = project_root.join(".untask");
    fs::create_dir_all(&untask)?;

    let _lock = ProjectLock::acquire(project_root)?;
    let dirs = [
        untask.join("tasks"),
        untask.join("docs"),
        untask.join("attachments"),
        untask.join("cache"),
    ];
    for dir in &dirs {
        fs::create_dir_all(dir)?;
    }

    let gitignore_path = untask.join(".gitignore");
    atomic_write(&gitignore_path, b".lock\ncache/\nattachments/\n")?;

    // Write config.yml if it doesn't exist yet
    let config_path = untask.join("config.yml");
    if !config_path.exists() {
        let config = if let Some(cols) = columns {
            Config::with_columns(cols)
        } else {
            Config::default()
        };
        config.save(project_root)?;
    }

    Ok(())
}
