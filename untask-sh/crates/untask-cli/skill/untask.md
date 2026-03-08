# untask — project companion skill

Use this skill at the start of every work session.

## Session start

1. Run `untask next --json` to see open tasks, recent completions, git state, and cleanup hints.
2. Pick a task to work on and run `untask status <id> in-progress`.
3. Use `untask search <query>` to find relevant tasks or docs.
4. Use `untask list --status <status> --json` to see tasks in a specific column.

**When the user asks to process tasks in a specific column** (e.g. "process todo tasks"), use `untask list --status <status> --json` to fetch only those tasks — do NOT use `untask next` which returns all open tasks.

## Owner field

Tasks with `owner: "user"` belong to the human and **must not be worked on by the agent**. Do not change their status, edit their content, or pick them up for processing.

- `untask next` pre-filters these out automatically.
- `untask list` does **not** filter by owner — it returns all tasks. When processing a list, always check each task's `owner` field and skip any where `owner` is `"user"`.

## Completing a task

When you are done working on a task, you MUST follow these steps before moving on:

1. **Write `## Agent Summary`** in the task body — brief description of what was done and the approach taken.
2. **Write `## Deferred`** if anything was intentionally skipped or left for follow-up. Omit if nothing was deferred.
3. **Set confidence** in the task frontmatter: `confidence: low | medium | high`.
4. **Set status** — run `untask status <id> review` (tasks go to review by default so a human can approve them).
5. **Verify** — run `untask repair --check` to confirm project integrity.

### Section format

Write these markdown sections at the end of the task body:

```markdown
## Agent Summary
Brief description of what was done and the approach taken.

## Deferred
- Items intentionally skipped
- Things left for follow-up
```

### Re-work cycle

If the task has `## Review Notes` written by a human reviewer, read them carefully — they describe what needs fixing. When re-submitting, overwrite `## Agent Summary` and `## Deferred` with updated content.

### Reserved headings

These h2 headings are reserved and must not be used in regular task descriptions:
`## Agent Summary`, `## Deferred`, `## Review Notes`

## Commands reference

| Command | Description |
|---------|-------------|
| `untask next` | Show next actions summary |
| `untask list` | List all tasks |
| `untask list --status <status>` | List tasks in a specific column |
| `untask show <id>` | Show task details |
| `untask status <id> <status>` | Change task status |
| `untask done <id>` | Mark task as done |
| `untask add <title>` | Create a new task |
| `untask search <query>` | Search tasks and docs |
| `untask docs` | List project docs |
| `untask docs show <name>` | Show a doc |
| `untask repair --check` | Check project integrity |
| `untask repair --write` | Fix integrity issues |
