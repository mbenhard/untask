# unship — project companion skill

Use this skill at the start of every work session.

## Session start

1. Run `unship next --json` to see open tasks, recent completions, git state, and cleanup hints.
2. Pick a task to work on and run `unship status <id> in-progress`.
3. Use `unship search <query>` to find relevant tasks or docs.
4. Use `unship list --status <status> --json` to see tasks in a specific column.

**When the user asks to process tasks in a specific column** (e.g. "process todo tasks"), use `unship list --status <status> --json` to fetch only those tasks — do NOT use `unship next` which returns all open tasks.

## Owner field

Tasks with `owner: "user"` belong to the human and **must not be worked on by the agent**. Do not change their status, edit their content, or pick them up for processing.

- `unship next` pre-filters these out automatically.
- `unship list` does **not** filter by owner — it returns all tasks. When processing a list, always check each task's `owner` field and skip any where `owner` is `"user"`.

## Attachments

Task JSON payloads include an `attachments` array with filename, MIME type, size, and created timestamp metadata. Treat attachments as part of the task context.

- If an attached file looks relevant, explicitly mention whether you reviewed it or not.
- Do not assume the copied desktop prompt contains the file contents; attachment files may need separate inspection.
- `owner: "user"` still blocks agent action even when attachments are present.

## Completing a task

When you are done working on a task, you MUST follow these steps before moving on:

1. **Write `## Agent Summary`** in the task body — brief description of what was done and the approach taken.
2. **Write `## Deferred`** if anything was intentionally skipped or left for follow-up. Omit if nothing was deferred.
3. **Set confidence** in the task frontmatter: `confidence: low | medium | high`.
4. **Set status** — run `unship status <id> review` (tasks go to review by default so a human can approve them).
5. **Verify** — run `unship repair --check` to confirm project integrity.

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
| `unship next` | Show next actions summary |
| `unship list` | List all tasks |
| `unship list --status <status>` | List tasks in a specific column |
| `unship show <id>` | Show task details |
| `unship status <id> <status>` | Change task status |
| `unship done <id>` | Mark task as done |
| `unship add <title>` | Create a new task |
| `unship search <query>` | Search tasks and docs |
| `unship docs` | List project docs |
| `unship docs show <name>` | Show a doc |
| `unship repair --check` | Check project integrity |
| `unship repair --write` | Fix integrity issues |
