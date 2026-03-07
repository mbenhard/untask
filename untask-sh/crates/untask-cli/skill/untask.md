# untask — project companion skill

Use this skill at the start of every session and before/after completing work.

## Session start

1. Run `untask next --json` to see open tasks, recent completions, git state, and cleanup hints.
2. Pick a task to work on and run `untask status <id> in-progress`.

## During work

- Keep long-lived project docs in `.untask/docs/`.
- Write plans and review notes into tracked repo locations such as `docs/plans/` when the project already uses them.
- Use `untask search <query>` to find relevant tasks or docs.
- Use `untask docs show <name>` to read project documentation.

## After completing work

1. Run `untask done <id>` to mark the task as done.
2. Run `untask repair --check` to verify project integrity.
3. If issues are found, run `untask repair --write` to fix them.

## Commands reference

| Command | Description |
|---------|-------------|
| `untask next` | Show next actions summary |
| `untask list` | List all tasks |
| `untask show <id>` | Show task details |
| `untask status <id> <status>` | Change task status |
| `untask done <id>` | Mark task as done |
| `untask add <title>` | Create a new task |
| `untask search <query>` | Search tasks and docs |
| `untask docs` | List project docs |
| `untask docs show <name>` | Show a doc |
| `untask repair --check` | Check project integrity |
| `untask repair --write` | Fix integrity issues |
