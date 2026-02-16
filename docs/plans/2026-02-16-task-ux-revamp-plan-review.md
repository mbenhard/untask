# Plan Review

## Plan Path
docs/plans/2026-02-16-task-ux-revamp-design.md

## Verdict
NEEDS_CLARIFICATION

## Rubric Scores
- Scope (0-2): 1
- Sequencing (0-2): 0
- Verification (0-2): 0
- Risk (0-2): 0
- Total (0-8): 1

## Critical Issues
1. The plan removes `invoiceStatus`, `valueAtRisk`, and `lastClientTouchAt`, but these are currently used by assistant risk/cashflow logic in `flusk/src/main/assistant/proactivePolicy.ts`, `flusk/src/main/assistant/contextCompiler.ts`, `flusk/src/main/ai/liveThought.ts`, and `flusk/src/main/ai/tools.ts`. Removing them without a replacement weakens assistant-first behavior and breaks current decision policies.
2. The `projects -> tasks` and status enum migration is under-specified across process boundaries. Current contracts depend on `'projects'` and `'inbox' | 'active' | 'in_progress' | 'done'` in schema, services, and UI routing (`flusk/src/main/db/schema.ts`, `flusk/src/main/services/taskService.ts`, `flusk/src/renderer/stores/appStore.ts`, `flusk/src/renderer/hooks/useKeyboardShortcuts.ts`, `flusk/src/renderer/components/search/SearchModal.tsx`). Missing a coordinated migration plan is a release blocker.

## Recommended Changes
1. Convert this into a dependency-ordered execution plan with explicit phases: schema/migration, service/tool contract updates, navigation refactor, task UI refactor, and stabilization.
2. Add a concrete DB migration spec for status and field changes, including backfill rules and downgrade/rollback behavior.
3. Define whether removed cashflow/risk fields are deprecated from UI only or removed everywhere, and if removed, specify replacement signals so proactive policies still satisfy assistant goals.
4. Add a verification matrix per phase (typecheck/lint/tests plus manual checks for keyboard navigation, search routing, done section, subtasks, and chat overlay behavior).
5. Add risk handling and rollback triggers (migration failure, IPC contract drift, and behavior regressions in assistant risk nudges).
6. Clarify the final navigation model for Scratchpad and Chat discoverability after removing the Chat tab and Projects tab.

## Clarifying Questions (if needed)
1. Should `invoiceStatus`, `valueAtRisk`, and `lastClientTouchAt` remain in backend intelligence while being hidden in UI, or be fully removed?
2. Should `Tasks` replace `Projects` everywhere (routing, search result jumps, shortcuts, and focus restore), with `Scratchpad` moved out of top-level tabs?
3. Is one-way data migration acceptable for this revamp, or do you require reversible migration support?
