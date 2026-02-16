# Plan Review

## Plan Path
`docs/plans/2026-02-16-scratchpad-search-settings-execution-plan.md`

## Verdict
CHANGES_REQUESTED

## Rubric Scores
- Scope (0-2): 1
- Sequencing (0-2): 1
- Verification (0-2): 2
- Risk (0-2): 2
- Total (0-8): 6

## Critical Issues
- None.

## Recommended Changes
- Add an explicit scope decision for `theme override` and `AI API key` settings behavior. Task 10 includes these settings, but the plan currently describes General/AI/Chat wiring only through existing APIs. Evidence:
  - `/Users/marcusbenhard/Development/untitled/flusk/src/renderer/components/providers/ThemeProvider.tsx` currently persists theme in localStorage (`flusk-theme`) rather than settings IPC.
  - `/Users/marcusbenhard/Development/untitled/flusk/src/main/ai/openrouter.ts` currently resolves API key from explicit arg/env (`OPENROUTER_API_KEY`) with no settings-key retrieval path.
- Clarify the settings persistence target by phase: task details call for settings-table persistence, but Phase A scope should explicitly state which settings migrate to DB now vs deferred. This prevents partial persistence drift across localStorage/env/settings.
- Make shortcut configurability sequencing explicit in Phase B by adding a prerequisite step to refactor hardcoded accelerators in `/Users/marcusbenhard/Development/untitled/flusk/src/main/shortcuts.ts` into settings-backed registrations before building renderer controls.

## Clarifying Questions (if needed)
- None required for review verdict.
