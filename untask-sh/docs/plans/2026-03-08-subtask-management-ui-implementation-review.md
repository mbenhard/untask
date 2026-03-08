# Implementation Review

## Plan Path

`docs/plans/2026-03-08-subtask-management-ui.md`

## Traceability Summary

| Plan task | Code evidence | Status | Notes |
| --- | --- | --- | --- |
| Task 1: parse, render, toggle | `apps/desktop/src/lib/subtasks.ts`, `apps/desktop/src/lib/components/SubtaskList.svelte` | implemented | Parsing now mirrors the backend's top-level checklist rules and toggle updates a single checklist slot. |
| Task 2: delete and inline edit | `apps/desktop/src/lib/subtasks.ts`, `apps/desktop/src/lib/components/SubtaskList.svelte` | implemented | Delete/edit now operate on body line indices without disturbing surrounding notes. |
| Task 3: create new subtasks | `apps/desktop/src/lib/subtasks.ts`, `apps/desktop/src/lib/components/SubtaskList.svelte` | implemented | New subtasks append after the last top-level checklist item or create a trailing checklist block when none exist. |
| Task 4: drag-and-drop reorder | `apps/desktop/src/lib/subtasks.ts`, `apps/desktop/src/lib/components/SubtaskList.svelte` | implemented | Reorder now preserves non-subtask lines in place instead of regrouping all checklist items. |
| Task 5: modal integration | `apps/desktop/src/lib/components/TaskModal.svelte`, `apps/desktop/src/lib/components/SubtaskList.svelte` | implemented | Body saves now use a shared description composer and optimistic updates so notes/subtasks stay in sync. |
| Task 6: polish and edge cases | `apps/desktop/src/lib/components/SubtaskList.svelte` | implemented with verification gap | Keyboard reorder and readonly visibility rules exist; visual/manual Tauri interaction was not rerun in this audit. |

## Findings (by severity)

- P1: Baseline `SubtaskList.svelte` rebuilt reordered bodies by collapsing all subtasks into one block. That moved interleaved note lines and directly caused the reported "subtasks and notes are mixmatched" bug. Fixed by introducing slot-preserving checklist transforms in `apps/desktop/src/lib/subtasks.ts`.
- P1: Baseline modal body updates waited for the async response before reflecting the new body. Rapid subtask edits could therefore operate on stale modal state and feel buggy. Fixed by making description/body saves optimistic and revision-guarded in `apps/desktop/src/lib/components/TaskModal.svelte`.
- P2: Baseline desktop checks failed because `Checkbox.Indicator` is not available in the installed Bits UI API, and the component relied on `autofocus`. Fixed by rendering the checkmark directly and using an explicit focus action in `apps/desktop/src/lib/components/SubtaskList.svelte`.
- P2: Baseline subtask styling leaned too monospaced and widget-like for Untask's design language. Updated the component to use denser border-led rows, quieter progress treatment, and sans body copy while keeping mono only for utility metadata.

## Improvements Applied

- Added `apps/desktop/src/lib/subtasks.ts` to centralize checklist parsing plus add/toggle/edit/delete/reorder body transforms.
- Reworked `apps/desktop/src/lib/components/SubtaskList.svelte` to use the shared helpers, preserve surrounding notes, and clean up the visual treatment.
- Reworked `apps/desktop/src/lib/components/TaskModal.svelte` so subtask edits and notes edits compose through the same body path with optimistic persistence.

## Test Delta

- Before: `pnpm --dir apps/desktop check` failed with 2 TypeScript errors and 1 Svelte accessibility warning in `apps/desktop/src/lib/components/SubtaskList.svelte`; `cargo test` passed.
- After: `pnpm --dir apps/desktop check` passed cleanly; `cargo test` passed.
- Gaps: Manual `pnpm --dir apps/desktop tauri dev` interaction and visual QA were not rerun in this audit, so drag/drop feel and final visual polish are verified by static review only.

## Verification Run

- `pnpm --dir apps/desktop check`
- `cargo test`

## Verdict

PASS_WITH_CHANGES

## LESSONS_LEARNED
1. Markdown-backed subtask UIs need slot-preserving transforms, not block reconstruction.
2. Async body saves should update local UI state immediately or interactive edits will race stale props.
3. Frontend reviews in this repo need both `svelte-check` and a quick pass against the Untask design language.
