# unship-finish — completing a task

Use this skill when you are done working on a task.

## Steps

1. **Write `## Agent Summary`** in the task body — brief description of what was done and the approach taken.
2. **Write `## Deferred`** if anything was intentionally skipped or left for follow-up. Omit this section if nothing was deferred.
3. **Set confidence** in the task frontmatter: `confidence: low | medium | high`.
4. **Check config** — read `.unship/config.yml` for the `agent.auto_done` setting:
   - If `false` or missing: run `unship status <id> review`
   - If `true`: run `unship done <id>`
5. **Verify** — run `unship repair --check` to confirm project integrity.

## Section format

Write these markdown sections at the end of the task body:

```markdown
## Agent Summary
Brief description of what was done and the approach taken.

## Deferred
- Items intentionally skipped
- Things left for follow-up
```

## Re-work cycle

If the task has `## Review Notes` written by a human reviewer, read them carefully — they describe what needs fixing. When re-submitting:
- Overwrite `## Agent Summary` and `## Deferred` with updated content.
- The `## Review Notes` section will be overwritten by the human if they kick back again.

## Reserved headings

These h2 headings are reserved and must not be used in regular task descriptions:
- `## Agent Summary`
- `## Deferred`
- `## Review Notes`
