# Docs Folder Navigation Execution Plan

## Preconditions

- Confirm the recommended interaction model: source-aware tree + folder content pane.
- Keep v1 lean: no recursive folder delete, no drag-and-drop moving.
- Accept that some doc globs may be browse-only when no safe writable root can be inferred.

## Task List
1. Add backend tree and file-management primitives
2. Replace flat docs list with source-aware folder navigation
3. Add lean management flows and edge-state handling
4. Verify keyboard, watcher, and filesystem behavior

## Verification Per Task
- Task 1:
  - Tree lists multiple roots, folders, empty folders, and docs correctly
  - Capability flags are correct for writable vs read-only roots
- Task 2:
  - Docs view shows root/folder/doc hierarchy with preserved dense styling
  - Folder selection shows child items; doc selection opens editor
- Task 3:
  - Can create doc, create folder, rename, move, and delete empty folders
  - Collisions, invalid names, and read-only states are handled inline
- Task 4:
  - Keyboard navigation works for tree and actions
  - Watcher refresh preserves expansion and selection when possible
  - External file mutations produce correct stale/reload behavior

## Batch Size
Default: 3 tasks per batch

## Blockers and Escalation

- If glob-root inference proves inconsistent across real projects, stop and add an explicit writable docs roots config instead of guessing.
- If empty-folder support significantly complicates the API, ship browse/create doc first and add empty-folder management in the next batch.

## Completion Criteria

- Docs are navigable by source and folder rather than a single flat list.
- Core file-management flows are available without leaving the app.
- The UI remains dense, monochrome, and quiet instead of becoming a generic file browser.
- Unsupported glob patterns degrade to read-only browsing with clear feedback rather than broken actions.
