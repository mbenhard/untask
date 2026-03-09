---
id: 56
title: Review Process
status: done
tags:
- feature
created: 2026-03-08
updated: 2026-03-08T14:50:50.649413Z
completed: 2026-03-08T13:15:27.626147Z
position: 5.0
confidence: high
---
how feasible is it to add a feature where we have option to “Approve” review or “Approve & Commit” ? using gh cli or something like that that would be fast and would work in our app?

We need to cover all edge cases (what if AI agent commited, what if we processed it and not the AI agent, etc)

## Agent Summary
Investigated feasibility — **very feasible**, low effort. Here's the analysis:

### What exists today
- `crates/unship-core/src/git.rs` already uses `std::process::Command::new("git")` for read-only operations (branch, log, status)
- The Tauri backend already has the `get_next` command that surfaces git info
- The ReviewView + TaskModal already have the "Approve" button wired up

### Implementation approach
Add a new Tauri command (e.g. `approve_and_commit`) that:
1. Calls `git add .unship/` (only stage task file changes, not unrelated code)
2. Calls `git commit -m "done: #<id> <title>"` with a conventional message
3. Returns success/failure to the frontend
4. Frontend adds an "Approve & Commit" button next to "Approve" in the review footer

### Edge cases and how to handle them

| Scenario | Detection | Behavior |
|----------|-----------|----------|
| AI agent already committed | `git status .unship/` shows clean | Show "Approve" only (no changes to commit) |
| Human processed it (no agent) | Same — check if .unship/ has uncommitted changes | Same logic |
| Mixed: some task files changed, some not | `git status .unship/tasks/<id>*` | Only commit the specific task file |
| Uncommitted code changes alongside | N/A — we only `git add .unship/` | Code changes stay unstaged, safe |
| No git repo | `git rev-parse --git-dir` fails | Hide commit button, show "Approve" only |
| Dirty working tree conflicts | Git will refuse to commit if there's a merge conflict | Show error flash |

### Recommended UX
- **"Approve"** — marks done, no git action (current behavior)
- **"Approve & Commit"** — marks done + commits `.unship/` changes
- Gray out "& Commit" when `git status .unship/` shows no changes
- Optional: "Approve All & Commit" on the ReviewView bulk action

### Effort estimate
- ~1 new Rust command in `commands.rs` (~30 lines)
- ~1 helper in `git.rs` for commit (~20 lines)
- ~10 lines of frontend changes (add button, call new API)
- Total: small feature, can be done in a single task