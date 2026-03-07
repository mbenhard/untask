# Untask v1.0 Implementation Plan

**Goal:** Build Untask as a local-first Rust workspace with a shared core, a CLI binary, and a macOS desktop app that all read and write the same `.untask/` project data.

**Design Doc:** `docs/plans/2026-03-06-untask-design.md`

**Status:** Updated for the desktop + CLI product shape

## Scope

v1 includes:

1. Shared Rust core for config, parsing, task/doc storage, repair/indexing, git summary, and search.
2. CLI surface for humans and AI agents.
3. Tauri macOS app with board, task detail, docs editor, recent projects, and last-project restore.
4. Skill installer.
5. Release automation for CLI artifacts and preview desktop builds.

v1 does not include:

1. MCP server.
2. Cloud sync.
3. Multi-window desktop support.
4. Hosted collaboration.

## Engineering Rules

1. Repository root is the workspace root.
2. Reads are side-effect free.
3. Every mutating filesystem operation acquires `.untask/.lock`.
4. Writes are atomic where possible.
5. Configured doc discovery is repo-scoped.
6. `repair` is the only bulk-normalization path.

## Quality Gates

### Rust

```bash
cargo fmt --all --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace
```

### Desktop

```bash
pnpm --dir apps/desktop check
pnpm --dir apps/desktop build
```

## Implementation Phases

### Phase 1: Shared Core

1. Config, errors, and shared types.
2. Task parsing, serialization, and metadata rules.
3. Project initialization, locking, and atomic file IO.
4. Store, repair, search, docs discovery, and git summary.

### Phase 2: CLI

1. Core command surface: `init`, `add`, `list`, `show`, `status`, `done`, `delete`, `next`, `search`, `docs`, `repair`, `skill`, `open`.
2. Stable JSON output for automation and agent workflows.
3. Explicit desktop launch via `untask open`.

### Phase 3: Desktop App

1. Tauri backend commands layered on `untask-core`.
2. Svelte frontend for task lists, kanban, task detail, docs, and project selection.
3. Live project refresh behavior driven by filesystem changes.

### Phase 4: Release and CI

1. Rust checks in CI.
2. Desktop verification in CI on macOS.
3. Preview desktop packaging until full signing/notarization is available.

## Edge-Case Test Matrix

1. Missing `.untask/` directory.
2. Missing or malformed `config.yml`.
3. Unknown statuses and alias normalization.
4. Unindexed task files with and without frontmatter IDs.
5. Duplicate doc basenames across configured doc globs.
6. Concurrent `add`, `status`, and `delete`.
7. `done` transitions setting `completed`, and reopening clearing it.
8. Last-project restore when the directory has been deleted or moved.

## Completion Criteria

1. CLI and desktop both operate on the same `.untask/` data.
2. The CLI remains the canonical automation surface.
3. Desktop workflows stay consistent with the shared core and config model.
