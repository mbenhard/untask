# Docs Discovery Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make docs discoverable out of the box by scanning both `.untask/docs/` and `docs/`, and add CLI commands to manage doc paths.

**Architecture:** Change default doc globs to include `docs/**/*.md`. Remove the hardcoded `DEFAULT_DOC_GLOB` merge pattern. Add `paths`, `add-path`, `remove-path` subcommands to `untask docs`. Update watcher to use config directly.

**Tech Stack:** Rust, clap, serde_yaml, glob

---

### Task 1: Update default doc globs in config.rs

**Files:**
- Modify: `crates/untask-core/src/config.rs:9` (remove `DEFAULT_DOC_GLOB`)
- Modify: `crates/untask-core/src/config.rs:79-81` (update `default_docs()`)

**Step 1: Update `default_docs()` and remove `DEFAULT_DOC_GLOB`**

Remove the constant:
```rust
// DELETE this line:
pub const DEFAULT_DOC_GLOB: &str = ".untask/docs/**/*.md";
```

Update `default_docs()`:
```rust
fn default_docs() -> Vec<String> {
    vec![
        ".untask/docs/**/*.md".into(),
        "docs/**/*.md".into(),
    ]
}
```

**Step 2: Run tests to see what breaks**

Run: `cargo test -p untask-core 2>&1 | tail -20`
Expected: Compilation errors in `docs.rs` (references `DEFAULT_DOC_GLOB`) and test failures in `config_test.rs`.

---

### Task 2: Simplify doc_patterns() in docs.rs

**Files:**
- Modify: `crates/untask-core/src/docs.rs:4` (remove `DEFAULT_DOC_GLOB` import)
- Modify: `crates/untask-core/src/docs.rs:106-116` (simplify `doc_patterns()`)

**Step 1: Remove import and simplify**

Remove the import of `DEFAULT_DOC_GLOB` from line 4:
```rust
// Change this:
use crate::config::{Config, DEFAULT_DOC_GLOB};
// To this:
use crate::config::Config;
```

Simplify `doc_patterns()`:
```rust
fn doc_patterns(&self) -> &[String] {
    &self.config.docs
}
```

**Step 2: Run core tests**

Run: `cargo test -p untask-core 2>&1 | tail -20`
Expected: Tests compile. `list_always_includes_default_docs_glob` will now FAIL (expected behavior change).

---

### Task 3: Update watcher.rs in desktop app

**Files:**
- Modify: `apps/desktop/src-tauri/src/watcher.rs:13` (remove `DEFAULT_DOC_GLOB` import)
- Modify: `apps/desktop/src-tauri/src/watcher.rs:148` (use `config.docs` directly)
- Modify: `apps/desktop/src-tauri/src/watcher.rs:159-169` (delete `unique_doc_patterns()`)

**Step 1: Remove import**

```rust
// Change this:
use untask_core::config::{Config, DEFAULT_DOC_GLOB};
// To this:
use untask_core::config::Config;
```

**Step 2: Replace `unique_doc_patterns()` usage with `config.docs`**

In `is_relevant_path()` at line 148, change:
```rust
// Change this:
unique_doc_patterns(&config)
    .into_iter()
    .any(|pattern| matches_doc_pattern(relative_path, pattern))
// To this:
config.docs
    .iter()
    .any(|pattern| matches_doc_pattern(relative_path, pattern))
```

**Step 3: Delete `unique_doc_patterns()` function**

Delete the entire function at lines 159-169.

**Step 4: Run desktop tests**

Run: `cargo test -p untask-desktop 2>&1 | tail -30`
Expected: Compiles. `ignores_markdown_outside_default_and_configured_docs` still passes (the test uses `notes/scratch.md` which doesn't match `docs/**/*.md`). `matches_default_docs_glob` still passes (uses `.untask/docs/plan.md`).

---

### Task 4: Fix existing tests

**Files:**
- Modify: `crates/untask-core/tests/docs_test.rs:84-103`
- Modify: `crates/untask-core/tests/config_test.rs:82`

**Step 1: Update `list_always_includes_default_docs_glob` test**

This test validated the old force-merge behavior. Replace it with a test that validates config-is-authoritative:

```rust
#[test]
fn list_uses_config_as_authoritative_source() {
    let tmp = setup();
    write_doc(&tmp, ".untask/docs/guide.md", "# Guide");
    write_doc(&tmp, "docs/architecture.md", "# Architecture");

    // Config only specifies docs/**/*.md — .untask/docs/ should NOT be searched
    let config_content = "docs:\n  - \"docs/**/*.md\"\n";
    std::fs::write(tmp.path().join(".untask/config.yml"), config_content).unwrap();

    let store = DocsStore::new(tmp.path().to_path_buf());
    let docs = store.list().unwrap();

    assert_eq!(docs.len(), 1);
    assert_eq!(docs[0].basename, "architecture.md");
}
```

**Step 2: Update `invalid_doc_globs_in_config_fall_back_to_defaults` test**

At line 82 of `config_test.rs`, change:
```rust
// Change this:
assert_eq!(config.docs, vec![".untask/docs/**/*.md"]);
// To this:
assert_eq!(config.docs, vec![".untask/docs/**/*.md", "docs/**/*.md"]);
```

**Step 3: Run all core tests**

Run: `cargo test -p untask-core`
Expected: All tests pass.

**Step 4: Commit**

```bash
git add crates/untask-core/src/config.rs crates/untask-core/src/docs.rs crates/untask-core/tests/docs_test.rs crates/untask-core/tests/config_test.rs apps/desktop/src-tauri/src/watcher.rs
git commit -m "$(cat <<'EOF'
Change default doc globs to include docs/**/*.md

The default was only .untask/docs/**/*.md which meant projects with a
standard docs/ folder saw no documents. Now both paths are scanned by
default. Config is authoritative -- no hidden merging with hardcoded
defaults.

Also simplifies doc_patterns() and removes duplicate logic in watcher.rs.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Add CLI subcommands (paths, add-path, remove-path)

**Files:**
- Modify: `crates/untask-cli/src/cli.rs:136-145` (add new `DocsCommands` variants)

**Step 1: Add new variants to `DocsCommands`**

```rust
#[derive(Debug, Subcommand)]
pub enum DocsCommands {
    /// List all docs
    List,

    /// Show a doc by name
    Show {
        /// Doc name or path
        name: String,
    },

    /// List active doc globs
    Paths,

    /// Add a doc glob pattern
    AddPath {
        /// Glob pattern (e.g. "specs/**/*.md")
        pattern: String,
    },

    /// Remove a doc glob pattern
    RemovePath {
        /// Glob pattern to remove
        pattern: String,
    },
}
```

**Step 2: Verify CLI parsing compiles**

Run: `cargo check -p untask-cli`
Expected: Compiles with warnings about unmatched patterns in `main.rs`.

---

### Task 6: Implement docs path commands

**Files:**
- Modify: `crates/untask-cli/src/commands/docs.rs` (add `paths`, `add_path`, `remove_path`)

**Step 1: Add the three command implementations**

Append to `commands/docs.rs`:

```rust
pub fn paths(root: &Path, json: bool) -> Result<()> {
    let config = Config::load(root);

    if json {
        println!("{}", serde_json::to_string_pretty(&config.docs)?);
    } else if config.docs.is_empty() {
        println!("No doc paths configured.");
    } else {
        for pattern in &config.docs {
            println!("  {pattern}");
        }
    }

    Ok(())
}

pub fn add_path(root: &Path, pattern: &str, json: bool) -> Result<()> {
    let mut config = Config::load(root);

    if config.docs.iter().any(|p| p == pattern) {
        if json {
            println!("{}", serde_json::json!({ "status": "already_exists", "pattern": pattern }));
        } else {
            println!("Pattern already configured: {pattern}");
        }
        return Ok(());
    }

    config.docs.push(pattern.to_string());
    config.validate_doc_globs()?;
    config.save(root)?;

    if json {
        println!("{}", serde_json::json!({ "status": "added", "pattern": pattern, "docs": config.docs }));
    } else {
        println!("Added: {pattern}");
    }

    Ok(())
}

pub fn remove_path(root: &Path, pattern: &str, json: bool) -> Result<()> {
    let mut config = Config::load(root);

    let before_len = config.docs.len();
    config.docs.retain(|p| p != pattern);

    if config.docs.len() == before_len {
        return Err(UntaskError::InvalidConfig(format!(
            "pattern not found: {pattern}"
        )));
    }

    config.save(root)?;

    if json {
        println!("{}", serde_json::json!({ "status": "removed", "pattern": pattern, "docs": config.docs }));
    } else {
        println!("Removed: {pattern}");
        if config.docs.is_empty() {
            println!("No doc paths configured. Use `untask docs add-path` to add one.");
        }
    }

    Ok(())
}
```

Also add the necessary imports at the top of `commands/docs.rs`:

```rust
use untask_core::config::Config;
use untask_core::error::UntaskError;
```

**Step 2: Verify it compiles**

Run: `cargo check -p untask-cli`
Expected: Compiles (with warnings about unused imports until wiring).

---

### Task 7: Wire new subcommands in main.rs

**Files:**
- Modify: `crates/untask-cli/src/main.rs:115-120` (add match arms)

**Step 1: Update the docs match block**

```rust
Commands::Docs { cmd: subcmd } => match subcmd {
    Some(DocsCommands::Show { name }) => {
        commands::docs::show(&root, name, cli.json)
    }
    Some(DocsCommands::Paths) => commands::docs::paths(&root, cli.json),
    Some(DocsCommands::AddPath { pattern }) => {
        commands::docs::add_path(&root, pattern, cli.json)
    }
    Some(DocsCommands::RemovePath { pattern }) => {
        commands::docs::remove_path(&root, pattern, cli.json)
    }
    Some(DocsCommands::List) | None => commands::docs::list(&root, cli.json),
},
```

**Step 2: Run full test suite**

Run: `cargo test -p untask-cli -p untask-core 2>&1 | tail -10`
Expected: All tests pass.

**Step 3: Manual smoke test**

```bash
cargo run -p untask -- docs paths
cargo run -p untask -- docs
```

Expected: `docs paths` shows the two defaults. `docs` lists actual docs from both `docs/` and `.untask/docs/`.

**Step 4: Commit**

```bash
git add crates/untask-cli/src/cli.rs crates/untask-cli/src/commands/docs.rs crates/untask-cli/src/main.rs
git commit -m "$(cat <<'EOF'
Add docs path management: paths, add-path, remove-path

New CLI commands to manage doc glob patterns without editing YAML:
- untask docs paths: list active globs
- untask docs add-path: add a glob pattern
- untask docs remove-path: remove a glob pattern

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Add tests for new CLI commands

**Files:**
- Modify: `crates/untask-cli/tests/commands_test.rs` (add tests after docs section)
- Modify: `crates/untask-cli/src/cli.rs` (add parsing test)

**Step 1: Add CLI parsing tests**

In `crates/untask-cli/src/cli.rs`, add to the existing `tests` module:

```rust
#[test]
fn parses_docs_path_subcommands() {
    let paths = Cli::try_parse_from(["untask", "docs", "paths"]).unwrap();
    assert!(matches!(
        paths.command,
        Some(Commands::Docs { cmd: Some(DocsCommands::Paths) })
    ));

    let add = Cli::try_parse_from(["untask", "docs", "add-path", "specs/**/*.md"]).unwrap();
    assert!(matches!(
        add.command,
        Some(Commands::Docs { cmd: Some(DocsCommands::AddPath { pattern }) }) if pattern == "specs/**/*.md"
    ));

    let remove = Cli::try_parse_from(["untask", "docs", "remove-path", "docs/**/*.md"]).unwrap();
    assert!(matches!(
        remove.command,
        Some(Commands::Docs { cmd: Some(DocsCommands::RemovePath { pattern }) }) if pattern == "docs/**/*.md"
    ));
}
```

**Step 2: Add integration tests**

In `crates/untask-cli/tests/commands_test.rs`, add after the existing docs tests:

```rust
#[test]
fn docs_paths_shows_default_globs() {
    let tmp = TempDir::new().unwrap();
    init_project(tmp.path());

    let (stdout, _, ok) = run_in(tmp.path(), &["docs", "paths"]);
    assert!(ok);
    assert!(stdout.contains(".untask/docs/**/*.md"));
    assert!(stdout.contains("docs/**/*.md"));
}

#[test]
fn docs_paths_json() {
    let tmp = TempDir::new().unwrap();
    init_project(tmp.path());

    let (stdout, _, ok) = run_in(tmp.path(), &["--json", "docs", "paths"]);
    assert!(ok);
    let parsed: Vec<String> = serde_json::from_str(&stdout).unwrap();
    assert!(parsed.contains(&".untask/docs/**/*.md".to_string()));
    assert!(parsed.contains(&"docs/**/*.md".to_string()));
}

#[test]
fn docs_add_path_and_remove_path() {
    let tmp = TempDir::new().unwrap();
    init_project(tmp.path());

    // Add a new path
    let (stdout, _, ok) = run_in(tmp.path(), &["docs", "add-path", "specs/**/*.md"]);
    assert!(ok);
    assert!(stdout.contains("Added: specs/**/*.md"));

    // Verify it shows up in paths
    let (stdout, _, ok) = run_in(tmp.path(), &["docs", "paths"]);
    assert!(ok);
    assert!(stdout.contains("specs/**/*.md"));

    // Adding again is a no-op
    let (stdout, _, ok) = run_in(tmp.path(), &["docs", "add-path", "specs/**/*.md"]);
    assert!(ok);
    assert!(stdout.contains("already configured"));

    // Remove it
    let (stdout, _, ok) = run_in(tmp.path(), &["docs", "remove-path", "specs/**/*.md"]);
    assert!(ok);
    assert!(stdout.contains("Removed: specs/**/*.md"));

    // Verify it's gone
    let (stdout, _, ok) = run_in(tmp.path(), &["docs", "paths"]);
    assert!(ok);
    assert!(!stdout.contains("specs/**/*.md"));
}

#[test]
fn docs_add_path_rejects_absolute_path() {
    let tmp = TempDir::new().unwrap();
    init_project(tmp.path());

    let (_, stderr, ok) = run_in(tmp.path(), &["docs", "add-path", "/tmp/docs/**/*.md"]);
    assert!(!ok);
    assert!(stderr.contains("absolute"));
}

#[test]
fn docs_remove_path_errors_on_unknown_pattern() {
    let tmp = TempDir::new().unwrap();
    init_project(tmp.path());

    let (_, stderr, ok) = run_in(tmp.path(), &["docs", "remove-path", "nonexistent/**/*.md"]);
    assert!(!ok);
    assert!(stderr.contains("not found"));
}
```

**Step 3: Run all tests**

Run: `cargo test -p untask-cli -p untask-core`
Expected: All tests pass.

**Step 4: Commit**

```bash
git add crates/untask-cli/src/cli.rs crates/untask-cli/tests/commands_test.rs
git commit -m "$(cat <<'EOF'
Add tests for docs path management commands

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Add test for zero-config docs discovery

**Files:**
- Modify: `crates/untask-core/tests/docs_test.rs` (add test)
- Modify: `crates/untask-cli/tests/commands_test.rs` (add test)

**Step 1: Add core test for zero-config discovering docs/**

```rust
#[test]
fn list_discovers_docs_folder_with_no_config() {
    let tmp = setup();
    write_doc(&tmp, "docs/readme.md", "# Readme");
    write_doc(&tmp, "docs/plans/roadmap.md", "# Roadmap");

    let store = DocsStore::new(tmp.path().to_path_buf());
    let docs = store.list().unwrap();

    assert_eq!(docs.len(), 2);
    let basenames: Vec<&str> = docs.iter().map(|d| d.basename.as_str()).collect();
    assert!(basenames.contains(&"readme.md"));
    assert!(basenames.contains(&"roadmap.md"));
}
```

**Step 2: Add CLI test for zero-config docs list**

```rust
#[test]
fn docs_list_discovers_docs_folder_without_config() {
    let tmp = TempDir::new().unwrap();
    init_project(tmp.path());
    write_doc(tmp.path(), "docs/guide.md", "# Guide\n");

    let (stdout, _, ok) = run_in(tmp.path(), &["docs"]);
    assert!(ok);
    assert!(stdout.contains("docs/guide.md"));
}
```

**Step 3: Run all tests**

Run: `cargo test -p untask-cli -p untask-core`
Expected: All tests pass.

**Step 4: Commit**

```bash
git add crates/untask-core/tests/docs_test.rs crates/untask-cli/tests/commands_test.rs
git commit -m "$(cat <<'EOF'
Add tests for zero-config docs/ folder discovery

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```
