# Implementation Review

## Plan Path

- `docs/plans/2026-03-07-docs-folder-navigation-execution-plan.md`

## Traceability Summary

- Task 1 `implemented`
  - Deterministic writable-root inference, browse-only degradation, tree DTOs, and safe file-management primitives are implemented in `crates/unship-core/src/docs.rs`.
  - Tauri command exposure for the docs tree and file-management flows is implemented in `apps/desktop/src-tauri/src/commands.rs` and `apps/desktop/src-tauri/src/lib.rs`.
- Task 2 `implemented`
  - Directory-aware docs refreshes and changed-path event payloads are implemented in `apps/desktop/src-tauri/src/watcher.rs` and consumed in `apps/desktop/src/App.svelte`.
  - Open-doc path preservation and stale-state handling are implemented in `apps/desktop/src/lib/components/DocsEditor.svelte`.
- Task 3 `implemented`
  - The flat docs list was replaced by a folder-first workspace in `apps/desktop/src/lib/components/DocsViewer.svelte`.
  - Source-aware roots, preserved expansion, keyboard tree navigation, folder content panes, and dense monochrome presentation align with the approved plan.
- Task 4 `implemented`
  - Create doc, create folder, rename, move, delete doc, delete empty folder, inline errors, and read-only gating are wired into the desktop UI in `apps/desktop/src/lib/components/DocsViewer.svelte`.
  - External-mutation stale recovery is implemented in `apps/desktop/src/lib/components/DocsEditor.svelte`.

## Findings (by severity)

- `P1` fixed during review: the new `Save as new` recovery path for externally moved/deleted docs was using the last loaded `content` prop instead of the live editor buffer, so unsaved edits could be dropped during recovery. Fixed by surfacing live markdown updates from `MilkdownEditor` and saving that buffer in `DocsEditor`.

## Improvements Applied

- Added `onContentChange` plumbing in `apps/desktop/src/lib/components/MilkdownEditor.svelte` so parent components can observe the current markdown buffer.
- Updated `apps/desktop/src/lib/components/DocsEditor.svelte` to track live editor content, reset editor-local transient state on doc switches, and use the live buffer for `Save as new`.

## Test Delta

- Before:
  - `cargo test -p unship-core --test docs_test` passed (`19 passed`)
  - `cargo test -p unship-desktop` passed (`17 passed`)
  - `pnpm --dir apps/desktop check` passed with `0 errors` and the existing autofocus warnings outside docs scope
- After:
  - `cargo test -p unship-core --test docs_test` passed (`19 passed`)
  - `cargo test -p unship-desktop` passed (`17 passed`)
  - `pnpm --dir apps/desktop check` passed with `0 errors` and the same existing autofocus warnings outside docs scope
- Gaps:
  - No automated UI interaction test covers the stale-state recovery path; that behavior was validated by code inspection plus type/build/test coverage around the supporting layers.

## Verification Run

- `cargo test -p unship-core --test docs_test`
- `cargo test -p unship-desktop`
- `pnpm --dir apps/desktop check`

## Verdict

PASS_WITH_CHANGES

## LESSONS_LEARNED
1. Recovery actions for stale editors must read the live buffer, not cached loaded content.
2. Folder/file management flows need UI-state review in addition to green backend and type checks.
