# Untask Repository Hygiene Proposal

Date: 2026-03-09
Status: Proposal
Source context:

- `docs/audits/2026-03-09-engineering-audit.md`
- `docs/audits/2026-03-09-engineering-cleanup-log.md`

## Purpose

This document turns the remaining repository-hygiene findings into an explicit decision proposal.

The code cleanup work is largely complete. The main remaining repo-health issue is that product code, live local project state, fixture projects, and planning history are still mixed together in the same tracked source tree.

## Current State

Tracked or versioned high-noise areas:

- Live project state under `.untask/`
  - Approx size: `608K`
  - Includes live task files and binary attachment examples
- Fixture/sample project under `test-dir/.untask/`
  - Approx size: `72K`
  - Includes sample docs/tasks for a second project tree
- Planning history under `docs/plans/`
  - Approx size: `452K`
  - Current file count at top level: `54`

## Why This Matters

- It increases grep noise and makes code navigation less focused.
- It blurs the boundary between application source, runtime state, test fixtures, and process artifacts.
- It raises the chance that developers and agents accidentally treat example/live data as implementation source.
- It makes repository reviews look larger than the actual product-code surface.

## Safe Changes Already In Place

These do not need more action:

- `.untask/.lock` is ignored.
- `.untask/cache/` is ignored.
- common editor junk such as `*.sw?` is already ignored by the repo-level `.gitignore`.

## Recommended Policy

### 1. Treat `.untask/` as one of two things, explicitly

Pick one:

- `Option A: Example project`
  - Keep it tracked, but rename and document it as an example/demo project.
  - Move it to a clearer location such as `examples/demo-project/.untask/`.
- `Option B: Live working state`
  - Stop tracking it in the main repo.
  - Keep only minimal seed/example data elsewhere.

Recommended: `Option A`.

Reason:

- The project clearly benefits from having one canonical example project for dogfooding and screenshots.
- Keeping a demo project is reasonable.
- Keeping it in the root as if it were normal source is what creates confusion.

### 2. Reclassify `test-dir/.untask/` as fixtures

Recommended action:

- Move `test-dir/.untask/` to a clearer fixture path such as `tests/fixtures/sample-project/.untask/` or `fixtures/sample-project/.untask/`.

Reason:

- It is fixture-style content, not normal application structure.
- Its current location looks like an ad hoc leftover rather than an intentional test asset.

### 3. Archive `docs/plans/` outside the active product-docs area

Recommended action:

- Move historical plan files to something like `docs/archive/plans/`.
- Keep only actively used planning entrypoints in `docs/plans/`, if any.

Reason:

- The history is useful, but it does not need to sit in the same active docs namespace as current engineering materials.
- This keeps process history available without polluting current navigation.

## Concrete Recommended End State

Recommended target structure:

```text
examples/
  demo-project/
    .untask/

tests/
  fixtures/
    sample-project/
      .untask/

docs/
  archive/
    plans/
  audits/
```

## What I Recommend Doing Next

### Immediate next repo-hygiene change

If approved, do this in one controlled batch:

1. Move root `.untask/` to `examples/demo-project/.untask/`
2. Move `test-dir/.untask/` to `tests/fixtures/sample-project/.untask/`
3. Move `docs/plans/` to `docs/archive/plans/`
4. Update any hardcoded paths, tests, or docs references
5. Re-run workspace verification

## What I Did Not Change Yet

I did not move or delete these paths yet because that is a repository-organization decision, not a safe unilateral cleanup:

- `.untask/`
- `test-dir/.untask/`
- `docs/plans/`

## Decision Request

Preferred path:

- Approve the boundary cleanup and move tracked state/history into explicit `examples/`, `tests/fixtures/`, and `docs/archive/` locations.

If approved, this should be done as a dedicated follow-up refactor so path updates and fixture assumptions can be verified cleanly in one pass.
