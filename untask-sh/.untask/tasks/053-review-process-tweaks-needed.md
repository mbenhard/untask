---
id: 53
title: Review Process tweaks needed
status: done
created: 2026-03-08
updated: 2026-03-08T18:30:32.209590Z
completed: 2026-03-08T14:20:28.362627Z
position: 11.0
confidence: high
---
- [x] In Review process - after we click on approve/kick-back > dismiss the modal automatically
- [x] For some reason, in review process, we automatically focus on the Notes input area? even if there arent any notes, its weird.

## Agent Summary
Fixed both review process UI issues in TaskModal.svelte:
1. Added `handleClose()` after `approveTask()` and `kickBack()` save operations so the modal auto-dismisses.
2. Added `hasEditableNotes()` helper that strips agent sections before checking body content. Changed all 3 `showBody` computations to use it, preventing the notes editor from rendering/auto-focusing when only agent sections exist.