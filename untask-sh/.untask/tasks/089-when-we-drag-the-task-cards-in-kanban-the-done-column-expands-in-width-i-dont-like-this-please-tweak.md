---
id: 89
title: When we drag the task cards in Kanban, the “Done” column expands in width - I dont like this, please tweak. Maybe it could expand only when we hover over it with the dragged card?
status: done
created: 2026-03-09
updated: 2026-03-09T08:51:03.146633Z
completed: 2026-03-09T08:51:03.146632Z
position: 3.0
confidence: high
---

## Agent Summary
Changed the done strip width logic from expanding on any drag start (`isDragging`) to expanding only when hovering over it with the dragged card (`doneStripDragOver`). Single line change in `Kanban.svelte:660`. The strip stays at its collapsed 56px during drag and smoothly animates to 120px only when the user hovers over it with a dragged card.
