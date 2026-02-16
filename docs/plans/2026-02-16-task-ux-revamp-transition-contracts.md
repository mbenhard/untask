# Task UX Revamp Transition Contracts

**Date**: 2026-02-16  
**Status**: Locked for implementation batch 1

## 1. UI-hidden vs Backend-retained Fields

The following fields are hidden from primary task UX surfaces in this revamp, but remain persisted and available to assistant/runtime logic for this release:

- `effort`
- `invoiceStatus`
- `dueType`
- `valueAtRisk`
- `lastClientTouchAt`

Implementation contract:
- Renderer navigation and row interactions should not depend on these fields for primary execution flows.
- Main process, AI context/tooling, and DB schema keep these fields intact to prevent proactive/risk policy regressions.

## 2. Status Contract Surfaces (`waiting` added)

`waiting` is now part of the shared task status contract and must remain aligned in:

- Shared model typing: `flusk/src/types/models.ts`
- DB schema enum metadata: `flusk/src/main/db/schema.ts`
- Task service validation/filter typing: `flusk/src/main/services/taskService.ts`
- AI tool schemas consuming status: `flusk/src/main/ai/tools.ts` and tests in `flusk/src/main/ai/tools.test.ts`
- Renderer/main bridge typing:
  - `flusk/src/preload/index.ts`
  - `flusk/src/types/preload.d.ts`
  - `flusk/src/types/ipc.ts`

## 3. `Projects` -> `Tasks` Navigation Mapping

Mapped references for this batch:

- View key: `projects` -> `tasks` in `flusk/src/renderer/stores/appStore.ts`
- Title tab label: `Projects` -> `Tasks` in `flusk/src/renderer/components/layout/TitleBar.tsx`
- Keyboard `2`: routes to `tasks` in `flusk/src/renderer/hooks/useKeyboardShortcuts.ts`
- Search result fallback: routes to `tasks` in `flusk/src/renderer/components/search/SearchModal.tsx`
- Shell routing: `activeView === 'tasks'` in `flusk/src/renderer/components/layout/AppShell.tsx`
- Task body cross-link: `setView('tasks')` and label update in `flusk/src/renderer/components/tasks/TaskBody.tsx`

## 4. Non-destructive Transition Rule

No destructive migration is performed in this batch. Existing data remains valid while navigation and status contracts shift to the new model.
