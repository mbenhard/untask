# Docs Folder Navigation Execution Plan

## Preconditions

- Confirm the recommended interaction model: source-aware tree + folder content pane.
- Keep v1 lean: no recursive folder delete, no drag-and-drop moving.
- Accept that some doc globs may be browse-only when no safe writable root can be inferred.
- Use a strict writable-root rule: only `<dir>/**/*.md` and `<dir>/*.md` patterns with a literal relative `<dir>` are writable.

## Task List
1. Add deterministic root inference, tree DTOs, and safe backend file-management primitives
2. Update docs refresh/state handling for directory events, open-doc path changes, and tree preservation
3. Replace the flat docs list with source-aware folder navigation
4. Add lean management flows and run end-to-end verification

## Verification Per Task
- Task 1:
  - Writable roots are inferred only from supported patterns
  - Unsupported patterns degrade to browse-only
  - Tree lists multiple roots, folders, empty folders, and docs correctly
  - Capability flags are correct for writable vs read-only roots
  - Traversal attempts are rejected
  - Cross-root move is rejected
- Task 2:
  - Folder create/delete triggers docs refresh even when no markdown file content changes
  - Expanded tree state is preserved across refresh
  - Current selection is preserved when possible after create/move/delete
  - Renaming or moving the open document updates the editor save target without dropping the in-memory buffer
- Task 3:
  - Docs view shows root/folder/doc hierarchy with preserved dense styling
  - Folder selection shows child items; doc selection opens editor
  - Breadcrumbs and row actions reflect the current selection correctly
- Task 4:
  - Can create doc, create folder, rename, move, and delete empty folders
  - Collisions, invalid names, and read-only states are handled inline
  - Keyboard navigation works for tree and actions
  - External file mutations produce correct stale/reload behavior

## Batch Size
Default: 3 tasks per batch

## Blockers and Escalation

- If glob-root inference proves inconsistent across real projects, stop and add an explicit writable docs roots config instead of guessing.
- If empty-folder support significantly complicates the API, ship browse/create doc first and add empty-folder management in the next batch.
- If watcher directory events are unreliable across platforms, fall back to explicit local tree mutation after successful file operations plus a coarse docs refresh.

## Completion Criteria

- Docs are navigable by source and folder rather than a single flat list.
- Core file-management flows are available without leaving the app.
- The UI remains dense, monochrome, and quiet instead of becoming a generic file browser.
- Unsupported glob patterns degrade to read-only browsing with clear feedback rather than broken actions.
- Open-doc rename/move preserves the user buffer and continues saving to the new path after success.
