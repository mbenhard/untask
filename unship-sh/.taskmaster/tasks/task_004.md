# Task ID: 4

**Title:** Project Initialization, Locking, and Atomic File IO

**Status:** done

**Dependencies:** 2

**Priority:** high

**Description:** Implement unship init logic, scoped file locking for concurrent safety, and atomic write helpers using temp file + rename pattern.

**Details:**

Create initialization and file safety primitives:

1. Create `crates/unship-core/src/lock.rs`:
```rust
use std::fs::{File, OpenOptions};
use std::path::Path;
use fs2::FileExt;  // Add fs2 to dependencies

pub struct ProjectLock {
    _file: File,
}

impl ProjectLock {
    pub fn acquire(project_root: &Path) -> Result<Self> {
        let lock_path = project_root.join(".unship/.lock");
        let file = OpenOptions::new()
            .create(true)
            .write(true)
            .open(&lock_path)?;
        file.lock_exclusive()?;  // Blocking lock
        Ok(Self { _file: file })
    }
}
// Lock released on drop via fs2
```

2. Create `crates/unship-core/src/fs.rs`:
   - Implement `atomic_write(path: &Path, content: &[u8]) -> Result<()>`
   - Write to temp file in same directory, then rename
   - Handle cleanup on failure

3. Create `crates/unship-core/src/init.rs`:
   - Implement `init(project_root: &Path) -> Result<()>`
   - Create `.unship/tasks/`, `.unship/docs/`, `.unship/attachments/`, `.unship/cache/`
   - Write `.unship/.gitignore` with:
     ```
     .lock
     cache/
     ```
   - Make idempotent: don't fail if directories exist
   - Don't create config.yml (let it use defaults until user customizes)

4. Add `fs2` dependency to Cargo.toml for cross-platform file locking.

**Test Strategy:**

Create `crates/unship-core/tests/init_test.rs`:
1. Test init creates all required directories.
2. Test init is idempotent (running twice succeeds).
3. Test `.unship/.gitignore` contains correct entries.
4. Test lock acquisition succeeds for single holder.
5. Multi-threaded test: spawn threads that acquire lock, verify only one holds at a time (second blocks until first releases).
6. Test atomic write creates file with correct content.
7. Test atomic write doesn't leave temp files on success.
