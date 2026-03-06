use std::fs::{File, OpenOptions};
use std::path::Path;

use fs2::FileExt;

use crate::error::{Result, UntaskError};

pub struct ProjectLock {
    _file: File,
}

impl ProjectLock {
    /// Acquire an exclusive lock on `.untask/.lock`. Blocks until available.
    pub fn acquire(project_root: &Path) -> Result<Self> {
        let untask_dir = project_root.join(".untask");
        if !untask_dir.is_dir() {
            return Err(UntaskError::NotInitialized);
        }

        let lock_path = untask_dir.join(".lock");
        let file = OpenOptions::new()
            .create(true)
            .read(true)
            .write(true)
            .truncate(false)
            .open(&lock_path)
            .map_err(|e| UntaskError::LockFailed(e.to_string()))?;
        file.lock_exclusive()
            .map_err(|e| UntaskError::LockFailed(e.to_string()))?;
        Ok(Self { _file: file })
    }
}
// Lock released on drop via fs2
