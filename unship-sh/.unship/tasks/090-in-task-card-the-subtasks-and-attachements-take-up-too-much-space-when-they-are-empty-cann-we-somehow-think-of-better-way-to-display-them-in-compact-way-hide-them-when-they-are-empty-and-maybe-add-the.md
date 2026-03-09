---
id: 90
title: in Task Card > the Subtasks and Attachements take up too much space when they are empty, cann we somehow think of better way to display them in compact way + hide them when they are empty and maybe add the “add subtask/attachjememtn” to the row above?
status: review
created: 2026-03-09
updated: 2026-03-09T13:15:37.108674Z
position: 3.0
confidence: high
---
- [ ] test 1
- [ ] test 2

## Agent Summary
Hide empty Subtasks and Attachments sections in the task modal to reclaim vertical space. When either section has no items, it collapses entirely and compact “+ subtask” / “+ attachment” buttons appear inline in the metadata row (alongside Status, Tags, Owner). Clicking these triggers the same add flows — subtask inline input or file picker dialog. Once items exist, the full bordered sections reappear as before.

Changes:
- **SubtaskList.svelte**: Visibility changed from “always show in edit mode” to “show when has subtasks or actively adding”. Exported `openAddInput()` so TaskModal can trigger it.
- **AttachmentList.svelte**: Visibility changed to “show only when has attachments”. Exported `handleAttach()`. Removed empty-state “No attachments yet.” text.
- **TaskModal.svelte**: Added inline dashed-border “+ subtask” and “+ attachment” buttons in the metadata row (shown only when respective sections are empty). Added `handleInlineAttach()` fallback that works even when AttachmentList isn't mounted.
