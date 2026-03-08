---
id: 10
title: Can you explain how does the git/github integration between it and untask works?
status: done
created: 2026-03-07
updated: 2026-03-08T13:03:01.415307Z
completed: 2026-03-07T14:20:41.653479Z
position: 22.0
---

## Answer

### Git Integration (read-only, local only)

Untask has a single git module (`crates/untask-core/src/git.rs`) that **reads** local git metadata via subprocess calls to the system `git` binary. It does NOT use libgit2 or any git library.

What it reads:
- **Branch name** — `git branch --show-current`
- **Uncommitted changes** — `git status --porcelain`
- **Recent commits** — `git log -n{limit} --format=%H%x00%s%x00%aN%x00%aI`

This data is used in one place: the `untask next` command (`crates/untask-core/src/next.rs`), which shows developers their recent git activity alongside open tasks for context when planning work.

If the project is not inside a git repo, everything still works — git summary is simply `None`.

### GitHub Integration

**There is none.** Untask does not authenticate with GitHub, call the GitHub API, or sync with issues/PRs. The `.github/workflows/` files are standard CI/CD pipelines (build, test, release) — external to untask's functionality.

### Task Storage

Tasks are **plain Markdown files with YAML frontmatter** in `.untask/tasks/`. They are version-controlled by git the same way any other file is — users commit the `.untask/` directory. Untask never creates git commits automatically.

### Summary

Untask is a project-local task manager that *complements* git. It reads git state for context but doesn't write to it or integrate with any remote service.
