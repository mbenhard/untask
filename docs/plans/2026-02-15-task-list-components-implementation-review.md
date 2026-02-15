# Implementation Review

## Plan Path
`docs/plans/2026-02-15-task-list-components-design.md`

## Traceability Summary

| Plan item | Code evidence | Status | Notes |
| --- | --- | --- | --- |
| Shared task row/list primitives across views | `flusk/src/renderer/components/tasks/TaskItem.tsx`, `flusk/src/renderer/components/tasks/TaskList.tsx` | implemented | Shared components used by Today, Inbox, and project subtasks. |
| Reorder contract (scoped reorder + global payload reconciliation) | `flusk/src/renderer/components/tasks/TaskList.tsx` | implemented | `reconcileScopedReorder` preserves non-scope order and calls `reorderTasks(fullOrderedIds)`. |
| Today filtering and LiveThought placement | `flusk/src/renderer/components/views/TodayView.tsx` | implemented | `LiveThought` remains first; list filter is `today === true && status !== 'done'`. |
| Inbox filtering rules | `flusk/src/renderer/components/views/InboxView.tsx` | implemented | Filter enforces `status === 'inbox' && parentId === null && today !== true`. |
| Projects grouping and active-subtask rendering | `flusk/src/renderer/components/views/ProjectsView.tsx`, `flusk/src/renderer/components/tasks/ProjectGroup.tsx` | implemented | Active parents/subtasks grouped by `parentId`; groups with zero active subtasks are hidden. |
| AppShell all-task pass-through | `flusk/src/renderer/components/layout/AppShell.tsx` | implemented | `TodayView`, `InboxView`, and `ProjectsView` now receive `allTasks`. |
| Inline task body markdown/edit behavior | `flusk/src/renderer/components/tasks/TaskBody.tsx`, `flusk/src/renderer/components/ui/textarea.tsx` | implemented | Markdown rendering and Cmd/Ctrl+Enter save, Escape cancel, reduced-motion aware animation. |
| Inline subtask create flow | `flusk/src/renderer/components/tasks/InlineTaskInput.tsx` | implemented | Enter creates `status: 'active'` + `priority: 'none'`, Escape closes, blur closes when empty. |
| Keyboard navigation contract | `flusk/src/renderer/hooks/useTaskListKeyboard.ts` | implemented | Arrow nav, Enter expand, T toggle today, Escape collapse/blur with text-input and drag guards. |
| Dependency additions for DnD/markdown | `flusk/package.json` | implemented | Added `@dnd-kit/*` and `react-markdown`. |

## Findings (by severity)

- `P1 (fixed)`: Task body interactions were collapsing rows due to click bubbling from nested content into row-level expand toggle. The click handler was scoped to the header row so expanded body interactions (editing notes, selecting text, markdown clicks) no longer collapse the task unexpectedly. Evidence: `flusk/src/renderer/components/tasks/TaskItem.tsx`.

## Improvements Applied

- Scoped expand/collapse click handling to the header row in `flusk/src/renderer/components/tasks/TaskItem.tsx`.

## Test Delta
- Before:
  - `npm run lint` (pass)
  - `npx tsc --noEmit` (pass)
- After:
  - `npm run lint` (pass)
  - `npx tsc --noEmit` (pass)
- Gaps:
  - No automated renderer interaction tests (drag, keyboard roving focus, inline edit flow).
  - No end-to-end verification for scoped reorder behavior across mixed task states.

## Verification Run

Executed in `flusk/`:
- `npm run lint`
- `npx tsc --noEmit`

## Verdict
PASS_WITH_CHANGES

## LESSONS_LEARNED
1. Row-level click handlers should not wrap interactive editable regions without explicit propagation boundaries.
2. Scoped reorder contracts are safest when reconciled against a full global ordering payload.
3. UI-heavy behavior work needs at least smoke-level interaction tests to catch regressions early.
