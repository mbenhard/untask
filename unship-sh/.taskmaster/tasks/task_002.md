# Task ID: 2

**Title:** Config, Errors, and Shared Domain Types

**Status:** done

**Dependencies:** 1

**Priority:** high

**Description:** Define typed errors, configuration structures (Config, Column, Theme), and shared domain types with proper validation rules for doc globs and fallback defaults.

**Details:**

Create the foundational types and error handling:

1. Create `crates/unship-core/src/error.rs`:
```rust
use thiserror::Error;

#[derive(Error, Debug)]
pub enum UnshipError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    
    #[error("YAML parse error: {0}")]
    YamlParse(#[from] serde_yaml::Error),
    
    #[error("JSON parse error: {0}")]
    JsonParse(#[from] serde_json::Error),
    
    #[error("Invalid configuration: {0}")]
    InvalidConfig(String),
    
    #[error("Project not initialized - run 'unship init' first")]
    NotInitialized,
    
    #[error("Task not found: {0}")]
    TaskNotFound(String),
    
    #[error("Ambiguous reference '{0}': matches {1}")]
    Ambiguous(String, String),
    
    #[error("Repair failed: {0}")]
    RepairFailed(String),
    
    #[error("Lock acquisition failed: {0}")]
    LockFailed(String),
}

pub type Result<T> = std::result::Result<T, UnshipError>;
```

2. Create `crates/unship-core/src/types.rs` with Theme enum (`mono`, `color`, `none`), Priority enum, and shared DTOs.

3. Create `crates/unship-core/src/config.rs`:
   - Define `Column` struct with `id: String` and `aliases: Vec<String>`
   - Define `Config` struct with `columns`, `docs`, `theme`
   - Implement `Config::load(project_root: &Path)` with fallback to defaults
   - Implement `Config::default()` with 5 standard columns
   - Validate doc globs: reject absolute paths, reject `../` traversal
   - Return default config on missing or invalid file (don't error)

4. Update `lib.rs` to export modules.

Default columns: backlog, todo, in-progress, review, done (with aliases per design doc).

**Test Strategy:**

Create `crates/unship-core/tests/config_test.rs`:
1. Test `Config::default()` returns expected 5 columns with correct aliases.
2. Test loading valid config.yml with custom columns.
3. Test invalid config.yml falls back to defaults (graceful degradation).
4. Test missing config.yml returns defaults.
5. Test absolute doc glob paths are rejected with `InvalidConfig` error.
6. Test `../` traversal in doc globs is rejected.
7. Test valid relative doc globs are accepted.
