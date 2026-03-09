# Implementation Review

## Plan Path

- `docs/plans/2026-03-08-prd-implementation.md`

## Traceability Summary

- Task 1 implemented: task PRD linkage added in `crates/unship-core/src/task.rs` and `crates/unship-core/src/store.rs`, with round-trip and linkage-count coverage in `crates/unship-core/tests/store_test.rs`.
- Tasks 2-3 implemented: doc frontmatter parsing, `DocType`, and tree exposure landed in `crates/unship-core/src/docs.rs`, with parsing/tree coverage in `crates/unship-core/tests/docs_test.rs`.
- Task 4 implemented: PRD-linked task counting shipped in `crates/unship-core/src/store.rs` and is covered in `crates/unship-core/tests/store_test.rs`.
- Task 5 implemented: CLI `add --prd` and `docs list --type` shipped in `crates/unship-cli/src/cli.rs`, `crates/unship-cli/src/commands/add.rs`, `crates/unship-cli/src/commands/docs.rs`, and `crates/unship-cli/src/main.rs`.
- Task 6 implemented: Tauri DTOs and IPC exposure for `prd`, `doc_type`, and PRD counts shipped in `apps/desktop/src-tauri/src/commands.rs` and `apps/desktop/src-tauri/src/lib.rs`, with matching client types in `apps/desktop/src/lib/api.ts`.
- Tasks 7-8 implemented: Docs view PRD labeling, count display, and PRD-aware new-doc flow shipped in `apps/desktop/src/lib/components/DocsViewer.svelte`.
- Task 9 partially verified: Rust test suite, desktop typecheck, desktop production build, and CLI smoke flow passed. Interactive `pnpm tauri dev` visual verification was not run in this headless review environment.

## Findings (by severity)

- P2 fixed: PRD task counts in the Docs view could go stale after task refreshes or rapid PRD selection changes because the fetch effect only depended on `externalRevision` and accepted out-of-order async responses. Fixed in `apps/desktop/src/lib/components/DocsViewer.svelte` by keying the effect to `refreshRevision` and discarding stale responses with a request id guard.

## Improvements Applied

- Updated `apps/desktop/src/lib/components/DocsViewer.svelte` so PRD task counts refresh on the normal data refresh cycle and cannot be overwritten by an older async request.

## Test Delta

- Before:
  - `cargo test` passed.
  - `pnpm --dir apps/desktop check` passed with 4 pre-existing Svelte accessibility warnings.
- After:
  - `cargo test` passed again.
  - `pnpm --dir apps/desktop check` passed again with the same 4 pre-existing Svelte accessibility warnings.
  - `pnpm --dir apps/desktop build` passed, with the same accessibility warnings plus a Vite chunk-size warning.
- Gaps:
  - No automated frontend test covers PRD count refresh behavior or the async selection race.
  - No explicit CLI integration test currently covers `add --prd` or `docs list --type`.
  - `pnpm tauri dev` was not visually exercised in this environment.

## Verification Run

- `cargo test`
- `pnpm --dir apps/desktop check`
- `pnpm --dir apps/desktop build`
- Manual CLI smoke test in a temp project:
  - `unship init`
  - write `.unship/docs/spec.md` with `type: prd`
  - `unship add "Build feature" --prd .unship/docs/spec.md`
  - `unship docs list --type prd`
  - `unship --json show 1`

## Verdict

PASS_WITH_CHANGES

## LESSONS_LEARNED
1. PRD-linked UI state has to refresh on task mutations, not only document mutations.
2. Async metadata fetches in the docs pane need stale-response guards because selection can change faster than IPC round-trips.
3. The PRD flow is wired end-to-end, but it still needs targeted integration coverage for the new CLI flags and docs count behavior.
