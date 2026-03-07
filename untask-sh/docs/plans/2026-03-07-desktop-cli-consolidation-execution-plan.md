# Desktop + CLI Consolidation Execution Plan

## Preconditions

- Keep CLI and desktop behavior intact.
- Remove the legacy terminal interface code and references.
- Limit product-surface documentation to current behavior.

## Task List
1. Replace no-subcommand behavior with help-guided CLI output and explicit desktop-launch guidance.
2. Remove the legacy terminal interface module and CLI-only dependencies.
3. Update public docs to describe the desktop + CLI product only.

## Verification Per Task
- Task 1:
  - `cargo test -p untask --tests`
- Task 2:
  - `cargo test --workspace`
  - `cargo clippy --workspace --all-targets -- -D warnings`
  - `cargo build --workspace`
- Task 3:
  - `pnpm --dir apps/desktop check`
  - `pnpm --dir apps/desktop build`

## Completion Criteria

1. Bare `untask` no longer launches any interactive interface.
2. `untask open` remains the explicit desktop launcher.
3. The removed terminal interface code and product-surface references are gone.
