# Task UX Revamp Handoff

**Date**: 2026-02-16
**Status**: Implemented

## Shipped

1. Navigation model is now `Today | Tasks | Inbox`.
2. `waiting` status is supported across shared contracts, main service validation, AI tool schemas, preload typing, and renderer typing.
3. Tasks workspace now uses status-grouped orchestration (`in_progress`, `active`, `waiting`, `done`) with `done` collapsed by default.
4. Task rows support direct collapsed-state editing:
   - priority cycle
   - status update
   - inline due/client updates
   - today toggle
   - complete/reopen
5. Task body execution flow supports:
   - notes edit/save (`Cmd/Ctrl+Enter`)
   - inline subtasks list
   - inline subtask creation and reorder
   - simplified metadata bar aligned to visible UX model
6. Today and Inbox lenses aligned:
   - Today: active today list + collapsed done-today section
   - Inbox: top capture input, tasks leave inbox when status changes
7. Transitional backend compatibility preserved for assistant/risk fields (`invoiceStatus`, `valueAtRisk`, `lastClientTouchAt`, plus related transitional fields) while removing them from primary task UX controls.

## Verification

- `npm run typecheck`: pass
- `npm run test -- --run src/renderer/components/tasks/taskInteraction.test.ts src/renderer/components/search/searchRouting.test.ts src/renderer/stores/appStore.test.ts src/main/ai/tools.test.ts src/renderer/stores/searchStore.test.ts src/renderer/hooks/useFocusTrap.test.ts src/main/ai/chat.test.ts`: pass
- `npm run lint`: fail due existing unresolved BlockNote imports in `src/renderer/components/scratchpad/ScratchpadView.tsx`.

## Added/Updated Test Coverage

- `src/renderer/components/tasks/taskInteraction.test.ts`
- `src/renderer/components/search/searchRouting.test.ts`
- `src/renderer/stores/appStore.test.ts`
- Existing suites re-run:
  - `src/main/ai/tools.test.ts`
  - `src/main/ai/chat.test.ts`
  - `src/renderer/stores/searchStore.test.ts`
  - `src/renderer/hooks/useFocusTrap.test.ts`

## Deferred / Follow-ups

1. Resolve BlockNote import/lint configuration mismatch so baseline lint is green.
2. Complete backend field deprecation once assistant replacement risk signals ship (explicit TODO markers added in shared/task-store types).
3. Manual UX smoke matrix remains recommended for:
   - keyboard navigation across Today/Tasks/Inbox
   - status transitions including waiting and done reopen
   - search jump routing behavior
   - inline edit focus/blur behavior in dense task lists
