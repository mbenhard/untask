---
id: 62
title: Approve & Commit feature — design and plan git commit integration for task approval
status: backlog
tags:
- brainstorming
- planning
created: 2026-03-08
updated: 2026-03-08T13:18:15.745913Z
position: 22.0
---
Needs brainstorming/planning before implementation. See #56 for the feasibility analysis.

Key decisions to make:
- "Approve" vs "Approve & Commit" — two buttons or a dropdown?
- Scope: only `.untask/` files or allow including code changes?
- Commit message format convention
- "Approve All & Commit" bulk action on ReviewView?
- Push behavior: commit-only or optional commit+push?
- Edge case handling: no git repo, already committed, merge conflicts
