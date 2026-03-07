# Architecture

## Overview

The system follows a layered architecture with clear separation of concerns.

## Layers

- **Core**: Domain models, parsing, and storage logic
- **CLI**: Command-line interface and TUI
- **Desktop**: Tauri-based GUI with Svelte frontend

## Data Flow

All data is stored as markdown files in `.untask/tasks/`. Both CLI and desktop read/write the same files, enabling seamless switching between interfaces.

## Key Decisions

1. Local-first: no server, no database — just files
2. Markdown frontmatter for structured metadata
3. File watching for real-time sync between tools
