# Unship Engineering Audit

Date: 2026-03-09
Reviewer: Codex
Status: Complete
Scope: Full repository audit across `unship-core`, `unship-cli`, desktop/Tauri app, tests, scripts, tooling, docs-adjacent engineering artifacts, and local developer workflows.

## Project Overview

Unship is a local-first task/document workflow project implemented as:

- A Rust workspace with shared domain and storage logic in `crates/unship-core`
- A Rust CLI in `crates/unship-cli`
- A Tauri desktop app with a Svelte frontend in `apps/desktop`

The project appears to target local development and local data storage only at this stage.

Audit coverage completed:

- Read the full executable source surface across 79 Rust/TypeScript/Svelte files totaling 17,146 lines under `crates/`, `apps/desktop/src`, and `apps/desktop/src-tauri/src`
- Read the full tracked Rust test surface for `unship-core`, `unship-cli`, and desktop Tauri backend
- Reviewed workspace manifests, package/build config, Tauri config, GitHub workflows, repository hygiene, and tracked project-state artifacts

## Audit Scope

Included:

- Core domain, storage, search, docs, config, git, locking, repair, and attachment modules
- CLI command surface, output layer, and tests
- Desktop frontend state, API bindings, and component organization
- Tauri command/state/watcher bridge
- Workspace structure, tests, docs-adjacent engineering artifacts, and developer tooling

Excluded:

- UI/UX design critique
- Product direction
- Feature ideation unrelated to engineering health

## Architecture Overview

Initial architecture map:

- `crates/unship-core`: local data model, filesystem-backed storage, task/docs operations, project discovery, and supporting utilities
- `crates/unship-cli`: thin command layer over `unship-core` with human/json output modes
- `apps/desktop/src-tauri`: Tauri bridge exposing Rust commands and watcher/state management
- `apps/desktop/src`: Svelte application consuming Tauri commands through `src/lib/api.ts`

Observed boundary quality:

- The top-level workspace split is sensible.
- The `unship-core` crate is the correct place for domain and persistence logic, but several cross-cutting workflows still leak into CLI and Tauri layers.
- The Tauri backend has become a catch-all orchestration layer instead of a narrow transport adapter.
- The frontend mirrors backend contracts and some backend business rules manually, which weakens the value of the shared Rust core.
- File-backed storage is intentionally simple, but several operations rely on repeated full-directory scans and non-transactional multi-step updates.

## Major Findings

### Finding 1: Column deletion can write invalid task statuses

- Title: Unvalidated `move_to` target corrupts task state
- Description: Column deletion accepts `move_to` and passes it directly into task migration without validating or normalizing the destination status. A typo or alias can write unknown statuses into task files.
- Where it appears:
  - `crates/unship-cli/src/commands/column.rs`
  - `apps/desktop/src-tauri/src/commands.rs`
  - `crates/unship-core/src/store.rs`
- Why it matters: This breaks data integrity at the domain level and creates cleanup debt immediately after a column operation.
- Recommended improvement: Move column orchestration into `unship-core` and require destination validation against canonical config before any task writes occur.
- Priority level: P1
- Expected impact: Prevents silent corruption during a destructive workflow.
- Scope: Quick win

### Finding 2: `next` summary hardcodes `"done"` and ignores custom done columns

- Title: Completion logic is inconsistent with configurable columns
- Description: `next::task_is_done` checks whether normalized status equals `"done"` instead of using `Config::is_done_status`. The config model explicitly supports arbitrary `done: true` columns, but `next` does not honor that model.
- Where it appears:
  - `crates/unship-core/src/next.rs`
  - Indirectly affects CLI `next` and desktop review/summary flows
- Why it matters: This is a real correctness bug in one of the project’s overview surfaces and undermines confidence in configurable workflow support.
- Recommended improvement: Replace the hardcoded check with `config.is_done_status(&task.status)` and add a regression test using a non-`done` terminal column.
- Priority level: P1
- Expected impact: Aligns behavior with the actual config contract and avoids false open-task reporting.
- Scope: Quick win

### Finding 3: Column rename is not atomic across config and task updates

- Title: Multi-step workflow can leave the repository in a partially migrated state
- Description: Both CLI and Tauri persist renamed config first, then migrate task statuses separately. If migration fails after config save, the project can be left in an inconsistent intermediate state.
- Where it appears:
  - `crates/unship-cli/src/commands/column.rs`
  - `apps/desktop/src-tauri/src/commands.rs`
- Why it matters: This is fragile write orchestration on a file-backed store. As features expand, these partial-update risks will multiply.
- Recommended improvement: Create a core-level transactional column service that acquires the project lock once, validates inputs once, performs config + task updates together, and writes via one orchestration path shared by CLI and desktop.
- Priority level: P2
- Expected impact: Reduces corruption risk and eliminates duplicated workflow logic.
- Scope: Larger refactor

### Finding 4: The Tauri backend is a monolith with repeated glue code

- Title: `commands.rs` has become an oversized mixed-responsibility transport layer
- Description: `apps/desktop/src-tauri/src/commands.rs` combines DTO definitions, path helpers, attachment helpers, project lifecycle, column orchestration, task CRUD, docs CRUD, search, next, repair, and tests in one file. It also repeats `TaskStore::new`, `DocsStore::new`, `Config::load`, and `map_err(|e| e.to_string())` heavily.
- Where it appears:
  - `apps/desktop/src-tauri/src/commands.rs`
- Why it matters: This makes desktop backend changes expensive, obscures ownership boundaries, and discourages extraction of reusable behavior into `unship-core`.
- Recommended improvement: Split the file by domain (`tasks`, `docs`, `projects`, `columns`, `attachments`, `summary`) and centralize store/context/error conversion helpers.
- Priority level: P2
- Expected impact: Improves maintainability and lowers change risk in desktop features.
- Scope: Larger refactor

### Finding 5: The main desktop UI is concentrated in a few very large components

- Title: Core Svelte features are implemented as component-sized subsystems
- Description: `TaskModal.svelte` is roughly 1,245 lines, `Kanban.svelte` ~896 lines, and `DocsViewer.svelte` ~892 lines. Each mixes data fetching, local state machines, mutation logic, keyboard handling, rendering, and utility functions.
- Where it appears:
  - `apps/desktop/src/lib/components/TaskModal.svelte`
  - `apps/desktop/src/lib/components/Kanban.svelte`
  - `apps/desktop/src/lib/components/DocsViewer.svelte`
  - `apps/desktop/src/App.svelte`
- Why it matters: These files are already difficult to reason about and test. Additional features will increase accidental complexity faster than the codebase can absorb.
- Recommended improvement: Extract mutation hooks/services, shared helpers, and subordinate presentational components so each file owns one interaction surface instead of a full subsystem.
- Priority level: P2
- Expected impact: Lower cognitive load, easier targeted tests, and cleaner ownership boundaries.
- Scope: Larger refactor

### Finding 6: Core business rules and transport contracts are duplicated across layers

- Title: Shared logic is being reimplemented instead of reused
- Description: Status normalization exists in Rust config and again in frontend utilities. DTO contracts are manually mirrored in Rust command structs and TypeScript interfaces. Frontmatter parsing also exists on both sides.
- Where it appears:
  - `crates/unship-core/src/config.rs`
  - `apps/desktop/src/lib/utils.ts`
  - `apps/desktop/src-tauri/src/commands.rs`
  - `apps/desktop/src/lib/api.ts`
  - `crates/unship-core/src/task.rs`
  - `apps/desktop/src/lib/frontmatter.ts`
- Why it matters: Manual duplication guarantees eventual drift, especially once fields or workflow semantics evolve.
- Recommended improvement: Push more normalization/translation into `unship-core`, minimize bespoke Tauri DTOs where possible, and introduce generated or single-source contract definitions for desktop APIs.
- Priority level: P2
- Expected impact: Reduces drift bugs and makes future changes cheaper.
- Scope: Larger refactor

### Finding 7: Task writes are hardened, doc writes are not

- Title: Persistence guarantees are inconsistent between tasks and docs
- Description: Tasks use project locking plus `atomic_write`; docs use raw `std::fs::write`, `std::fs::rename`, and uncoordinated filesystem mutations. Tauri `write_doc` also writes directly instead of using a core abstraction.
- Where it appears:
  - `crates/unship-core/src/fs.rs`
  - `crates/unship-core/src/store.rs`
  - `crates/unship-core/src/docs.rs`
  - `apps/desktop/src-tauri/src/commands.rs`
- Why it matters: The storage model is inconsistent and harder to trust under concurrent edits, external editor usage, or future sync/import features.
- Recommended improvement: Introduce a docs write path in `unship-core` that uses the same durability and locking policy as task writes, or explicitly document and isolate why docs are different.
- Priority level: P2
- Expected impact: Better integrity guarantees and more predictable behavior.
- Scope: Larger refactor

### Finding 8: Refresh and watch behavior reloads too much state too often

- Title: File watching and UI refresh are implemented as broad invalidation
- Description: The watcher reloads config from disk while evaluating filesystem events, and the app refresh path reloads config, full task list, and full docs tree even for narrowly scoped changes.
- Where it appears:
  - `apps/desktop/src-tauri/src/watcher.rs`
  - `apps/desktop/src/App.svelte`
- Why it matters: This is acceptable at very small scale, but it will degrade responsiveness and make future features feel heavier than necessary.
- Recommended improvement: Cache resolved doc roots/config in the watcher, emit narrower change events, and let the frontend selectively refresh tasks vs docs vs config.
- Priority level: P2
- Expected impact: Better scalability and simpler state reasoning.
- Scope: Larger refactor

### Finding 9: Tooling is not standardized around one package manager or one clean check path

- Title: Desktop tooling is internally inconsistent
- Description: The desktop app tracks `pnpm-lock.yaml`, but CI and release workflows use `npm ci` and `package-lock.json` paths. `apps/desktop` currently contains both lockfile styles locally, while the repo tracks only pnpm. Checks also do not fully pass cleanly: `cargo clippy --workspace --all-targets -- -D warnings` fails, and `npm run check` emits warnings.
- Where it appears:
  - `apps/desktop/package.json`
  - `.github/workflows/ci.yml`
  - `.github/workflows/release.yml`
  - `crates/unship-core/src/store.rs`
  - `apps/desktop/src/lib/components/TaskModal.svelte`
- Why it matters: This creates avoidable CI/local drift and weakens confidence that the repository is in a consistently healthy state.
- Recommended improvement: Standardize on one Node package manager, remove the other workflow assumptions, and make the baseline repo checks actually green.
- Priority level: P2
- Expected impact: Better developer experience and more trustworthy automation.
- Scope: Quick win

### Finding 10: Repository history includes local state and planning artifacts as product-adjacent source

- Title: Project data, test fixtures, binary attachments, and planning history are mixed into the main repository
- Description: The repo tracks live `.unship` task data, binary attachments under `.unship/attachments/`, a second `test-dir/.unship` project, and a large `docs/plans/` archive. This increases noise during engineering work and makes it harder to separate product code from local/project state.
- Where it appears:
  - `.unship/**`
  - `test-dir/.unship/**`
  - `docs/plans/**`
- Why it matters: It inflates grep results, review scope, repo size, and maintenance overhead, especially for an agent-heavy workflow where repository context matters.
- Recommended improvement: Separate canonical fixtures from live project state, move archival planning history to a clearly non-product location if it must remain versioned, and keep example data in an explicit fixtures/examples area with narrow scope.
- Priority level: P3
- Expected impact: Lower bloat and cleaner engineering context.
- Scope: Quick win

### Finding 11: The desktop app exposes and ships unused surface area

- Title: Some desktop modules and commands appear to be dead or unconsumed
- Description: `TaskDetail.svelte` is present but not referenced anywhere in `apps/desktop/src`. The Tauri backend registers commands such as `search`, `get_next`, and `get_repair_summary`, but the current frontend API layer does not expose or consume them. `listDocs` is exported in `api.ts` but likewise appears unused.
- Where it appears:
  - `apps/desktop/src/lib/components/TaskDetail.svelte`
  - `apps/desktop/src-tauri/src/lib.rs`
  - `apps/desktop/src/lib/api.ts`
- Why it matters: Unused code expands the maintenance surface, complicates audits, and makes it harder to know which paths are actually relied on.
- Recommended improvement: Delete confirmed dead modules and either wire the remaining backend commands into the product or remove them until they are needed.
- Priority level: P3
- Expected impact: Reduced bloat and clearer ownership of shipped functionality.
- Scope: Quick win

### Finding 12: Invalid config silently degrades to defaults

- Title: Config parse failures are hidden instead of surfaced
- Description: `Config::load` returns the default config whenever `.unship/config.yml` is unreadable, invalid YAML, or contains invalid doc globs. The watcher also calls `Config::load` while deciding whether filesystem events are relevant, so config mistakes quietly change behavior instead of producing a hard failure or visible diagnostic.
- Where it appears:
  - `crates/unship-core/src/config.rs`
  - `apps/desktop/src-tauri/src/watcher.rs`
  - Confirmed by current tests in `crates/unship-core/tests/config_test.rs`
- Why it matters: Hidden fallback is convenient early on, but it makes configuration regressions difficult to diagnose and can cause the app to appear to “ignore” user settings after a typo.
- Recommended improvement: Return a structured config-load result that preserves validation errors, surface that state in CLI/desktop flows, and keep default fallback only for truly missing config.
- Priority level: P2
- Expected impact: More predictable behavior and easier diagnosis of config-related bugs.
- Scope: Larger refactor

## Code Quality Findings

- Repeated full-directory scans in `TaskStore` are the default access pattern. `get`, `get_by_ref`, `next_position_for_status`, `count_by_prd`, and multiple attachment flows all depend on `list(None)` or other repeated reads.
- `Config::load` silently falls back to defaults when the file is invalid. This avoids crashes, but it also hides configuration errors and makes misbehavior harder to diagnose.
- The Tauri backend converts nearly every error with `map_err(|e| e.to_string())`, which erases error shape and encourages copy-paste command handlers.
- Broad `catch {}` / `.catch(() => [])` patterns on the frontend trade correctness visibility for convenience. Failures often degrade into empty state instead of surfacing a meaningful problem.
- There is real duplicate helper logic in the frontend (`relativeDate`, `focusOnMount`, status fallback handling) that should be centralized before more features land.
- The current test suite is strong on core Rust behavior but still leaves desktop interaction flows largely unprotected beyond typechecking and Tauri-side unit tests.

## Duplication / Bloat / Overengineering Findings

- Manual DTO duplication between Rust and TypeScript is now material maintenance debt.
- Status normalization exists in both `unship-core` and frontend utilities.
- Frontmatter handling exists in both Rust and TypeScript.
- Large components contain business logic, data access, and rendering in one file, producing local mini-frameworks instead of composable modules.
- Repository tracking of live `.unship` state, binary attachment examples, `test-dir/.unship` fixtures, and archived plans adds context bloat unrelated to runtime code paths.
- The desktop app contains unused modules and unconsumed Tauri command surface.

## Maintainability Concerns

- There is no single core service for multi-file workflow operations such as column rename/delete. CLI and desktop each orchestrate these flows separately.
- Desktop command handlers repeatedly reconstruct stores instead of sharing a small context/service layer.
- The frontend has no component-level tests; desktop verification is limited to typechecking and Rust-side tests.
- Several test files are very large (`commands_test.rs`, `store_test.rs`, `docs_test.rs`), which makes them harder to evolve as targeted regression suites.

## Technical Debt

- `apps/desktop/src-tauri/src/commands.rs` should have been split earlier; it is now central technical debt.
- `TaskModal.svelte`, `Kanban.svelte`, and `DocsViewer.svelte` are refactor debt hotspots.
- Silent config fallback behavior will become harder to defend as the number of configurable features grows.
- Broad filesystem refresh invalidation is simple now but will get expensive as document/task volume increases.

## Consistency And Standards Issues

- Task persistence uses locking and atomic writes; docs persistence does not.
- CLI and desktop both expose similar workflows but not through a shared orchestration layer.
- Desktop search returns absolute paths while CLI search normalizes to project-relative paths.
- The desktop project is not standardized on npm or pnpm despite workflow assumptions in CI, and the working tree currently contains a local `package-lock.json` alongside the tracked `pnpm-lock.yaml`.
- Baseline quality gates are inconsistent: tests pass, but clippy fails and frontend checks emit warnings.

## Quick Wins

- Fix `next::task_is_done` to respect `Config::is_done_status`.
- Validate and normalize `move_to` before any column-delete migration.
- Remove the two clippy violations in `crates/unship-core/src/store.rs`.
- Standardize desktop package manager usage and CI cache/install commands.
- Decide whether tracked `.unship` project data, attachment binaries, and `test-dir/.unship` belong in the main repo or should move to explicit fixtures/examples.
- Centralize duplicated frontend helpers such as `relativeDate` and repeated status fallback logic.
- Delete or reconnect confirmed dead desktop modules and commands.
- Add a visible config-load diagnostic path instead of silently resetting to defaults.

## High-Priority Fixes

- Repair column delete validation so invalid destinations cannot be written to task files.
- Align `next` summary logic with configurable done columns.
- Introduce a single core orchestration path for column rename/delete to avoid drift and partial updates.
- Make baseline repository checks pass cleanly with no clippy failures and no ignored warning debt.

## Refactor Candidates

- Split `apps/desktop/src-tauri/src/commands.rs` into domain modules plus shared command context/error helpers.
- Break `TaskModal.svelte`, `Kanban.svelte`, and `DocsViewer.svelte` into smaller controller/presenter units.
- Create a docs persistence API in `unship-core` with locking and atomic write policy.
- Replace repeated full scans in `TaskStore` with narrower access helpers or an indexed read path.
- Introduce a shared contract generation or single-source DTO strategy for the desktop API.

## Best-Practice Recommendations

- Keep workflow orchestration in the core crate, not in transport adapters.
- Prefer one place for normalization and validation rules; treat duplicated business logic as a bug source.
- Make repository health checks strict and green by default.
- Separate product code from live project data and archival workflow artifacts.
- Bias toward smaller modules with explicit ownership instead of large mixed-responsibility files.

## Open Questions / Assumptions

- The repo is actively under development and not yet productionized.
- Local `.unship` data inside the repository and `test-dir/` may be development fixtures rather than committed product assets.
- Existing `docs/plans/current-run.md` appears to track a separate feature workflow; this audit does not currently overwrite it.

## Proposed Cleanup And Refactor Roadmap

### Phase 1: Health Baseline

1. Fix the column-delete destination validation bug.
2. Fix `next` done-status handling.
3. Fix clippy failures and make the baseline check suite fully green.
4. Standardize the desktop package manager and CI workflow.

### Phase 2: Boundary Repair

1. Move column rename/delete orchestration into `unship-core`.
2. Introduce shared helpers/context in Tauri for project access, store construction, and error mapping.
3. Unify docs write behavior with the task durability model.

### Phase 3: Simplification

1. Split the large desktop backend command file into domain modules.
2. Split the largest Svelte components by responsibility.
3. Centralize duplicated frontend utility logic and remove dead state.

### Phase 4: Scale Preparation

1. Reduce repeated full-directory scans in the core.
2. Narrow watcher invalidation and frontend refresh scope.
3. Introduce frontend tests for critical mutation flows, not just typechecking.

## Verification Snapshot

- `cargo test --workspace`: passed
- `cargo clippy --workspace --all-targets -- -D warnings`: failed on `clippy::needless_borrow` in `crates/unship-core/src/store.rs:279` and `crates/unship-core/src/store.rs:317`
- `npm run check` in `apps/desktop`: passed with 3 Svelte warnings in `apps/desktop/src/lib/components/TaskModal.svelte:950`, `:1000`, and `:1058`

## Execution Follow-Up

Follow-up cleanup work was implemented in the same repository session. See:

- `docs/audits/2026-03-09-engineering-cleanup-plan.md`
- `docs/audits/2026-03-09-engineering-cleanup-log.md`

That execution pass fixed the P1 column/delete and `next` correctness issues, moved column workflow orchestration into `unship-core`, hardened docs persistence, reduced some frontend dead/duplicate surface, and brought current verification back to green (`cargo test`, `cargo clippy -D warnings`, `npm run check`).
