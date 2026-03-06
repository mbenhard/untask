# Untask — Design Document

> A local-first developer project companion for tracking tasks, docs, and plans from a macOS app, terminal UI, and AI-friendly CLI.

**Date:** 2026-03-06  
**Status:** Revised after plan review

---

## Problem

Developers using AI coding agents across multi-day projects still lose time on three avoidable problems:

1. **Resume context is fragmented.** Plans, notes, and task state are spread across markdown files, editors, terminals, and chat history.
2. **Task tracking is external to the repo.** Trello, Jira, and Linear are useful for teams, but they are not naturally available to local AI agents working in the repository.
3. **There is no agent-friendly control surface.** Agents can write markdown and run shell commands, but most project boards are not shaped for that workflow.

## Goals

Untask v1 should:

1. Keep project state in versioned, local files inside the repository.
2. Provide one shared data model for CLI, TUI, and macOS GUI.
3. Make the CLI good enough for both humans and AI agents.
4. Support low-friction task capture and richer task files when needed.
5. Surface plans/docs alongside tasks so context recovery is fast.
6. Behave safely in multi-agent workflows without hidden write-side effects.

## Non-Goals

Untask v1 will not:

1. Sync to cloud task systems.
2. Implement real-time multi-user collaboration beyond git + local file watching.
3. Ship an MCP server in the initial release.
4. Support multiple open projects in a single app window.
5. Build a full project-management suite with estimates, burndowns, or permissions.

---

## Solution Overview

Untask is a local-first project companion. All durable project data lives inside `.untask/` at the repository root and is shared across three access layers:

1. **CLI** for humans, scripts, and AI agents.
2. **TUI** for keyboard-first terminal workflows.
3. **macOS app** for a visual board, task detail, and markdown editing.

An **Untask skill** teaches AI agents when to call the CLI and how to keep task state current.

### AI Integration Layers

**Layer 1 — CLI (required)**  
Any agent with shell access can use Untask immediately.

**Layer 2 — Skill (required for best behavior)**  
A markdown skill/config file teaches start-of-session, in-progress, and completion behaviors.

**Layer 3 — MCP (post-v1, optional)**  
Only add structured MCP integration if the CLI proves insufficient.

---

## Architecture

```text
┌──────────────────────────────────────────────┐
│               Shared Rust Core              │
│  config, parsing, CRUD, indexing/repair,    │
│  status normalization, doc discovery, git,  │
│  file watching adapters, summary building   │
├────────────────┬───────────────┬────────────┤
│ CLI            │ TUI           │ macOS App  │
│ clap           │ ratatui       │ Tauri 2    │
│ machine/json   │ keyboard UI   │ Svelte 5   │
│ agent surface  │ split-pane    │ editor/UI  │
└────────────────┴───────────────┴────────────┘
```

### Tech Stack

| Component | Technology | Notes |
|-----------|------------|-------|
| Core library | Rust | Shared data model and filesystem logic |
| CLI | Rust + Clap | Stable shell surface for humans and agents |
| TUI | Ratatui + Crossterm | Terminal-first project board |
| macOS app | Tauri 2 + Svelte 5 + shadcn-svelte + Tailwind | Native shell with fast local UI |
| Markdown editor | Milkdown | WYSIWYG Typora-like editing; remark-based for markdown fidelity |
| Skill | Markdown/config file | Agent guidance, zero server dependency |

### Repository Layout

The **repository root is the product root**. There is no nested git repository.

```text
/
├── Cargo.toml
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

This matters for packaging and CI:

1. GitHub Actions workflows live at `.github/workflows/` in the repository root.
2. The Rust workspace root is the repository root.
3. The desktop app lives under `apps/desktop`, but it is part of the same repo/workspace.

---

## Data Model

### Project Data Directory

All project data lives inside `.untask/` at the repository root:

```text
.untask/
├── config.yml
├── tasks/
│   ├── 001-fix-login-bug.md
│   └── 002-implement-oauth.md
├── docs/
│   ├── v1-plan.md
│   └── architecture-notes.md
├── attachments/
│   └── oauth-error.png
├── cache/
│   └── watcher-state.json
└── .lock
```

### Versioned vs Non-Versioned Content

1. `.untask/tasks/`, `.untask/docs/`, and `.untask/attachments/` are **versioned by default**.
2. `.untask/cache/` and `.untask/.lock` are **ignored by git**.
3. Attachments are committed because task/docs markdown may reference them directly.
4. Large generated artifacts do not belong in `attachments/`; those should stay outside `.untask/` or move to `cache/`.

### Task File Format

**Minimal task**

```markdown
---
title: Fix the login bug
status: todo
---
```

**Rich task**

```markdown
---
id: 2
title: Implement OAuth2 flow
status: in-progress
priority: high
tags: [auth, backend]
created: 2026-03-06
updated: 2026-03-06T19:30:00Z
completed:
---

## Description
Need to support Google and GitHub OAuth providers.

## Subtasks
- [x] Set up OAuth credentials
- [ ] Implement callback handler
- [ ] Add session persistence

## Notes
Screenshot of the error:
![error](../attachments/oauth-error.png)
```

### Task Rules

1. `title` is required for Untask-managed creation flows.
2. Filename prefix is the canonical human-facing ID for managed tasks: `001-fix-login-bug.md`.
3. Frontmatter `id` exists for import/repair compatibility, but Untask-managed files should keep filename prefix and frontmatter aligned.
4. `status` defaults to the first configured column on **create and import/repair**.
5. `priority`, `tags`, `created`, `updated`, and `completed` are optional.
6. `updated` is refreshed on Untask-managed writes.
7. `completed` is set when a task enters the canonical `done` column and cleared if it moves out.
8. Body supports any markdown, including checklists and images.
9. Slug is generated at creation time and does not change automatically when the title changes.

### Unindexed Tasks

Manual files are allowed, but reads must stay side-effect free.

1. If a task file lacks a numeric filename prefix, Untask does **not** rename it during listing or reading.
2. If it has a valid frontmatter `id`, Untask can display it, but the file is still marked as needing normalization.
3. If it has neither a numeric prefix nor frontmatter `id`, it appears as **Unindexed**.
4. `untask repair --write` is the explicit flow that assigns IDs, rewrites filenames, normalizes statuses, and records what changed.

This preserves agent flexibility without allowing hidden writes during normal reads.

### Config File

```yaml
# .untask/config.yml

columns:
  - id: backlog
    aliases: []
  - id: todo
    aliases: [to-do, "to do", pending]
  - id: in-progress
    aliases: [wip, "in progress", doing, working]
  - id: review
    aliases: [reviewing, "in review"]
  - id: done
    aliases: [complete, finished, closed]

docs:
  - .untask/docs/**/*.md
  - docs/**/*.md
  - plans/**/*.md

theme: mono
```

### Config Rules

1. `docs` globs are resolved relative to the repository root.
2. Absolute paths are rejected in v1.
3. Parent traversal (`../`) is rejected in v1 to keep discovery scoped to the project.
4. Duplicate file matches are deduplicated by canonical path.
5. Missing or invalid config falls back to the default five columns plus `.untask/docs/**/*.md`.

### Theme Options

1. `mono` — default, minimal emphasis
2. `color` — colored badges and status cues
3. `none` — plain text / automation-friendly

---

## Canonical Behaviors

### Status Normalization

All surfaces use the same logic:

1. Trim and lowercase the raw value.
2. Match against canonical column IDs and aliases.
3. Store canonical IDs on Untask-managed writes.
4. Show unmatched values in an **Unmatched** bucket instead of dropping them.

### Concurrency and Writes

1. All mutating operations acquire `.untask/.lock`.
2. Mutating operations write to a temporary file and rename atomically where possible.
3. Read paths never mutate files.
4. `repair` is the only command allowed to normalize unmanaged filenames in bulk.
5. Last-writer-wins is acceptable for true same-file races, but Untask should minimize accidental overlap by keeping writes narrow and predictable.

### Subtask Tracking

1. Parse markdown checklist items for progress display.
2. Count only standard checkbox syntax.
3. Nested subtasks are ignored in v1 for progress math; the raw markdown still renders.

### Search and Doc Discovery

1. `search` covers tasks plus all configured doc globs.
2. Search is scoped to the repository root only.
3. Duplicate doc names are allowed, but `docs show` must fall back to relative-path disambiguation if the basename is ambiguous.

### File Watching

1. TUI and desktop watch `.untask/` and configured docs within the repo.
2. Watchers debounce refreshes to avoid UI thrash.
3. Self-generated temp files should be ignored where possible.

---

## CLI Surface

The CLI is the universal integration layer.

```text
untask
untask init
untask open
untask add "Fix the login bug"
untask list
untask list --status=todo
untask list --tag=backend
untask list --json
untask show 3
untask show 3 --json
untask edit 3
untask done 3
untask delete 3
untask status 3 in-progress
untask next
untask next --json
untask search "oauth"
untask search "auth" --tasks-only
untask docs
untask docs show plan.md
untask repair --check
untask repair --write
untask repair --json
untask skill install
untask --version
```

### Global Flags

1. `--json` on list/show/next/search/repair
2. `--no-color`
3. Respect `NO_COLOR`

### `untask next`

`untask next` is the default AI-agent entry point. It should summarize:

1. Recent git activity when available
2. Open tasks sorted by priority and recency
3. Recently completed tasks using the `completed` timestamp when available
4. Unindexed and unmatched items that need cleanup

If a section is empty, it is omitted.

### `untask repair`

`repair` is the guardrail command for edge cases:

1. Detect unindexed task files
2. Detect mismatched filename/frontmatter IDs
3. Normalize statuses to canonical IDs
4. Optionally assign missing IDs and rename files when `--write` is used
5. Report changes in human and JSON form

---

## Views

### v1 Features

**1. Kanban Board**  
Available in TUI and macOS app.

1. Columns follow config order.
2. Drag-and-drop in GUI, keyboard move/toggle in TUI.
3. Cards show title, priority, tags, and subtask progress.
4. Unmatched and Unindexed items remain visible instead of disappearing.

**2. Task List / Detail**  
Available in CLI, TUI, and macOS app.

1. Filter by status, tag, and priority.
2. Sort by priority, updated time, created time, or title.
3. Support quick status changes.
4. Show a task detail pane or detail view for body markdown and metadata.

**3. Docs Browser / Editor**  
TUI is read-only plus `$EDITOR`; macOS app includes inline editing.

1. Browse `.untask/docs/` and configured repo docs.
2. Render markdown preview in GUI.
3. Syntax-highlight or render plain markdown in TUI.
4. Save docs from the macOS app through explicit backend commands.

**4. What’s Next Summary**  
Available in CLI and TUI.

1. Structured markdown output for humans and AI agents
2. No built-in LLM calls
3. Includes cleanup signals such as unindexed tasks when relevant

### macOS App Behavior

1. One active project at a time.
2. Project picker opens a repository folder.
3. If `.untask/` is missing, the app can initialize it.
4. Recent projects are stored in `~/Library/Application Support/Untask/`.
5. The last successful project is restored on launch if it still exists.

---

## Edge Cases and Safeguards

1. **Malformed frontmatter**: preserve file contents, best-effort parse body, surface a warning.
2. **Missing config**: fall back to defaults without blocking the UI.
3. **Duplicate doc basenames**: require relative-path disambiguation.
4. **Unknown statuses**: show in `Unmatched`, never drop data.
5. **Unindexed tasks**: show in `Unindexed`, never rename on read.
6. **Concurrent writes**: serialize via `.untask/.lock`.
7. **Watcher churn**: debounce refreshes and ignore temp files where possible.
8. **Repo scoping**: reject absolute and parent-traversing doc globs.
9. **Attachments**: committed by default so markdown references stay valid across clones.
10. **Desktop launch**: `untask open` should fail clearly if the app is not installed.

---

## Distribution

### CLI + TUI

1. Local development: `cargo run -p untask -- ...` or `cargo install --path crates/untask-cli`
2. Release artifacts: GitHub Releases archives
3. Homebrew formula is acceptable for the CLI binary

### macOS App

1. Near-term distribution is a clearly labeled **unsigned preview** `.dmg` or `.zip`
2. Users should expect Gatekeeper warnings and use the standard macOS "Open Anyway" flow for preview builds
3. A signed and notarized release becomes the standard release target only if Apple Developer credentials are added later
4. A Homebrew cask is only added after notarized builds exist

### Skill

The skill file ships with the CLI and is installed with `untask skill install`.

---

## Roadmap

### v1.0

1. Shared Rust core
2. CLI with task/doc/search/repair flows
3. TUI with kanban/list/docs views and file watching
4. macOS app with board, detail pane, docs editor, recent projects, last-project restore
5. Skill installer

### v1.1

1. Archive completed tasks
2. Templates
3. Better `next` customization
4. Menubar quick capture

### v1.2+

1. Dependency tracking
2. MCP integration
3. Dashboard/stats
4. Multi-project desktop windows

---

## Resolved Design Decisions

1. **Repository root is the workspace root.** No nested repo bootstrap.
2. **Attachments are committed; cache is ignored.** This keeps markdown references valid.
3. **Reads are side-effect free.** Explicit `repair` handles indexing/normalization.
4. **Search is repo-scoped and config-driven.** Doc discovery honors configured globs but cannot escape the project root.
5. **Desktop release language must match reality.** Preview unsigned builds are acceptable now; notarization becomes the standard path only if Apple Developer credentials are added later.
