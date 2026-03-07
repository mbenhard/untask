# Docs Folder Navigation Design

## Objective

Replace the flat docs list with a folder-first navigator that makes large doc sets scannable and supports the core file-management actions users actually need: create doc, create folder, rename, move, and delete.

## Scope

- Add a compact folder tree for docs sources.
- Show folder contents and doc editor in the main pane.
- Support create doc, create folder, rename, move, and delete flows.
- Preserve the current dense monochrome Untask design language.
- Handle multiple configured docs roots without merging unrelated paths.

## Non-Goals

- Building a full Finder-style file manager.
- Recursive folder delete in v1.
- Drag-and-drop file moving in v1.
- Per-file metadata, favorites, sharing, or version history.

## Constraints

- Must follow `docs/untask-design-language.md`: monochrome, dense spacing, borders over fills, restrained motion, Geist + Geist Mono.
- Current docs API only supports list/read/save, so management actions need backend additions.
- Configured doc globs may not always map cleanly to a writable root directory.

## Architecture

Use a two-pane docs workspace:

- Left pane: source-aware tree.
- Right pane: either folder contents or the selected document editor.

Top-level tree nodes are writable or read-only doc roots inferred from config, for example `docs/` and `.untask/docs/`. Under each root, show folders and docs by filesystem path. Never merge folders across different roots even if names match.

The right pane changes by selection:

- Root or folder selected: show breadcrumb, folder actions, and a compact file list for that folder.
- Doc selected: show breadcrumb and editor.

This is the lean middle path between a useless flat list and an overbuilt file explorer.

## Components and Interfaces

- `DocsSidebarTree`
  - Collapsible roots and folders
  - 36-40px rows
  - thin separators, tiny chevrons, no colorful icons
- `DocsFolderView`
  - breadcrumb
  - `New doc`
  - `New folder`
  - overflow menu for rename/delete/move
  - list of direct child folders and docs
- `DocsEditorHeader`
  - breadcrumb
  - rename
  - move
  - delete
- Backend commands
  - `list_docs_tree`
  - `create_doc`
  - `create_doc_folder`
  - `rename_doc_path`
  - `move_doc_path`
  - `delete_doc`
  - `delete_doc_folder`

## Data Flow

On load, the app requests a docs tree instead of a flat doc list. The tree response includes:

- roots
- folders
- docs
- capability flags per node (`can_create`, `can_rename`, `can_delete`, `read_only`)

When the user selects a folder, the UI renders only direct children in the content pane. When the user selects a doc, the app loads the full content using the existing read flow.

Writes are optimistic only for local row states like inline rename. The source of truth remains the filesystem. After each create, rename, move, or delete, refresh the affected subtree and keep selection on the resulting node when possible.

## Error Handling

- Name collision: block and show inline error with a suggested next name like `untitled-2.md`.
- Invalid filename characters or slash entry: reject inline before submit.
- Read-only root derived from a non-writable or ambiguous glob: show docs but disable create/move/rename.
- Folder delete:
  - v1 only allows deleting empty folders.
  - Non-empty delete shows a quiet explanation instead of recursive confirmation complexity.
- External rename/delete while open:
  - show a slim stale-state notice
  - preserve unsaved editor content until user chooses reload or save-as-new

## Testing Strategy

- Tree building from multiple roots and nested folders
- Empty folder visibility
- Duplicate basename handling across folders
- Create doc in root and nested folder
- Rename with collision
- Move between folders in same root
- Read-only behavior for ambiguous glob roots
- External file change refresh behavior
- Keyboard navigation for tree expand/collapse and doc selection

## Risks and Mitigations

- Risk: glob patterns do not always imply a safe writable root.
  - Mitigation: infer roots conservatively and mark unsupported patterns read-only.
- Risk: empty folders are invisible if tree is derived from docs only.
  - Mitigation: backend must enumerate directories, not just markdown files.
- Risk: the UI becomes too file-manager-like.
  - Mitigation: keep actions contextual, avoid drag-and-drop and recursive operations in v1.

## Open Questions

- Should move be exposed only through a compact `Move to…` picker in v1, or also through drag-and-drop in the tree later.
- Should folder creation be allowed only under writable roots and folders, or also from a global command palette when a target is chosen.
