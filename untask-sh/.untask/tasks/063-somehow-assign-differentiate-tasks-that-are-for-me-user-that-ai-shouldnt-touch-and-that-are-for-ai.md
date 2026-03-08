---
id: 63
title: Somehow assign / differentiate tasks that are for me (user) that AI shouldnt touch and that are for AI ?
status: done
created: 2026-03-08
updated: 2026-03-08T14:28:46.752864Z
completed: 2026-03-08T14:28:46.752864Z
position: 2.0
confidence: high
---
Add `owner` field to Task struct. null/absent = AI-eligible (default), "user" = user-owned (agent skips). Toggle in modal metadata row, tiny icon on kanban card. `untask next` respects the flag.

See: docs/plans/2026-03-08-tags-owner-prompt-actions.md §2

## Agent Summary
Implemented owner flag through the full stack:
- Added `owner: Option<String>` to Task struct, TaskFrontmatter, TaskUpdate, and serialization
- Wired through Tauri commands (TaskDto, TaskUpdateDto) and TypeScript API types
- Added toggle button in TaskModal metadata row (shows “User” with person icon when owned, “AI” otherwise)
- Added user icon on Kanban cards next to priority dot for user-owned tasks
- `untask next` now filters out tasks with `owner: “user”` from open_tasks
- Added “Owner field” section to `untask.md` skill instructing agents to skip `owner: “user”` tasks when processing lists (since `untask list` doesn't filter by owner like `next` does)

## Review Notes
just quick question - when its owned by user, is it in rules that AI cant touch the task? lets say we have the task with owner user In “todo” and we tell Ai to process all “todo” tasks
