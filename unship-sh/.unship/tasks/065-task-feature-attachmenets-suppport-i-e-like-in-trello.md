---
id: 65
title: Task Feature - Attachmenets suppport (.i.e. like in Trello)
status: done
created: 2026-03-08
updated: 2026-03-08T18:44:12.581419Z
completed: 2026-03-08T18:44:12.581417Z
position: 1.0
confidence: high
---

## Agent Summary

Created implementation plan at `docs/plans/2026-03-08-task-attachments.md` with 12 tasks covering the full stack: Rust data model (`AttachmentRef` struct in frontmatter), attachments module for file CRUD, Tauri IPC commands, TypeScript API layer, `AttachmentList.svelte` component, TaskModal integration, and kanban card indicator.

Key decisions documented:
- Metadata in YAML frontmatter (consistent with all other task fields)
- Files stored in `.unship/attachments/{task_id}/{filename}` with collision handling
- 25 MB per-file size limit
- Tauri asset protocol for image previews
- Both file dialog and drag-and-drop support planned

Open questions flagged: gitignore policy for attachments, drag-and-drop scope for v1, clipboard paste support.
