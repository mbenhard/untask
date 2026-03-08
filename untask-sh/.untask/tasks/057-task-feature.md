---
id: 57
title: Task Feature - Tags/Types?
status: done
created: 2026-03-08
updated: 2026-03-08T18:30:32.220195Z
completed: 2026-03-08T14:23:49.543561Z
position: 12.0
confidence: high
---
Enhanced tag picker: Replace raw text input with a popover showing all tags in use across the project (deduplicated, sorted by frequency). Multi-select, type-to-filter, Enter to create new. Add deterministic colored dots next to tags on kanban cards (hash-based color from tag string).

See: docs/plans/2026-03-08-tags-owner-prompt-actions.md §1

## Agent Summary
Implemented enhanced tag system across the full stack:
- Added `list_all_tags` Tauri command that aggregates all tags with counts, sorted by frequency
- Created `TagPicker.svelte` component using Bits UI Popover: shows all project tags, type-to-filter, multi-select toggle, create new inline
- Created `tagColor.ts` utility with deterministic hash-based color mapping (8-color muted palette)
- Added colored dots to tag badges in both TaskModal and Kanban cards
- Replaced old inline text input tag flow with the new popover-based picker