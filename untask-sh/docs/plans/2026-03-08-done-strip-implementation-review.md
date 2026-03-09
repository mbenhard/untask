# Implementation Review

## Plan Path

- `docs/plans/2026-03-08-done-strip-design.md`

## Traceability Summary

| Plan task | Code evidence | Status | Notes |
| --- | --- | --- | --- |
| Replace done column with collapsed sticky strip by default | `apps/desktop/src/lib/components/Kanban.svelte:42`, `apps/desktop/src/lib/components/Kanban.svelte:642`, `apps/desktop/src/lib/components/Kanban.svelte:765` | implemented | Done tasks are split out from active columns and rendered as strip vs expanded column. |
| Show strip during drag and expand width for easier drop | `apps/desktop/src/lib/components/Kanban.svelte:39`, `apps/desktop/src/lib/components/Kanban.svelte:763`, `apps/desktop/src/lib/components/Kanban.svelte:773` | implemented | Strip widens from `56px` to `120px` while dragging. |
| Support drag-to-done completion with hover and drop feedback | `apps/desktop/src/lib/components/Kanban.svelte:355`, `apps/desktop/src/lib/components/Kanban.svelte:377`, `apps/desktop/src/lib/components/Kanban.svelte:862` | implemented | Strip hover and flash feedback are present; drop updates task status to done. |
| Expand strip into a full done column with recent-first ordering | `apps/desktop/src/lib/components/Kanban.svelte:99`, `apps/desktop/src/lib/components/Kanban.svelte:645`, `apps/desktop/src/lib/components/Kanban.svelte:672` | implemented | Expanded done column sorts by `completed` descending and supports drag back out. |
| Persist expanded/collapsed state in local storage | `apps/desktop/src/lib/components/Kanban.svelte:43`, `apps/desktop/src/lib/components/Kanban.svelte:345`, `apps/desktop/src/lib/components/Kanban.svelte:50` | implemented | Review changes now also collapse persisted empty-done state when count returns to zero. |
| Keep quick-add disabled for done | `apps/desktop/src/lib/components/Kanban.svelte:552`, `apps/desktop/src/lib/components/Kanban.svelte:597`, `apps/desktop/src/lib/components/Kanban.svelte:642` | implemented | Quick-add remains active only for non-done columns. |

## Findings (by severity)

### P1

- Fixed: the collapsed strip stayed in the flex layout with `opacity: 0` when done count was zero, leaving a dead 56px gutter and violating the plan's “hidden when 0 done tasks and no drag is active” behavior. Addressed by conditionally rendering the strip only when visible or during drag.

### P2

- Fixed: the entire strip surface was clickable, so the drop target and the expand affordance were the same element. That increased accidental opens and diverged from the intended “label/counter area toggles, rest of strip is drop-only” interaction. Addressed by shrinking the button to the label/counter block and leaving the surrounding strip as drop surface.
- Fixed: persisted expanded state could reopen an empty done column after the last completed task was moved back out, which reintroduced board clutter in the exact edge case this design is meant to reduce. Addressed by auto-collapsing and clearing the persisted expanded flag when done count falls to zero.

## Improvements Applied

- Updated `apps/desktop/src/lib/components/Kanban.svelte` to hide the strip structurally instead of visually when there are no done tasks.
- Updated `apps/desktop/src/lib/components/Kanban.svelte` so only the label/counter control is clickable in collapsed mode.
- Updated `apps/desktop/src/lib/components/Kanban.svelte` to auto-reset persisted expansion when the done list becomes empty.
- Tightened the strip drop handler typing so `pnpm check` passes again.

## Test Delta
- Before: `cd apps/desktop && pnpm check` failed with 1 TypeScript error in `Kanban.svelte` and reported 2 unrelated pre-existing a11y warnings in `TaskModal.svelte`.
- After: `cd apps/desktop && pnpm check` passes with 0 errors; the same 2 unrelated `TaskModal.svelte` a11y warnings remain.
- Gaps: No automated interaction tests cover drag-to-strip, expand/collapse persistence, or reopening tasks out of done. Review is based on code-path audit plus static verification.

## Verification Run

- `cd apps/desktop && pnpm check`
- `cd apps/desktop && pnpm build`

## Verdict
PASS_WITH_CHANGES

## LESSONS_LEARNED
1. “Visually hidden” is not enough for space-saving UI; collapsed utility affordances must also leave the layout tree.
2. In dense kanban UIs, click and drop affordances need explicit separation or users will misread intent.
3. Persisted view state should be constrained by current data shape, not replayed blindly.
