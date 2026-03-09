# unship-docs — working with project docs

Use this skill when you need to work with project documentation.

## Doc locations

- `.unship/docs/` — default docs directory (always scanned)
- `docs/` — also scanned by default
- Additional globs can be configured in `.unship/config.yml` under `docs:`

## Commands

| Command | Description |
|---------|-------------|
| `unship docs` | List all discovered docs |
| `unship docs show <name>` | Read a doc by name or path |

## Conventions

- Keep long-lived project docs in `.unship/docs/`.
- Write plans and review notes into tracked repo locations such as `docs/plans/` when the project already uses them.
- PRD documents use `type: prd` frontmatter and can have tasks linked via the `prd` field in task frontmatter.
