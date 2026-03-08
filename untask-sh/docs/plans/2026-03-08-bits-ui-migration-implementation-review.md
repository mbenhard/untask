# Implementation Review

## Plan Path

- `docs/plans/bits-ui-migration.md`

## Traceability Summary

| Plan task | Status | Code evidence | Notes |
| --- | --- | --- | --- |
| Phase 1.1 Select | implemented | `apps/desktop/src/lib/components/ui/MetaSelect.svelte`, `apps/desktop/src/lib/components/TaskModal.svelte`, `apps/desktop/src/lib/components/TaskDetail.svelte`, `apps/desktop/src/lib/components/TaskList.svelte`, `apps/desktop/src/lib/components/DocsViewer.svelte` | Native selects are replaced with Bits Select / MetaSelect in the planned surfaces. |
| Phase 1.2 Dialog | implemented | `apps/desktop/src/lib/components/TaskModal.svelte` | Task modal is on Bits Dialog and the review fixed the invalid Svelte directives that were breaking compile. |
| Phase 1.3 Alert Dialog | partial | `apps/desktop/src/lib/components/TaskModal.svelte`, `apps/desktop/src/lib/components/ProjectPicker.svelte` | Task delete confirm uses Bits AlertDialog. ProjectPicker init confirmation still uses an inline panel. |
| Phase 1.4 Popover | implemented (different primitive) | `apps/desktop/src/lib/components/TaskList.svelte` | The hand-rolled status popover is gone; inline status changes now use Bits Select instead of Bits Popover. |
| Phase 1.5 ProjectPicker dropdown Dialog | implemented | `apps/desktop/src/lib/components/ProjectPicker.svelte` | Dropdown mode is wrapped in Bits Dialog and manual backdrop handling was removed. |
| Phase 2.1 Sidebar navigation | implemented | `apps/desktop/src/lib/components/SidebarNav.svelte` | Plan option B was chosen: `role="navigation"` plus `aria-current`. |
| Phase 2.2 Collapsible | missing | `apps/desktop/src/lib/components/DocsViewer.svelte` | Folder expansion still uses local `expandedPaths` state and manual toggle handling. |
| Phase 2.3 Scroll Area | missing | `apps/desktop/src/lib/components/DocsViewer.svelte`, `apps/desktop/src/lib/components/TaskList.svelte`, `apps/desktop/src/lib/components/Kanban.svelte` | Custom scrollbar CSS remains in place; no Bits ScrollArea wrapper exists yet. |
| Phase 2.4 Tooltip | partial | `apps/desktop/src/App.svelte`, `apps/desktop/src/lib/components/ui/MetaTooltip.svelte`, `apps/desktop/src/lib/components/TaskModal.svelte` | Provider and wrapper exist. Review fixed trigger binding in `MetaTooltip`, but many native `title` attributes remain. |
| Phase 2.5 Progress | implemented | `apps/desktop/src/lib/components/Kanban.svelte`, `apps/desktop/src/lib/components/TaskModal.svelte`, `apps/desktop/src/lib/components/TaskDetail.svelte` | Bits Progress is used for the planned bars. |
| Phase 2.6 Dropdown Menu | implemented (optional) | `apps/desktop/src/lib/components/DocsViewer.svelte` | Optional doc action menu was shipped. |

## Findings (by severity)

### P2 - ProjectPicker init confirmation is still outside Bits AlertDialog
- Evidence: `apps/desktop/src/lib/components/ProjectPicker.svelte:271-285`
- Impact: phase 1.3 is only partially complete, and the confirmation still behaves like inline content rather than a focus-locking modal confirmation.
- Recommendation: move the `initPrompt` confirmation into a shared `ConfirmDialog`/Bits AlertDialog flow.

### P2 - Docs tree still uses hand-rolled collapse state and custom scrollbar styling
- Evidence: `apps/desktop/src/lib/components/DocsViewer.svelte:39`, `apps/desktop/src/lib/components/DocsViewer.svelte:174-183`, `apps/desktop/src/lib/components/DocsViewer.svelte:874-888`
- Impact: phase 2.2 and 2.3 are not complete; the tree keeps bespoke expand/collapse state and duplicated scrollbar CSS instead of the planned Bits primitives.
- Recommendation: migrate folder rows to Bits Collapsible and replace `docs-tree` scrollbar CSS with a shared ScrollArea wrapper before calling phase 2 complete.

### P3 - Tooltip rollout is still partial outside TaskModal
- Evidence: `apps/desktop/src/App.svelte:282`, `apps/desktop/src/lib/components/SidebarNav.svelte:38`, `apps/desktop/src/lib/components/TaskList.svelte:256-264`, `apps/desktop/src/lib/components/Kanban.svelte:325`
- Impact: tooltip behavior is still inconsistent across the migrated UI. The review fixed `MetaTooltip` itself, but the app still relies on native `title` attributes in several places.
- Recommendation: continue the phase 2.4 replacement pass and use `MetaTooltip` for interactive chrome where consistent delay and styling matter.

## Improvements Applied

- Fixed the blocking Bits Dialog regression in `TaskModal.svelte` by replacing invalid component directives with computed class props.
- Fixed `MetaTooltip.svelte` so the Bits trigger props land on the actual interactive element, not a wrapper span.
- Cleared migration-related Svelte warnings by cleaning up dialog class animation selectors, autofocus usage, and docs tree semantics.
- Re-ran desktop checks/build after the review-driven fixes.

## Test Delta
- Before:
  - `pnpm --filter untask-desktop check` failed.
  - Failure summary: 1 compile error in `TaskModal.svelte` (`class:` directive on `Dialog.Overlay`) and 4 warnings.
- After:
  - `pnpm --filter untask-desktop check` passed with 0 errors and 0 warnings.
  - `pnpm --filter untask-desktop build` passed.
- Gaps:
  - `pnpm --filter untask-desktop tauri dev` could not be fully smoke-tested because port `5173` was already occupied by an existing `node` process (`PID 49598`) in this workspace.
  - No manual keyboard/screen-reader verification was run from the desktop shell session.

## Verification Run

- `pnpm --filter untask-desktop check`
- `pnpm --filter untask-desktop build`
- `pnpm --filter untask-desktop tauri dev` (blocked by occupied port `5173`)

## Verdict
PASS_WITH_CHANGES

## LESSONS_LEARNED
1. Bits component migrations need runtime verification, not just source swaps, because Svelte directives and wrapper composition can silently invalidate the integration.
2. "Phase complete" should be measured against the traceability matrix, not just the set of files touched.
3. Wrapper components are only useful if they preserve the headless primitive's focus and trigger semantics end-to-end.
