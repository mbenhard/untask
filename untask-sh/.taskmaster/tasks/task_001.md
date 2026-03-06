# Task ID: 1

**Title:** Root Workspace Scaffold

**Status:** done

**Dependencies:** None

**Priority:** high

**Description:** Initialize the Rust workspace at the repository root with placeholder crates for untask-core and untask-cli, workspace dependencies, and proper .gitignore entries.

**Details:**

Create the foundational Rust workspace structure:

1. Create root `Cargo.toml` with workspace configuration:
```toml
[workspace]
resolver = "2"
members = ["crates/untask-core", "crates/untask-cli"]

[workspace.dependencies]
serde = { version = "1.0", features = ["derive"] }
serde_yaml = "0.9"
serde_json = "1.0"
chrono = { version = "0.4", features = ["serde"] }
thiserror = "2.0"
tempfile = "3.0"
```

2. Create `crates/untask-core/Cargo.toml`:
```toml
[package]
name = "untask-core"
version = "0.1.0"
edition = "2024"

[dependencies]
serde.workspace = true
serde_yaml.workspace = true
serde_json.workspace = true
chrono.workspace = true
thiserror.workspace = true

[dev-dependencies]
tempfile.workspace = true
```

3. Create `crates/untask-core/src/lib.rs` with module declarations.

4. Create `crates/untask-cli/Cargo.toml` with clap dependency.

5. Create `crates/untask-cli/src/main.rs` with placeholder main function.

6. Update root `.gitignore` to include:
   - `/target/`
   - `Cargo.lock` (optional, can be committed)
   - `.untask/cache/`
   - `.untask/.lock`

7. Create empty directories: `apps/desktop/`, `.github/workflows/`.

Do NOT run `git init` - the repository already exists.

**Test Strategy:**

1. Run `cargo build --workspace` - should compile successfully with no errors.
2. Run `cargo test --workspace` - should pass (no tests yet, but no failures).
3. Verify no nested `.git/` directory exists.
4. Verify directory structure matches the repository layout spec:
   - `crates/untask-core/`
   - `crates/untask-cli/`
   - `apps/desktop/` (empty placeholder)
   - `.github/workflows/` (empty placeholder)
