# Review View & Agent Workflow Design

## Problem

When an AI agent finishes a task, it marks it `done` and moves on. The human has no structured way to review what was done, assess quality, or kick work back. The current flow:

```
AI works -> untask done <id> -> task disappears into "done" column -> hope it's fine
```

Additionally, the `/untask` skill is monolithic — it loads all instructions regardless of what the agent is doing, wasting context budget. And there's no structured way for the AI to batch-process multiple tasks efficiently.

## Solution

Four connected changes:

1. **Review view** in the desktop app (replaces "Next" placeholder)
2. **Task format extension** for agent metadata (confidence, summary, deferred)
3. **Skill split** into focused, agent-agnostic skills
4. **Batch processing** skill for parallel task execution

---

## 1. Review View (Sidebar Slot 4)

Replaces the "Next — coming soon" placeholder. Keyboard shortcut: `4`.

### Layout

A filtered vertical list of all tasks with `review` status.

```
+---------------------------------------------+
|  Review (3)                    [Approve all] |
+---------------------------------------------+
|  * #42 Add user authentication         high  |
|  * #38 Fix login redirect             medium |
|  * #45 Update API docs                  low  |
|                                              |
|  Empty state: "Nothing to review"            |
+---------------------------------------------+
```

### Behavior

- Clicking a task opens the existing `TaskModal`
- No new detail view — reuses what exists
- List sorted by confidence (low first = needs most attention) then by updated date
- Count badge on sidebar nav icon showing number of review tasks
- **Approve all** button at top — moves all review tasks to `done` in one action

### TaskModal Changes (when status = review)

- Render `## Agent Summary` section with distinct styling (mono, subtle border-left accent)
- Render `## Deferred` section similarly
- Show confidence indicator near status (mono text label: `low` / `med` / `high`)
- Add two action buttons:
  - **Approve** — moves task to `done`
  - **Kick back** — moves task to `in-progress`, optionally prompts for reason
- These buttons only appear when task status is `review`

### Kick-back Flow

When kicking a task back:
1. UI shows an optional text input: "What needs fixing?"
2. If provided, written as `## Review Notes` in the task body
3. If skipped, task moves to `in-progress` with no notes
4. The AI reads `## Review Notes` naturally when it picks up the task again
5. Review notes from IDE/CLI agents can also be written directly into the task file

### Re-work Cycle

When a task goes through multiple review cycles (`in-progress → review → kicked back → in-progress → review`):
- Agent **overwrites** the previous `## Agent Summary` and `## Deferred` sections
- Git preserves the history of previous summaries
- `## Review Notes` from the human are also overwritten by the agent when re-submitting

### Graceful Degradation

- Tasks set to `review` manually (by human, not AI) won't have agent sections — that's fine, nothing special renders
- Tasks without `confidence` show no confidence indicator
- The view works purely on status filtering — no dependency on agent metadata existing

### Design Language

- Monochrome, dense, consistent with existing views
- No fancy cards — tight list rows matching TaskList row height
- Confidence indicator: mono text label (not colored dots — avoids confusion with priority dots)
- Agent sections in task modal: mono font, subtle border-left accent

---

## 2. Task Format Extension

### Frontmatter Addition

Optional `confidence` field:

```yaml
---
id: 42
title: Add user authentication
status: review
confidence: high
---
```

Values: `low | medium | high` (optional, omit if not set by agent).

### Body Conventions

AI agents write these markdown sections at the end of the task body:

```markdown
Original task description stays here...

## Agent Summary
Brief description of what was done and the approach taken.

## Deferred
- Items intentionally skipped
- Things left for follow-up

## Review Notes
(Written by human when kicking back — optional)
What needs fixing and why.
```

- `## Agent Summary` — required when agent finishes a task
- `## Deferred` — optional, only if something was skipped
- `## Review Notes` — optional, written by human on kick-back
- Sections are parsed by heading name (case-insensitive, h2 only, trimmed)
- These heading names are reserved — task descriptions should not use them
- If sections don't exist, nothing special renders (backward compatible)

### Parsing

**Confidence (Rust backend):**
- Add `confidence: Option<String>` to `TaskFrontmatter` and `Task` structs
- Add `confidence: string | null` to TypeScript `TaskDto`
- Serde `#[serde(default)]` handles missing field gracefully
- Fully backward compatible

**Body sections (Frontend):**
- The TaskModal currently passes the full body to MilkdownEditor as-is
- To render agent sections distinctly: parse the markdown body in JavaScript before rendering
- Extract content under `## Agent Summary`, `## Deferred`, `## Review Notes` by h2 heading match
- Render extracted sections above the editor with custom styling (mono, border-left accent)
- Pass the remaining body (original task description) to MilkdownEditor for editing
- If no agent sections exist, render the full body in MilkdownEditor as today (backward compatible)

**Heading match rules:**
- Case-insensitive, h2 only (`##`), whitespace-trimmed
- Match exact heading text: "Agent Summary", "Deferred", "Review Notes"

---

## 3. Required Columns & Config

### Required Columns

Every project has a set of locked core columns that cannot be deleted:

```
backlog → todo → in-progress → review → done
```

- These are always present in the kanban config (the default preset already includes all five)
- Users can add custom columns anywhere between them (e.g. `blocked`, `qa`, `staging`, `inbox`, `roadmap`)
- Custom columns can be added, renamed, reordered, and deleted freely
- Core columns can be reordered but not deleted
- The `review` column is always available, making the review workflow consistent

#### Implementation Detail

The current `column_delete()` only prevents deleting the last column. Add a `required` check:
- Hardcode the required column IDs: `["backlog", "todo", "in-progress", "review", "done"]`
- `column_delete()` returns an error if the target column is in the required list
- No changes to the `Column` struct needed — required-ness is hardcoded, not per-column config

### Agent Config

New section in `.untask/config.yml`:

```yaml
agent:
  auto_done: false
```

- `false` (default): AI marks tasks as `review`
- `true`: AI marks tasks as `done` directly

Per-project setting. No settings UI needed — users edit config.yml directly.

Note: the `review` column already exists in the default kanban preset with aliases `["reviewing", "in review"]`, so `untask status <id> review` works today.

---

## 4. Skill Split

The monolithic `/untask` skill splits into four focused skills:

### `untask` (session start)

Fires at start of a work session.

- Run `untask next --json` to see open tasks
- Pick a task and run `untask status <id> in-progress`
- Use `untask search <query>` to find relevant tasks
- Use `untask list --status <status> --json` to see tasks in a specific column

### `untask-finish` (completing a task)

Fires when AI is done working on a task.

- Write `## Agent Summary` in the task body (brief, what was done)
- Write `## Deferred` if anything was skipped (omit section if nothing)
- Set `confidence: low|medium|high` in task frontmatter
- Read `auto_done` from `.untask/config.yml`
  - If `false` or missing: `untask status <id> review`
  - If `true`: `untask done <id>`
- Run `untask repair --check` to verify project integrity

### `untask-docs` (working with docs)

Fires when AI needs to work with project documentation.

- How to use `.untask/docs/`
- Create/edit docs and PRD conventions
- `untask docs` and `untask docs show <name>` commands

### `untask-batch` (parallel task processing)

Fires when the AI wants to process multiple tasks or the user asks for batch work.

#### Flow

1. **Scan:** `untask list --status todo --json` to get actionable tasks from a specific column
2. **Analyze:** Identify which tasks are independent (touch different files/areas)
3. **Propose:** Present the batch to the human for confirmation:
   ```
   I can work on these 3 tasks in parallel — they're independent:
   - #12 Add logout button (frontend, components/)
   - #15 Fix date parsing (backend, utils/)
   - #18 Update API docs (docs/)
   Proceed?
   ```
4. **Execute:** After human confirms, dispatch work:
   - Use subagents when the agent supports them (e.g. Claude Code Agent tool)
   - Fall back to sequential processing when subagents aren't available
   - Each task follows `untask-finish` conventions (summary, confidence, etc.)
5. **Report:** After all tasks complete, summarize results:
   ```
   Completed 3 tasks:
   - #12 Add logout button — confidence: high
   - #15 Fix date parsing — confidence: medium (edge case in timezone handling)
   - #18 Update API docs — confidence: high
   All moved to review.
   ```

#### Independence Heuristics

The skill instructs the AI to consider tasks independent when:
- They reference different files, directories, or areas of the codebase
- They have different tags suggesting different domains
- Their descriptions don't mention shared state or dependencies

Tasks should NOT be parallelized when:
- They reference the same files
- One task's output is another task's input
- They modify shared configuration or schema

#### Config

```yaml
agent:
  auto_done: false
  max_parallel: 3    # max concurrent subagents for batch processing
```

`max_parallel` defaults to 3. Caps how many subagents run simultaneously to avoid resource contention.

#### Agent Compatibility

- **Claude Code:** Use the Agent tool to dispatch subagents, each working in the main worktree (or git worktrees if available)
- **Cursor / other IDEs:** Process tasks sequentially, one at a time
- **Any agent:** The skill is written as "use parallel execution if your environment supports it, otherwise process sequentially"

### Why Split

- Context budget: agents load ~2% of context window for skills. Smaller = less noise.
- Just-in-time: only load what's relevant to the current phase of work.
- Agent-agnostic: all four are plain markdown instructions about editing markdown files. Works with Claude Code, Cursor, Gemini, Codex, etc.
- The batch skill is the only one that mentions subagents, and frames it as optional.

---

## Edge Cases & Notes

- **Canonical status string:** The review status is exactly `review` (not `in-review`, `code-review`, etc.)
- **Skill not firing:** Skills are convention-based, not enforced. If an agent runs `untask done` without loading `untask-finish`, the task goes to done without a summary. The review view handles this gracefully.
- **Heading collisions:** `## Agent Summary`, `## Deferred`, and `## Review Notes` are reserved heading names. Documented in skill instructions. Parsing is case-insensitive, h2-only, whitespace-trimmed.
- **Skill installation:** Current `untask skill install` writes a single file to `~/.claude/commands/untask.md`. With the split, it writes multiple files. Add `--provider` flag to target different agents:

  | Provider | Flag | Target |
  |----------|------|--------|
  | Claude Code | `--provider claude-code` (default) | `~/.claude/commands/` |
  | Cursor | `--provider cursor` | `.cursor/rules/` |
  | Codex | `--provider codex` | `AGENTS.md` (append) |
  | Generic | `--provider generic` | `.github/copilot-instructions.md` |

  Skill content is identical across providers — only the install path differs. A settings/setup UI can come later when there are enough settings to justify it.
- **Approve all safety:** "Approve all" moves every review task to done. No confirmation dialog needed — it's a deliberate action and easily reversible (just set status back).

---

## What We're NOT Building

- Settings UI / setup screen (config.yml + CLI flags are enough for now)
- Diff preview in review view
- Activity feed / timeline (potential future addition)
- List view changes
- Agent-specific enforcement (everything is convention-based)

---

## Implementation Scope

| Area | Change |
|------|--------|
| Rust backend | Add `confidence: Option<String>` to Task + TaskFrontmatter structs |
| Rust backend | Add required column check to `column_delete()` |
| Rust backend | Add `agent` section to Config struct (`auto_done`, `max_parallel`) |
| Rust backend | Update `untask skill install` for multiple files + `--provider` flag |
| Rust — Tauri IPC | Expose `confidence` in task list/show responses |
| Frontend — api.ts | Add `confidence: string \| null` to TaskDto |
| Frontend — stores.ts | Change ShellView `"next"` to `"review"` |
| UI — ReviewView | New `ReviewView.svelte` component in slot 4 |
| UI — ReviewView | "Approve all" button |
| UI — SidebarNav | Rename slot 4 item, new icon, add review count badge |
| UI — TaskModal | Parse body for agent sections, render distinctly |
| UI — TaskModal | Add Approve/Kick back buttons when status is `review` |
| UI — TaskModal | Optional review notes input on kick-back |
| UI — TaskModal | Show confidence label when present |
| UI — Kanban | Prevent deletion of required columns |
| Skill — untask.md | Trim to session-start only, add `--status` filter |
| Skill — untask-finish.md | New: task completion conventions |
| Skill — untask-docs.md | New: doc workflow instructions |
| Skill — untask-batch.md | New: parallel task processing |
