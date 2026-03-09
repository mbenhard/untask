# Implementation Review

## Plan Path

- `.taskmaster/tasks/task_017.md`
- `.taskmaster/tasks/task_018.md`
- `.taskmaster/tasks/tasks.json`

## Traceability Summary

- Task 17: implemented with targeted fixes in `apps/desktop/src-tauri/src/state.rs`, `apps/desktop/src-tauri/src/commands.rs`, `apps/desktop/src-tauri/src/lib.rs`, and `apps/desktop/src/lib/api.ts`.
  - Backend project lifecycle commands now include explicit close behavior.
  - Project watching now emits debounced desktop refresh events for `.unship/` and configured doc globs, replacing the active watcher on project changes.
  - Doc save resolution now goes through the shared docs discovery layer instead of writing arbitrary joined paths.
  - Desktop backend tests now cover recent-project persistence, configured-doc resolution, and out-of-scope doc write rejection.
- Task 18: implemented with targeted fixes in `apps/desktop/src/App.svelte`, `apps/desktop/src/lib/frontmatter.ts`, and the desktop component files.
  - Frontend now listens for backend refresh events and refreshes shell data when external edits land.
  - Switching projects now tears down backend state instead of only clearing frontend stores.
  - Unindexed tasks are surfaced non-destructively in board/list/detail views instead of attempting invalid detail fetches or edits.
  - Doc frontmatter preservation now keeps the exact prefix block instead of trimming and rewriting it.

## Findings (by severity)

- P1: `save_doc` previously accepted absolute or arbitrary project-relative paths and wrote them with `root.join(path)`, which could overwrite non-doc files and did not honor configured doc globs. Fixed by resolving writes through `DocsStore::get`.
- P1: Task 17 promised backend watching and refresh events, but the desktop backend had no watcher/event path at all. Fixed by adding project watcher state and Tauri refresh events that swap cleanly on project change and close.
- P1: Clicking an unindexed task could attempt `getTask(task.id!)`, leading to invalid detail fetches and an edit surface for tasks that Unship does not manage. Fixed by treating unindexed tasks as read-only review items and surfacing them explicitly.
- P2: Docs frontmatter handling trimmed leading whitespace and reinserted a synthetic newline on save, which risked markdown round-trip drift. Fixed by extracting and replaying the exact frontmatter prefix.
- P3: `MilkdownEditor.svelte` carried a Svelte warning about capturing the initial `content` value only. Fixed by normalizing the editor baseline state during initialization and save.

## Improvements Applied

- Added desktop backend tests and watcher snapshot coverage.
- Added `close_project` to keep backend and frontend project lifecycle in sync.
- Standardized doc references to project-relative paths in the desktop UI.
- Added shell-level warnings plus per-row/detail handling for unindexed and unmatched tasks.

## Test Delta
- Before:
  - `cargo test -p unship-desktop` passed with 0 desktop tests.
  - `pnpm --dir apps/desktop check` passed with 1 Svelte warning in `MilkdownEditor.svelte`.
- After:
  - `cargo test -p unship-desktop` passes with 6 desktop tests.
  - `pnpm --dir apps/desktop check` passes with 0 warnings.
- Gaps:
  - No automated end-to-end Tauri smoke test yet for refresh-event delivery, recent-project switching, or external CLI edit flows.
  - No frontend unit tests yet for frontmatter parsing or shell warning rendering.

## Verification Run

- `cargo fmt --all`
- `cargo test -p unship-desktop`
- `pnpm --dir apps/desktop check`

## Verdict
PASS_WITH_CHANGES

## LESSONS_LEARNED
1. Desktop command layers should resolve writes through the same discovery path they use for reads, especially when config-driven globs are involved.
2. Unindexed content needs explicit review-only handling; silently assuming managed IDs turns repair-edge cases into UI bugs.
3. A polling watcher is sufficient for desktop coherence here, but it still needs clear project teardown semantics to avoid stale refreshes.
