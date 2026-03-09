# Unship — Design Document

> A local-first developer project companion for tracking tasks, docs, and plans from a macOS app and an AI-friendly CLI.

**Date:** 2026-03-06  
**Status:** Updated for the desktop + CLI product shape

## Problem

Developers working with local repos and coding agents need project state to live close to the code, stay scriptable, and remain readable without a hosted service.

## Goals

1. Keep project state in versioned local files inside the repository.
2. Provide one shared data model for the CLI and macOS app.
3. Make the CLI reliable for both humans and AI agents.
4. Surface plans and docs alongside tasks so context recovery is fast.
5. Preserve safe, explicit write behavior for multi-agent workflows.

## Non-Goals

1. Cloud sync or hosted collaboration.
2. MCP in v1.
3. Multi-window desktop workflows.
4. A full project-management suite with estimates or permissions.

## Solution Overview

Unship is a local-first project companion. All durable data lives inside `.unship/` at the repository root and is shared across two access layers:

1. **CLI** for humans, scripts, and AI agents.
2. **macOS app** for board, task detail, docs, and richer editing.

An Unship skill teaches agents when to call the CLI and how to keep task state current.

## Architecture

```text
┌──────────────────────────────────────────────┐
│               Shared Rust Core               │
│  config, parsing, CRUD, repair, search,     │
│  status normalization, doc discovery, git   │
├───────────────────────┬──────────────────────┤
│ CLI                   │ macOS App            │
│ clap                  │ Tauri 2 + Svelte 5   │
│ machine/json surface  │ native graphical UI  │
└───────────────────────┴──────────────────────┘
```

### Tech Stack

| Component | Technology | Notes |
|-----------|------------|-------|
| Core library | Rust | Shared data model and filesystem logic |
| CLI | Rust + Clap | Stable shell surface for humans and agents |
| macOS app | Tauri 2 + Svelte 5 | Native shell with fast local UI |
| Markdown editor | Milkdown | Rich editing with markdown fidelity |
| Skill | Markdown/config file | Agent guidance with zero server dependency |

## Repository Layout

```text
/
├── Cargo.toml
├── crates/
│   ├── unship-core/
│   └── unship-cli/
├── apps/
│   └── desktop/
├── docs/
│   └── plans/
└── .github/
    └── workflows/
```

## Data Model

All project data lives inside `.unship/` at the repository root:

```text
.unship/
├── config.yml
├── tasks/
├── docs/
├── attachments/
├── cache/
└── .lock
```

### Rules

1. Reads are side-effect free.
2. Mutations acquire `.unship/.lock`.
3. Writes are atomic where possible.
4. `repair` is the explicit normalization path.
5. Configured doc discovery stays repo-scoped.

## UX Notes

1. The CLI is the canonical automation and scripting surface.
2. The macOS app reads and writes the same `.unship/` data as the CLI.
3. Desktop and CLI should both reflect external filesystem changes without hidden migrations.

## Success Criteria

1. Tasks, docs, and plans are accessible from the CLI and macOS app.
2. Agents can rely on `--json` output without hidden write-side effects.
3. The desktop app provides a richer visual workflow without diverging from the shared data model.
