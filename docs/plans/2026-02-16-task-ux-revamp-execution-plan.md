# Task UX Revamp Execution Plan

## Preconditions

- Clarification decisions from `/Users/marcusbenhard/Development/untitled/docs/plans/2026-02-16-task-ux-revamp-design.md` are accepted as implementation defaults.
- Assistant-first constraints remain mandatory: do not break proactive risk/cashflow nudges while simplifying task UX.
- Current process boundaries remain unchanged:
  - main: DB/filesystem/tray/shortcuts
  - preload: typed API only
  - renderer: no Node/Electron internals
- Baseline validation commands are available in `/Users/marcusbenhard/Development/untitled/flusk`:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test -- --run`

## Task List
1. Lock transition scope and contracts:
   - codify UI-hidden vs backend-retained fields
   - map all `projects` references and status enum surfaces
2. Extend status contracts to include `waiting` across shared types, service validation, tool schemas, and renderer typing.
3. Refactor navigation from `Today | Projects | Inbox` to `Today | Tasks | Inbox`:
   - `appStore` view enum/order
   - title tabs/labels
   - keyboard shortcuts (`1`,`2`,`3`)
   - search-result routing fallback target
4. Replace `ProjectsView` orchestration with `TasksView` status-group model:
   - groups: `in_progress`, `active`, `waiting`, `done`
   - done group collapsed by default
   - keep project rows inline (parent tasks with subtasks)
5. Upgrade collapsed task row interactions (`TaskItem`) for direct editing:
   - priority cycle control
   - status badge picker
   - due/client inline affordances
   - today toggle and completion controls
6. Expand `TaskBody` for in-place execution workflows:
   - notes read/edit with `Cmd/Ctrl+Enter` save
   - inline subtask creation and reorder
   - simplified metadata bar aligned to visible UX model
7. Align Today and Inbox lenses with new model:
   - Today: flat `today=true` execution list + done-today section
   - Inbox: top capture input, processing by status transition out of inbox
8. Preserve assistant runtime compatibility while reducing UI surface:
   - keep backend fields used by proactive/risk policies
   - remove those fields from primary renderer controls
   - add explicit TODO markers for future full deprecation
9. Stabilize with targeted tests and regression QA:
   - status transitions (`waiting`, done reopen)
   - navigation + shortcut correctness
   - search navigation target correctness
   - list/task keyboard and edit behavior
10. Finalize documentation and handoff:
   - update plan/checkpoint notes
   - record residual risks and deferred follow-ups

## Verification Per Task
- Task 1:
  - Decision log exists for field retention and tab routing replacement.
  - No unresolved contract ambiguity remains before code changes.
- Task 2:
  - `waiting` accepted in main service validation and renderer types.
  - No type errors from status exhaustiveness checks.
- Task 3:
  - Tabs show `Today`, `Tasks`, `Inbox` only for task navigation.
  - `2` always routes to `Tasks`; search fallback routes to `Tasks`, not `Projects`.
- Task 4:
  - Tasks are grouped by status with accurate counts.
  - Done group starts collapsed and can be expanded.
- Task 5:
  - Core row fields can be edited without opening task body.
  - Priority/status/today/complete actions update state without focus loss.
- Task 6:
  - Notes editing and subtask add/reorder flow works in-place.
  - Reduced-motion behavior still respects animation guardrails.
- Task 7:
  - Today and Inbox behavior match lens/capture semantics.
  - New-task defaults are correct per view.
- Task 8:
  - Proactive/live-thought/context compiler behavior still runs without missing-field errors.
  - No assistant policy regressions from UI field removal.
- Task 9:
  - `npm run lint` passes.
  - `npm run typecheck` passes.
  - Targeted test updates pass.
  - Manual smoke checks pass for shortcuts, search jump, and edit flows.
- Task 10:
  - Handoff docs summarize what shipped, what was deferred, and why.

## Batch Size
Default: 3 tasks per batch

Recommended batches:
- Batch 1 (contracts + nav): Tasks 1-3
- Batch 2 (tasks UX core): Tasks 4-6
- Batch 3 (compat + stabilization): Tasks 7-10

## Blockers and Escalation

- Blocker: replacing/removing backend risk fields is required immediately.
  - Escalation: split into follow-on migration with replacement signals before deletion; do not merge destructive removal in this UX batch.
- Blocker: status migration causes contract drift between renderer and service/tool schemas.
  - Escalation: pause UI rollout and ship contract updates first with tests.
- Blocker: search/navigation regressions after `Projects` removal.
  - Escalation: add compatibility fallback routing to `Tasks` and ship only after manual keyboard/search matrix passes.
- Blocker: subtask DnD introduces reorder corruption across scoped lists.
  - Escalation: keep global reorder reconciliation path and disable cross-scope reorder until deterministic.

## Completion Criteria

- Task navigation model is `Today | Tasks | Inbox` with consistent shortcuts and routing.
- Users can perform primary edits directly from task rows without opening task bodies.
- `waiting` status is fully supported end-to-end.
- Today and Inbox operate as lens/capture workflows as designed.
- Assistant proactive/risk behaviors remain functional (no regression from hidden backend fields).
- Lint/typecheck/tests and manual UX regression checks pass.
