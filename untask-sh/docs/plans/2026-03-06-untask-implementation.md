# Untask v1.0 Implementation Plan

**Goal:** Build Untask as a local-first Rust workspace with a shared core, a single CLI+TUI binary, and a macOS desktop app that all read/write the same `.untask/` project data.

**Design Doc:** `docs/plans/2026-03-06-untask-design.md`

**Status:** Revised after plan review

---

## Scope

v1 includes:

1. Shared Rust core for config, parsing, task/doc storage, repair/indexing, git summary, and search
2. CLI surface for humans and AI agents
3. TUI for kanban/list/docs workflows
4. Tauri macOS app with board, task detail, docs editor, recent projects, and last-project restore
5. Skill installer
6. Release automation for CLI artifacts and preview desktop builds, with signing/notarization deferred until Apple Developer credentials exist

v1 does not include:

1. MCP server
2. Cloud sync
3. Multi-window multi-project desktop support
4. Dependency graphs / Gantt views

---

## Engineering Rules

These rules apply to every phase:

1. **Repository root is the workspace root.** Do not scaffold a nested `untask/` repository.
2. **Reads are side-effect free.** `list`, `show`, search, and UI refreshes must never rename or rewrite task files.
3. **Every mutating filesystem operation acquires `.untask/.lock`.**
4. **Writes are atomic where possible.** Write temp file, then rename.
5. **Configured doc discovery is repo-scoped.** Reject absolute paths and `../` traversal in `config.docs`.
6. **`repair` is the only bulk-normalization path.**
7. **Desktop-specific dependencies must follow current official setup docs.** In practice: use `sv` for Tailwind setup, install/register the Tauri dialog plugin, and keep release packaging aligned with current Tauri 2 signing/notarization flow.
8. **Do not publish a Homebrew cask for the desktop app until signed/notarized builds exist.**

---

## Repository Layout

```text
/
├── Cargo.toml
├── .gitignore
├── crates/
│   ├── untask-core/
│   └── untask-cli/
├── apps/
│   └── desktop/
├── docs/
│   └── plans/
└── .github/
    └── workflows/
```

Key path decisions:

1. `crates/untask-core` contains the shared logic.
2. `crates/untask-cli` builds the `untask` binary for CLI+TUI.
3. `apps/desktop/src-tauri` joins the same Rust workspace.
4. CI workflows live in `.github/workflows/` at the repo root.

---

## Quality Gates

### Global Gates

Run these before closing any implementation batch that changes Rust code:

```bash
cargo fmt --all --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace
```

Run these before closing any batch that changes the desktop app:

```bash
cd apps/desktop
npm install
npm run check
```

### Release Gates

Before claiming release readiness:

1. CLI artifacts build in CI.
2. Desktop app builds in CI on macOS.
3. Desktop builds are explicitly labeled preview-only until Apple Developer credentials exist.

---

## Edge-Case Test Matrix

These scenarios must be covered by tests or smoke checks during implementation:

1. Missing `.untask/` directory
2. Missing or malformed `config.yml`
3. Malformed frontmatter with recoverable body markdown
4. Unknown statuses and alias normalization
5. Unindexed task files with and without frontmatter `id`
6. Duplicate doc basenames across configured doc globs
7. Concurrent `add`, `status`, and `delete`
8. `done` transition setting `completed`, and reopening clearing it
9. Attachments referenced from markdown staying valid after clone
10. File watcher event storms / duplicate refreshes
11. Last-project restore when the directory has been deleted or moved

---

## Phase 1: Core Library

### Task 1: Root Workspace Scaffold

**Files**

1. Create `Cargo.toml`
2. Create `.gitignore`
3. Create `crates/untask-core/Cargo.toml`
4. Create `crates/untask-core/src/lib.rs`
5. Create `crates/untask-cli/Cargo.toml`
6. Create `crates/untask-cli/src/main.rs`
7. Reserve `apps/desktop/` and `.github/workflows/`

**Work**

1. Initialize a Rust workspace at the repository root.
2. Add workspace dependencies for `serde`, `serde_yaml`, `serde_json`, `chrono`, `thiserror`, and test helpers.
3. Create placeholder crates for `untask-core` and `untask-cli`.
4. Add root `.gitignore` entries for Rust, Node, macOS noise, and `.untask/cache/` examples used in local dev.
5. Do **not** run `git init`; this repo already exists.

**Verification**

1. `cargo build --workspace`
2. Confirm there is no nested `.git/`

### Task 2: Config, Errors, and Shared Domain Types

**Files**

1. `crates/untask-core/src/error.rs`
2. `crates/untask-core/src/config.rs`
3. `crates/untask-core/src/types.rs`
4. `crates/untask-core/tests/config_test.rs`

**Work**

1. Define typed errors for IO, YAML/JSON parse failures, invalid config, not initialized, not found, ambiguity, and repair failures.
2. Model `Config`, `Column`, `Theme`, and shared enums/DTOs.
3. Enforce config rules:
   - fallback defaults on missing file
   - graceful fallback on invalid file
   - reject absolute doc globs
   - reject `../` traversal
4. Normalize config loading so every surface gets the same defaults.

**Verification**

1. Tests for default config, valid config, invalid config fallback, and invalid doc glob rejection.

### Task 3: Task Parsing, Serialization, and Metadata Rules

**Files**

1. `crates/untask-core/src/task.rs`
2. `crates/untask-core/src/slug.rs`
3. `crates/untask-core/tests/task_test.rs`

**Work**

1. Implement task parsing from markdown frontmatter + body.
2. Support `title`, `status`, `priority`, `tags`, `created`, `updated`, `completed`, and optional frontmatter `id`.
3. Parse filename-based IDs for managed tasks.
4. Count checklist subtasks for progress display.
5. Generate stable slugs on creation.
6. Distinguish:
   - managed task
   - unindexed task with frontmatter `id`
   - unindexed task without ID
7. Ensure missing `status` defaults to the first configured column when a task is created or normalized through a write path.

**Verification**

1. Tests for minimal/rich task parsing
2. Tests for malformed frontmatter fallback
3. Tests for subtask counting
4. Tests for `completed` / `updated` round-trip
5. Tests for unindexed-task classification

### Task 4: Project Initialization, Locking, and Atomic File IO

**Files**

1. `crates/untask-core/src/init.rs`
2. `crates/untask-core/src/lock.rs`
3. `crates/untask-core/src/fs.rs`
4. `crates/untask-core/tests/init_test.rs`

**Work**

1. Implement `untask init` backing logic.
2. Create `.untask/tasks`, `.untask/docs`, `.untask/attachments`, `.untask/cache`.
3. Write `.untask/.gitignore` with:

```gitignore
.lock
cache/
```

4. Implement a scoped file lock for all mutating operations.
5. Add helpers for atomic write + rename.
6. Keep initialization idempotent.

**Verification**

1. Tests for directory creation and idempotency
2. Tests for `.gitignore` contents
3. Multi-threaded smoke test showing only one mutating writer holds the lock at a time

### Task 5: Store Layer, CRUD, and Repair

**Files**

1. `crates/untask-core/src/store.rs`
2. `crates/untask-core/src/repair.rs`
3. `crates/untask-core/tests/store_test.rs`
4. `crates/untask-core/tests/repair_test.rs`

**Work**

1. Implement `add`, `list`, `get`, `update`, `delete`, and status-change operations.
2. Ensure `list` and `get` are read-only.
3. On write paths:
   - normalize status
   - refresh `updated`
   - set/clear `completed` on `done` transitions
4. Add `repair --check/--write` support to:
   - detect unindexed tasks
   - assign missing IDs
   - rewrite filenames
   - align frontmatter IDs if needed
   - normalize statuses
   - report ambiguous cases instead of silently rewriting everything
5. Decide deterministic ID allocation:
   - numeric, gap-tolerant
   - no reuse
   - allocation only in write/repair paths

**Verification**

1. CRUD tests
2. Concurrency tests for `add`, `status`, and `delete`
3. Tests proving reads do not rename files
4. Repair tests for unindexed files and mismatched IDs
5. Timestamp tests for `updated` and `completed`

### Task 6: Docs Discovery, Search, Git Summary, and `next`

**Files**

1. `crates/untask-core/src/docs.rs`
2. `crates/untask-core/src/search.rs`
3. `crates/untask-core/src/git.rs`
4. `crates/untask-core/src/next.rs`
5. `crates/untask-core/tests/docs_test.rs`
6. `crates/untask-core/tests/search_test.rs`
7. `crates/untask-core/tests/next_test.rs`

**Work**

1. Make doc discovery honor `config.docs`.
2. Deduplicate doc matches by canonical path.
3. Handle duplicate basenames by returning an ambiguity error that includes relative paths.
4. Make search cover:
   - tasks
   - configured docs
5. Implement git summary with graceful fallback when git is unavailable or repo history is empty.
6. Build `next` summary with:
   - recent commits
   - open tasks
   - recently completed tasks using `completed`
   - unindexed/unmatched cleanup hints

**Verification**

1. Tests for duplicate doc names
2. Tests for configured doc globs outside `.untask/docs`
3. Tests for search snippets
4. Tests for `next` sorting and omitted empty sections

---

## Phase 2: CLI

### Task 7: CLI Scaffold and Project Root Resolution

**Files**

1. `crates/untask-cli/src/cli.rs`
2. `crates/untask-cli/src/commands/mod.rs`
3. `crates/untask-cli/src/main.rs`

**Work**

1. Define subcommands with Clap.
2. Resolve the project root by walking upward to find `.untask/`.
3. Make `untask` with no subcommand launch the TUI.
4. Keep `--json` and `--no-color` behavior consistent.

**Verification**

1. `cargo run -p untask -- --help`
2. `cargo run -p untask -- --version`
3. CLI tests for root discovery and not-initialized errors

### Task 8: Core Task Commands

**Commands**

1. `init`
2. `add`
3. `list`
4. `show`
5. `edit`
6. `status`
7. `done`
8. `delete`

**Work**

1. Wire task CRUD to the store layer.
2. Use `$EDITOR` fallback for `edit`.
3. Ensure all user-facing errors are concise and actionable.
4. Keep JSON output stable for agent use.

**Verification**

1. Integration test covering init -> add -> list -> show -> status -> done -> delete
2. Manual smoke test in a temp repository

### Task 9: Docs, Search, `next`, Repair, and Skill Commands

**Commands**

1. `next`
2. `search`
3. `docs`
4. `repair`
5. `skill install`
6. `open`

**Work**

1. Implement `docs` list/show with ambiguity handling.
2. Implement `repair --check/--write/--json`.
3. Implement `next` markdown and JSON output.
4. Implement `open` for macOS app launch with clear failure if the app is not installed.
5. Implement `skill install` for at least the current target agent setup path, with explicit fallback messaging for unsupported environments.

**Verification**

1. CLI integration tests for docs ambiguity
2. Repair smoke tests from real files created in tempdirs
3. Manual `open` behavior test on macOS

### Task 10: CLI Output Formatting and Contract Tests

**Files**

1. `crates/untask-cli/src/output.rs`
2. `crates/untask-cli/tests/cli_snapshot_test.rs`

**Work**

1. Implement monochrome/color/plain output modes.
2. Make output consistent across `list`, `show`, `search`, `repair`, and success/error messages.
3. Add snapshot-style tests for JSON payloads and representative terminal output.

**Verification**

1. `NO_COLOR=1` output checks
2. Snapshot tests for AI-facing JSON commands

---

## Phase 3: TUI

### Task 11: TUI Scaffold

**Files**

1. `crates/untask-cli/src/tui/mod.rs`
2. `crates/untask-cli/src/tui/app.rs`
3. `crates/untask-cli/src/tui/kanban.rs`
4. `crates/untask-cli/src/tui/list.rs`
5. `crates/untask-cli/src/tui/docs.rs`
6. `crates/untask-cli/src/tui/detail.rs`

**Work**

1. Set up Ratatui/Crossterm shell.
2. Add main views: Kanban, List, Docs, Task Detail.
3. Implement keyboard navigation and refresh behavior.
4. Keep the initial feature set read-mostly; edits can still open `$EDITOR`.

**Verification**

1. Manual smoke test with sample tasks/docs
2. Keyboard flow check for switching views and quitting cleanly

### Task 12: TUI Interaction, Status Updates, and File Watching

**Work**

1. Add quick status changes from list/kanban.
2. Add docs browsing and open-in-editor workflow.
3. Add file watching for `.untask/` and configured docs.
4. Debounce watcher events to avoid duplicate refreshes.
5. Surface unindexed/unmatched items clearly in the UI.

**Verification**

1. Manual test with CLI updates while TUI is open
2. Manual test for watcher storms
3. TUI state refresh test where a task file changes externally

---

## Phase 4: Desktop App

### Task 13: Desktop Scaffold with Current Toolchain

**Files**

1. `apps/desktop/`
2. `apps/desktop/src-tauri/Cargo.toml`
3. Root `Cargo.toml` workspace members

**Work**

1. Scaffold the desktop app under `apps/desktop`.
2. Use the current official Svelte/Tauri setup flow:

```bash
npm create tauri-app@latest apps/desktop -- --template svelte-ts
cd apps/desktop
npx sv add tailwindcss
npx shadcn-svelte@latest init
npm run tauri add dialog
```

3. Add `apps/desktop/src-tauri` to the Rust workspace.
4. Register the Tauri dialog plugin in the backend before using `@tauri-apps/plugin-dialog` on the frontend.
5. Keep the app macOS-first, but avoid macOS-only assumptions in shared Rust code.

**Verification**

1. `cd apps/desktop && npm install`
2. `cd apps/desktop && npm run check`
3. `cd apps/desktop && npm run tauri dev`

### Task 14: Desktop Backend Commands and App State

**Files**

1. `apps/desktop/src-tauri/src/lib.rs`
2. `apps/desktop/src-tauri/src/state.rs`

**Work**

1. Implement Tauri commands for:
   - project open/init
   - task list/get/add/update/delete
   - docs list/read/save
   - search
   - `next`
   - repair summary
   - recent projects
   - last-project restore
2. Persist recent-project and last-project metadata under `~/Library/Application Support/Untask/`.
3. Fail safely if the remembered project no longer exists.

**Verification**

1. Rust tests for app-state persistence helpers
2. Manual test for open -> close -> reopen last project
3. Manual test for missing remembered project

### Task 15: Frontend Shell and Project Lifecycle

**Files**

1. `apps/desktop/src/App.svelte`
2. `apps/desktop/src/lib/stores.ts`
3. `apps/desktop/src/lib/components/ProjectPicker.svelte`
4. `apps/desktop/src/lib/components/Sidebar.svelte`

**Work**

1. Build the application shell and project-loading states.
2. Use the Tauri dialog plugin for folder selection and confirmation UI.
3. Restore the last project on launch.
4. Offer inline initialization when `.untask/` is missing.

**Verification**

1. Manual first-run flow
2. Manual restore-last-project flow
3. Manual invalid-path recovery flow

### Task 16: Core Desktop Views and Editing

**Files**

1. `apps/desktop/src/lib/components/Kanban.svelte`
2. `apps/desktop/src/lib/components/TaskList.svelte`
3. `apps/desktop/src/lib/components/TaskDetail.svelte`
4. `apps/desktop/src/lib/components/DocsViewer.svelte`
5. `apps/desktop/src/lib/components/DocsEditor.svelte`

**Work**

1. Build kanban, task list, task detail, docs viewer, and docs editor views.
2. Integrate **Milkdown** (via vanilla JS `use:` directive) for WYSIWYG markdown editing in task detail and docs editor.
   - Use `@milkdown/kit` with CommonMark and GFM presets.
   - Preserve YAML frontmatter by stripping it before passing to Milkdown and re-prepending on save.
   - Reference [Otterly](https://github.com/ajkdrag/otterly) (Tauri + Svelte 5 + Milkdown) as integration precedent.
3. Support:
   - drag/drop or explicit move between columns
   - task status updates
   - task body editing via Milkdown
   - doc save
4. Show attachments as local markdown references, not uploaded blobs.
5. Surface unindexed/unmatched warnings in a non-destructive way.

**Verification**

1. Manual smoke test covering add/edit/move/delete
2. Manual docs save and reopen test — verify markdown round-trip fidelity (no format mangling)
3. Manual task detail edit + watcher refresh test

### Task 17: Desktop Watching, Events, and Smoke Tests

**Work**

1. Add backend file watching for `.untask/` and configured docs.
2. Emit debounced refresh events to the frontend.
3. Keep project switching clean by replacing the active watcher when the project changes.
4. Add smoke checks for recent-project switching and external CLI edits.

**Verification**

1. CLI edit reflected in desktop UI
2. Desktop edit reflected in subsequent CLI reads
3. Project switch without stale watcher updates

---

## Phase 5: Skill and Release

### Task 18: Skill Packaging and Install Flow

**Files**

1. `skill/untask.md`
2. `crates/untask-cli/src/commands/skill.rs`

**Work**

1. Ship a bundled skill file that teaches:
   - start session with `untask next`
   - set status before work
   - mark done after work
   - write docs/plans into tracked locations
2. Implement `untask skill install`.
3. Detect the primary target agent installation path first, then print fallback instructions for unsupported agents.

**Verification**

1. Local install smoke test on the target agent setup
2. Failure-path test when the agent config directory is missing

### Task 19: CI, Release Artifacts, and Future Signing/Notarization

**Files**

1. `.github/workflows/release.yml`
2. `.github/workflows/ci.yml`
3. Optional release-support docs under `docs/`

**Work**

1. Add CI for Rust and desktop checks.
2. Build CLI release archives from CI.
3. Build the macOS desktop app in CI.
4. Define the near-term release mode as:
   - **preview release**: unsigned desktop build, clearly labeled, no Homebrew cask
5. Add signing/notarization wiring only if Apple Developer credentials become available later.
6. If Homebrew support is added:
   - CLI formula only at first
   - desktop cask only after notarization

**Verification**

1. CI passes on the default branch
2. Release workflow produces expected artifacts
3. Preview release artifacts and labeling are validated before claiming v1 release readiness

---

## Delivery Order

Implementation order should stay:

1. Core library
2. CLI
3. TUI
4. Desktop app
5. Release automation

The desktop app can begin once the core task/doc/search/repair APIs are stable, but do not start desktop UI work before the core write semantics and repair rules are settled.

---

## Definition of Done

Untask v1 is implementation-ready when all of the following are true:

1. Core tests cover the edge-case matrix above.
2. CLI supports stable JSON output for agent-facing commands.
3. TUI and desktop both reflect external file changes without data loss.
4. Desktop app can edit docs and task content, not just read them.
5. `repair --check/--write` exists and handles unindexed tasks explicitly.
6. The repo root, workspace layout, and CI/release paths are consistent.
7. Desktop release expectations are honest: preview-only by default for now, notarized only if credentials are added later.
