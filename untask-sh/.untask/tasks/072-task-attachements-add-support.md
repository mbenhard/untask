---
id: 72
title: Task attachements Improvements
status: done
created: 2026-03-08
updated: 2026-03-08T18:43:08.291705Z
completed: 2026-03-08T18:43:08.291704Z
position: 25.0
---
- [ ] in Task Cards > We need to be able to display 1st thumbnail of attachement as card header, that will look nice
- [ ] in Task Cards > We need to be able to support attachement upload/import with CMD+V when we create the task , during entering title task in card initially
- [ ] Think of other edge cases / flows we havent covered.

## Agent Summary
Implemented all 3 features from the plan:

1. **Thumbnail card headers** — New `CardThumbnail.svelte` component that lazily loads the first `image/*` attachment as a 72px edge-to-edge header via `getAttachmentDataUrl`. Includes module-level `Map` cache to avoid repeated IPC calls. Silently hides on error.

2. **CMD+V paste during quick-add** — Added `PastedImage` buffer state and `handleQuickAddPaste` handler. Images are buffered in memory during title entry, then flushed as attachments via `attachFileBytes` after task creation. Visual "N images pasted" indicator shown below textarea. Buffer cleared on Escape, blur, or successful submit. 25 MB total cap.

3. **Edge cases** — Analyzed 9 edge cases (deleted-on-disk, large images, SVGs, animated GIFs, etc.). Most handled by existing error paths. Added thumbnail cache (Task 7) as the only actionable fix.

No backend changes. Two files modified: `CardThumbnail.svelte` (new), `Kanban.svelte` (modified). `svelte-check`: 0 errors, 0 warnings.

## Deferred
- Backend thumbnail generation (Rust `image` crate) for smaller data transfer
- Drag-and-drop files onto quick-add textarea
- Attachment reordering UI
- Intersection observer for lazy thumbnail loading in large columns