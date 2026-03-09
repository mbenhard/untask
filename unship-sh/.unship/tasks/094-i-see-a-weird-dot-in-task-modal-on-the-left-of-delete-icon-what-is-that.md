---
id: 94
title: I see a weird dot in Task Modal on the left of Delete icon - what is that?
status: review
created: 2026-03-09
updated: 2026-03-09T14:18:01.625974Z
position: 3.0
confidence: high
---

## Agent Summary
The dot was a 6px unsaved-changes indicator (`bodyDirty`) rendered to the left of the delete icon in `TaskModalActionBar.svelte`. Since the editor already saves on blur (before any close/delete action can fire), the indicator was redundant. Removed the dot element, the `bodyDirty` prop from the action bar component, and the prop binding from `TaskModal.svelte`.

Files changed:
- `apps/desktop/src/lib/components/TaskModalActionBar.svelte` — removed dot span and `bodyDirty` prop
- `apps/desktop/src/lib/components/TaskModal.svelte` — removed `{bodyDirty}` prop binding
