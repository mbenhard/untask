# Implementation Review

## Plan Path

- `.taskmaster/tasks/task_019.md`
- `.taskmaster/tasks/tasks.json` (`id: 19`)
- `docs/plans/2026-03-06-unship-implementation.md` (`Task 19`)

## Traceability Summary

- Taskmaster 19 is implemented across `apps/desktop/src-tauri/src/watcher.rs`, `apps/desktop/src-tauri/src/state.rs`, `apps/desktop/src/App.svelte`, `.github/workflows/ci.yml`, and `.github/workflows/release.yml`.
- Desktop backend watching now uses a real `notify` watcher with Tauri refresh events, debounce, and project teardown instead of a filesystem snapshot polling loop.
- Frontend shell refresh now coalesces bursty watcher events before reloading tasks, docs, and config.
- CI and release workflow files are present, parse as valid YAML, and the local desktop production build succeeds, which confirms the release workflow’s core packaging path matches the current repo layout.

## Findings (by severity)

- P1: Task 19 explicitly called for a `notify`-based desktop watcher, but the implementation in `apps/desktop/src-tauri/src/state.rs` was still a 700ms polling snapshot loop over the project filesystem. That diverged from the approved task, delayed refreshes, and expanded the maintenance surface. Fixed by extracting a dedicated `apps/desktop/src-tauri/src/watcher.rs` module that uses `notify::recommended_watcher`, a 150ms quiet-window debounce, and filtered project refresh events.
- P2: The desktop frontend listened to backend refresh events but immediately reloaded all shell data on every emission. That left the UI exposed to event bursts during atomic writes or rapid save sequences even after the backend was corrected. Fixed by adding a 120ms client-side debounce in `apps/desktop/src/App.svelte`.
- P2: The new CI workflow validated desktop typecheck, clippy, and build, but it skipped the desktop Rust unit tests entirely. That left the watcher filtering/debounce logic unguarded in CI. Fixed by adding `cargo test -p unship-desktop` to `.github/workflows/ci.yml`.

## Improvements Applied

- Extracted the desktop watcher into its own module and added focused unit tests for relevance filtering, config-sensitive doc detection, and debounce behavior.
- Added the `notify` dependency explicitly to the desktop crate and kept watcher lifecycle replacement/cleanup in `AppState`.
- Added client-side refresh coalescing so external edits do not stampede the desktop shell.
- Verified the release path locally with `npm run tauri build` and validated both workflow files with a YAML parse check.

## Test Delta

- Before:
  - `cargo test -p unship-desktop` -> passed (`6 passed`)
  - `cargo test --workspace --exclude unship-desktop` -> passed
  - `npm run check` -> passed
- After:
  - `cargo fmt --all` -> passed
  - `cargo test -p unship-desktop` -> passed (`15 passed`)
  - `cargo clippy -p unship-desktop --all-targets -- -D warnings` -> passed
  - `cargo test --workspace --exclude unship-desktop` -> passed
  - `npm run check` -> passed
  - `npm run tauri build` -> passed
- Gaps:
  - No automated end-to-end Tauri smoke test yet for a live desktop session receiving CLI-originated file edits.
  - No GitHub-hosted dry run of the tag-triggered release workflow was available locally; validation stayed at YAML syntax plus successful local desktop packaging.

## Verification Run

- `cargo fmt --all`
- `cargo test -p unship-desktop`
- `cargo clippy -p unship-desktop --all-targets -- -D warnings`
- `cargo test --workspace --exclude unship-desktop`
- `npm run check`
- `npm run tauri build`
- `ruby -e 'require "yaml"; YAML.load_file(".github/workflows/ci.yml"); YAML.load_file(".github/workflows/release.yml"); puts "workflow yaml ok"'`

## Verdict
PASS_WITH_CHANGES

## LESSONS_LEARNED
1. A desktop watcher task should be reviewed against the actual mechanism, not just whether "something refreshes eventually."
2. Event-driven refresh paths still need frontend coalescing or atomic writes can turn into unnecessary reload storms.
3. CI needs to exercise the desktop crate's Rust tests directly once watcher logic moves out of incidental integration paths.
