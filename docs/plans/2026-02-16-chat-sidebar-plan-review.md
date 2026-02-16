# Plan Review

## Plan Path
docs/plans/2026-02-16-chat-sidebar-design.md

## Verdict
CHANGES_REQUESTED

## Rubric Scores
- Scope (0-2): 2
- Sequencing (0-2): 1
- Verification (0-2): 0
- Risk (0-2): 1
- Total (0-8): 4

## Critical Issues
1. Safety gating for the new scratchpad mutation tool is not specified at the implementation level. `classifyRisk` in `flusk/src/main/ai/autonomy.ts` defaults unknown tools to `low`, so `edit_scratchpad` rewrite could execute without required approval unless explicit risk mapping is added.

## Recommended Changes
1. Keep view navigation effects in renderer state flow: tools should emit view intent metadata, and renderer (`chatStore`/`appStore`) should apply `setView`. Avoid direct UI side effects from main-process tool execution.
2. Define deterministic auto-switch precedence for ambiguous cases (`today + inbox`, `parse_notes` destinations, and `complete_task`/`update_task` when items are visible in multiple views).
3. Expand scope to include all `isChatMode` dependencies beyond listed files (`flusk/src/renderer/components/search/SearchModal.tsx`, `flusk/src/renderer/stores/scratchpadStore.ts`, selectors/usages in `flusk/src/renderer/stores/appStore.ts`, and chat empty-state copy in `flusk/src/renderer/components/chat/ChatView.tsx`).
4. Add a verification matrix with pass criteria (typecheck/lint/tests plus manual checks for `4`/`Cmd+K`, `Escape` layering, panel open/close transitions, auto-switch batching, and user override behavior).
5. Add rollback/failure notes for scratchpad edits (approval reject path, save failure handling after approval, and how before/after diff payload is surfaced in tool cards).

## Clarifying Questions (if needed)
- None required for this verdict.
