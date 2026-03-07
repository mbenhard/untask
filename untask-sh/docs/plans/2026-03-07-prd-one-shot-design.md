# PRD / One-Shot Support — Design Document

**Date:** 2026-03-07
**Status:** Validated

## Problem

Untask is built around kanban/list for complex, multi-task projects. But many projects are simple — a WordPress plugin, an internal tool, a quick client app. These don't need task breakdown. You write a PRD, hand it to an AI agent, and it gets built in one shot.

There's no place in untask for this workflow today.

## Goals

1. Support PRDs as a first-class document type alongside tasks and docs.
2. Enable two workflows from the same data: one-shot execution and task breakdown.
3. Keep the data model universal so any AI tool (not just Claude Code) can consume it.

## Non-Goals

1. PRD lifecycle/status tracking — tasks handle their own lifecycle.
2. A separate PRD view — PRDs live in the Docs view.
3. Forcing a workflow — the user decides one-shot vs breakdown, not the tool.

## Data Model

### PRD document

A PRD is a markdown file in `.untask/docs/` with `type: prd` in frontmatter:

```yaml
---
title: WordPress Plugin for Client X
type: prd
created: 2026-03-07
---

## Overview
Build a WP plugin that...
```

Regular docs have `type: doc` or no type field (defaults to `doc`).

### Task linkage

When tasks are generated from a PRD, each task gets a `prd` field in frontmatter:

```yaml
---
id: 42
title: Set up plugin boilerplate
status: todo
prd: wordpress-plugin-client-x.md
---
```

The link is one-directional: tasks point to their PRD. The PRD itself has no task references, no status, no lifecycle. It's a reference document.

## Creation & Editing Paths

A PRD can be created/edited from four places:

**User side:**
1. **Desktop app** — Create a new doc, pick "PRD" as type. Paste content or write from scratch. Edit with the Milkdown editor.
2. **Filesystem** — Drop a `.md` file into `.untask/docs/` with `type: prd` frontmatter, or edit in any text editor.

**AI side:**
3. **CLI** — `untask doc create --type prd "My Project"` writes the file. Or the agent writes the file directly.
4. **Brainstorm flow** — Iterate with an AI agent, agent writes the result as a PRD into the project.

All four paths produce the same artifact: a markdown file with `type: prd` frontmatter.

## Docs View

PRDs are visually distinguished from regular docs in the Docs view — a section header or subtle label. They live in the same view, not a separate one.

When viewing a PRD that has linked tasks, a compact status line appears at the bottom:

```
3 tasks · 1 done
```

If zero tasks are linked, nothing shows.

## Workflows

### One-shot (small/simple PRD)

1. PRD exists in project (imported or generated).
2. AI agent reads the PRD.
3. Agent builds what the PRD says. No tasks created.
4. PRD stays as historical record.

### Task breakdown (complex PRD)

1. PRD exists in project.
2. User asks AI agent to break it into tasks.
3. Agent proposes task list, user reviews/adjusts.
4. Tasks are created on the board with `prd: <filename>` linkage.
5. Work proceeds through the board, task by task or in batches.

The decision is the user's. No wizard, no complexity threshold.

## AI Tool Integration

The data format is the integration. PRDs are markdown with YAML frontmatter — readable by any AI tool.

**Agent-specific instructions** (skills, rules files) teach each tool how to interact with untask:
- Claude Code: untask skill
- Cursor: `.cursor/rules`
- Windsurf: `.windsurfrules`
- Copilot: `.github/copilot-instructions.md`

All say the same thing: check for PRDs, read them, use them as scope. Start with Claude Code, add others as needed.

**What the agent instructions should cover:**
- Check for PRDs: `untask doc list --type prd`
- Read a PRD before starting work
- For one-shots: build what the PRD says
- For breakdowns: propose tasks, create them with `prd: <filename>` linkage
- When generating a PRD: write to `.untask/docs/` with `type: prd` frontmatter
