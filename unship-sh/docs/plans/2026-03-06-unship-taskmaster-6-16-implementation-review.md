# Implementation Review

## Plan Path

- `.taskmaster/tasks/task_006.md`
- `.taskmaster/tasks/task_016.md`

## Traceability Summary

- Taskmaster 6 (`Repair Command Implementation`): implemented in [crates/unship-core/src/repair.rs](/Users/marcusbenhard/Development/untitled/unship-sh/crates/unship-core/src/repair.rs) with read-only scanning, write-path repair, locking, and explicit action reporting. Review changes closed the status-normalization gap so alias statuses now repair to canonical column IDs instead of being left behind.
- Taskmaster 16 (`Desktop App Scaffold with Tauri 2 and Svelte 5`): implemented across [apps/desktop/src/App.svelte](/Users/marcusbenhard/Development/untitled/unship-sh/apps/desktop/src/App.svelte), [apps/desktop/src/app.css](/Users/marcusbenhard/Development/untitled/unship-sh/apps/desktop/src/app.css), [apps/desktop/src/main.ts](/Users/marcusbenhard/Development/untitled/unship-sh/apps/desktop/src/main.ts), [apps/desktop/src/lib/components/ScaffoldPanel.svelte](/Users/marcusbenhard/Development/untitled/unship-sh/apps/desktop/src/lib/components/ScaffoldPanel.svelte), and [apps/desktop/src-tauri/src/lib.rs](/Users/marcusbenhard/Development/untitled/unship-sh/apps/desktop/src-tauri/src/lib.rs). Review changes replaced the stock Tauri greet placeholder with a design-language-consistent shell, frontend dialog wiring, and self-hosted Geist fonts.

## Findings (by severity)

- P1: Repair only rewrote unknown statuses and left valid aliases like `to-do` untouched, so Taskmaster 6 was not actually normalizing statuses to canonical column IDs on the bulk repair path. Fixed in [crates/unship-core/src/repair.rs](/Users/marcusbenhard/Development/untitled/unship-sh/crates/unship-core/src/repair.rs#L13) and covered with new regressions in [crates/unship-core/tests/repair_test.rs](/Users/marcusbenhard/Development/untitled/unship-sh/crates/unship-core/tests/repair_test.rs#L87).
- P2: The desktop scaffold still shipped the stock `greet` starter flow, which meant Taskmaster 16 had backend plugin registration but no real shell structure, no project-selection entry point, and no component foundation for later desktop tasks. Fixed by replacing the starter with a split shell in [apps/desktop/src/App.svelte](/Users/marcusbenhard/Development/untitled/unship-sh/apps/desktop/src/App.svelte#L1), [apps/desktop/src/lib/components/SidebarNav.svelte](/Users/marcusbenhard/Development/untitled/unship-sh/apps/desktop/src/lib/components/SidebarNav.svelte#L1), and [apps/desktop/src/lib/components/ScaffoldPanel.svelte](/Users/marcusbenhard/Development/untitled/unship-sh/apps/desktop/src/lib/components/ScaffoldPanel.svelte#L1).
- P2: The desktop tokens referenced Geist but did not actually ship Geist, so the scaffold silently fell back to system fonts and drifted from the design language on machines without local installs. Fixed by self-hosting font packages in [apps/desktop/package.json](/Users/marcusbenhard/Development/untitled/unship-sh/apps/desktop/package.json), importing them in [apps/desktop/src/main.ts](/Users/marcusbenhard/Development/untitled/unship-sh/apps/desktop/src/main.ts#L1), and aligning the shell tokens in [apps/desktop/src/app.css](/Users/marcusbenhard/Development/untitled/unship-sh/apps/desktop/src/app.css#L1).

## Improvements Applied

- Added `noncanonical_statuses` reporting to the repair audit and canonicalized alias statuses during `repair`.
- Added two regression tests covering alias detection and alias-to-canonical repair behavior.
- Added a shared desktop shell component set (`WindowChrome`, `SidebarNav`, `ScaffoldPanel`, `PriorityDot`) plus a shadcn-style button primitive for later UI work.
- Wired the frontend to `@tauri-apps/plugin-dialog`, removed the unused Rust greet command, and updated app metadata and font loading so the scaffold is product-shaped rather than starter-shaped.

## Test Delta
- Before:
  - `cargo test -p unship-core --test repair_test -- --nocapture` -> 10 passed
  - `cargo build --workspace` -> passed
  - `cd apps/desktop && npm run check` -> passed
- After:
  - `cargo test -p unship-core --test repair_test -- --nocapture` -> 12 passed
  - `cargo build --workspace` -> passed
  - `cargo test --workspace -- --nocapture` -> 83 passed
  - `cd apps/desktop && npm run check` -> passed
  - `cd apps/desktop && npm run build` -> passed
- Gaps:
  - `npm run tauri dev` and the manual desktop smoke checks from Taskmaster 16 were not run here because this environment does not provide a usable interactive GUI session.
  - The desktop scaffold still has no automated UI interaction tests; current coverage is build/type-check only.

## Verification Run

- `cargo fmt --all`
- `cargo test -p unship-core --test repair_test -- --nocapture`
- `cargo build --workspace`
- `cargo test --workspace -- --nocapture`
- `cd apps/desktop && npm run check`
- `cd apps/desktop && npm run build`

## Verdict
PASS_WITH_CHANGES

## LESSONS_LEARNED
1. Bulk repair paths need their own normalization tests; write-path invariants in CRUD code do not automatically protect repair code.
2. A scaffold task is only really done when the starter template artifacts are removed and replaced with product-shaped structure.
3. Design-language typography requirements are implementation details, not comments; if the font is not bundled, the scaffold is incomplete.
