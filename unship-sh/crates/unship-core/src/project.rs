use std::path::{Path, PathBuf};

use crate::error::{Result, UnshipError};

/// Walk upward from `start` to find the nearest directory containing `.unship/`.
pub fn find_project_root(start: &Path) -> Result<PathBuf> {
    let mut current = start.to_path_buf();
    loop {
        if current.join(".unship").is_dir() {
            return Ok(current);
        }
        if !current.pop() {
            return Err(UnshipError::NotInitialized);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn finds_root_in_current_dir() {
        let tmp = TempDir::new().unwrap();
        std::fs::create_dir(tmp.path().join(".unship")).unwrap();
        let root = find_project_root(tmp.path()).unwrap();
        assert_eq!(root, tmp.path());
    }

    #[test]
    fn finds_root_in_parent_dir() {
        let tmp = TempDir::new().unwrap();
        std::fs::create_dir(tmp.path().join(".unship")).unwrap();
        let child = tmp.path().join("sub/deep");
        std::fs::create_dir_all(&child).unwrap();
        let root = find_project_root(&child).unwrap();
        assert_eq!(root, tmp.path());
    }

    #[test]
    fn returns_not_initialized_when_missing() {
        let tmp = TempDir::new().unwrap();
        let err = find_project_root(tmp.path()).unwrap_err();
        assert!(matches!(err, UnshipError::NotInitialized));
    }
}
