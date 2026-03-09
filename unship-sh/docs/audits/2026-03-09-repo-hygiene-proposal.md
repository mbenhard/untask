# Unship Repository Hygiene Proposal

Date: 2026-03-09
Status: Proposal
Source context:

- `docs/audits/2026-03-09-engineering-audit.md`
- `docs/audits/2026-03-09-engineering-cleanup-log.md`

## Purpose

This document turns the remaining repository-hygiene findings into an explicit decision proposal.

The code cleanup work is largely complete. The main remaining repo-health issue is how intentionally tracked working state and planning history should coexist with product source in the same repository.

## Current State

Tracked or versioned high-noise areas:

- Live project state under `.unship/`
  - Approx size: `608K`
  - Includes live task files and binary attachments
  - This is intentionally used as the active collaborative workspace while building Unship with AI
- Planning history under `docs/plans/`
  - Approx size: `452K`
  - Current file count at top level: `54`

## Why This Matters

- It increases grep noise and makes code navigation less focused.
- It blurs the boundary between application source, runtime state, and process artifacts.
- It raises the chance that developers and agents accidentally treat example/live data as implementation source.
- It makes repository reviews look larger than the actual product-code surface.

## Safe Changes Already In Place

These do not need more action:

- `.unship/.lock` is ignored.
- `.unship/cache/` is ignored.
- common editor junk such as `*.sw?` is already ignored by the repo-level `.gitignore`.

## Recommended Policy

### 1. Keep `.unship/` tracked, but classify it explicitly

Updated recommendation:

- Keep `.unship/` in the repo root if it is the canonical working project used to dogfood Unship during development.
- Document this explicitly so contributors understand it is intentional project state, not accidental clutter.

Recommended follow-up:

- Add a short repo note stating that root `.unship/` is the canonical collaborative dogfood workspace.
- Keep ignoring runtime-only files such as `.lock` and cache.
- Treat attachment churn as a conscious tradeoff of the workflow rather than a hygiene bug.

Reason:

- If the team actively uses Unship to build Unship, then tracking the workspace is a product-development choice, not mere noise.
- Moving it elsewhere would reduce confusion slightly, but would also work against the real workflow you described.

### 2. Archive `docs/plans/` outside the active product-docs area

Recommended action:

- Move historical plan files to something like `docs/archive/plans/`.
- Keep only actively used planning entrypoints in `docs/plans/`, if any.

Reason:

- The history is useful, but it does not need to sit in the same active docs namespace as current engineering materials.
- This keeps process history available without polluting current navigation.

## Concrete Recommended End State

Recommended target structure:

```text
docs/
  archive/
    plans/
  audits/
```

## What I Recommend Doing Next

### Immediate next repo-hygiene change

If approved, do this in one controlled batch:

1. Add a short repository note documenting root `.unship/` as intentional dogfood workspace state
2. Move `docs/plans/` to `docs/archive/plans/`
3. Update any docs references
4. Re-run workspace verification

## What I Did Not Change Yet

I did not move or delete these paths yet because that is a repository-organization decision, not a safe unilateral cleanup:

- `.unship/`
- `docs/plans/`

## Decision Request

Preferred path:

- Keep `.unship/` as an explicitly intentional tracked workspace.
- Move planning history into `docs/archive/`.

If approved, this should be done as a dedicated follow-up refactor so path updates and fixture assumptions can be verified cleanly in one pass.
