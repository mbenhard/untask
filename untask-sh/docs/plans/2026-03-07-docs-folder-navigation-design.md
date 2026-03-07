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
- Current desktop watcher refresh logic is file-oriented, so empty-folder creation/deletion will require directory-aware docs refresh rules.

## Architecture

Use a two-pane docs workspace:

- Left pane: source-aware tree.
- Right pane: either folder contents or the selected document editor.

Top-level tree nodes are writable or read-only doc roots inferred from config, for example `docs/` and `.untask/docs/`. Under each root, show folders and docs by filesystem path. Never merge folders across different roots even if names match.

The right pane changes by selection:

- Root or folder selected: show breadcrumb, folder actions, and a compact file list for that folder.
- Doc selected: show breadcrumb and editor.

This is the lean middle path between a useless flat list and an overbuilt file explorer.

### Writable Root Contract

The backend must treat doc roots as deterministic, not heuristic at render time.

- A config pattern is a writable root only when it is a relative literal directory prefix followed by a simple markdown matcher:
  - `<dir>/**/*.md`
  - `<dir>/*.md`
- The writable root is the literal `<dir>` prefix.
- Unsupported patterns are browse-only:
  - wildcards in directory names before the final markdown matcher
  - `?`, character classes, brace expansion, or multiple wildcard segments that prevent a single literal root
  - examples: `**/notes/*.md`, `docs/*/drafts/*.md`, `specs/{api,ui}/**/*.md`
- Multiple supported patterns that resolve to the same literal root collapse into one root node.
- Writes are allowed only inside a writable root. Cross-root move is rejected in v1.
- Writable roots should appear in the tree even when the directory does not exist yet, so first-create can materialize them.
- Browse-only patterns appear only through discovered docs, never as writable empty roots.

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

The tree payload should include:

- stable node path
- node kind: root | folder | doc
- relative path
- display name
- direct children
- capability flags: `can_create`, `can_rename`, `can_move`, `can_delete`, `read_only`

## Data Flow

On load, the app requests a docs tree instead of a flat doc list. The tree response includes:

- roots
- folders
- docs
- capability flags per node (`can_create`, `can_rename`, `can_delete`, `read_only`)

When the user selects a folder, the UI renders only direct children in the content pane. When the user selects a doc, the app loads the full content using the existing read flow.

Writes are optimistic only for local row states like inline rename. The source of truth remains the filesystem. After each create, rename, move, or delete, refresh the affected subtree and keep selection on the resulting node when possible.

User-initiated rename or move of the currently open document must follow a strict state transition:

- keep the in-memory editor buffer
- execute the backend operation first
- on success, replace `selectedDoc.path` with the new path, update breadcrumb/tree selection, and continue autosave against the new path without forcing a re-read
- on failure, preserve the old path and current buffer and show an inline error

Folder create/delete and doc move operations must also trigger tree refreshes even when no markdown file contents change. The watcher and local state update path should therefore treat relevant directory events as refresh-worthy under supported docs roots.

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
- User-initiated move across roots:
  - reject in v1 with a quiet inline message
  - do not silently copy or duplicate
- Missing writable root directory:
  - create the directory lazily on first successful create action

## Testing Strategy

- Writable root inference from config patterns
- Unsupported-pattern downgrade to browse-only roots
- Path traversal rejection for create/rename/move targets
- Cross-root move rejection
- Tree building from multiple roots and nested folders
- Empty folder visibility
- Duplicate basename handling across folders
- Create doc in root and nested folder
- Rename with collision
- Move between folders in same root
- Read-only behavior for ambiguous glob roots
- Create/delete folder watcher refresh behavior
- External file change refresh behavior
- Rename/move of the open document preserves the editor buffer and updates the save target
- Keyboard navigation for tree expand/collapse and doc selection

## Risks and Mitigations

- Risk: glob patterns do not always imply a safe writable root.
  - Mitigation: infer roots conservatively and mark unsupported patterns read-only.
- Risk: empty folders are invisible if tree is derived from docs only.
  - Mitigation: backend must enumerate directories, not just markdown files.
- Risk: watcher refresh misses folder-only changes.
  - Mitigation: treat relevant directory events as docs refresh triggers and preserve tree expansion/selection in state.
- Risk: the UI becomes too file-manager-like.
  - Mitigation: keep actions contextual, avoid drag-and-drop and recursive operations in v1.

## Open Questions

- Move is exposed only through a compact `Move to…` picker in v1.
- Folder creation is allowed only from writable roots and writable folders in v1.
