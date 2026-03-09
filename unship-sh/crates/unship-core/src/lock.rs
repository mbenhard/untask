use std::fs::{File, OpenOptions};
use std::path::Path;

use fs2::FileExt;

use crate::error::{Result, UnshipError};

pub struct ProjectLock {
    _file: File,
}

impl ProjectLock {
    /// Acquire an exclusive lock on `.unship/.lock`. Blocks until available.
    pub fn acquire(project_root: &Path) -> Result<Self> {
        let unship_dir = project_root.join(".unship");
        if !unship_dir.is_dir() {
            return Err(UnshipError::NotInitialized);
        }

        let lock_path = unship_dir.join(".lock");
        let file = OpenOptions::new()
            .create(true)
            .read(true)
            .write(true)
            .truncate(false)
            .open(&lock_path)
            .map_err(|e| UnshipError::LockFailed(e.to_string()))?;
        file.lock_exclusive()
            .map_err(|e| UnshipError::LockFailed(e.to_string()))?;
        Ok(Self { _file: file })
    }
}
// Lock released on drop via fs2
