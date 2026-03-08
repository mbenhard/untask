# untask — project companion skill

Use this skill at the start of every work session.

## Session start

1. Run `untask next --json` to see open tasks, recent completions, git state, and cleanup hints.
2. Pick a task to work on and run `untask status <id> in-progress`.
3. Use `untask search <query>` to find relevant tasks or docs.
4. Use `untask list --status <status> --json` to see tasks in a specific column.

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
