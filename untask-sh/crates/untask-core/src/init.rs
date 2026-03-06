use std::fs;
use std::path::Path;

use crate::error::Result;
use crate::fs::atomic_write;
use crate::lock::ProjectLock;

/// Initialize an untask project. Idempotent — safe to call repeatedly.
pub fn init(project_root: &Path) -> Result<()> {
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
    atomic_write(&gitignore_path, b".lock\ncache/\n")?;

    Ok(())
}
