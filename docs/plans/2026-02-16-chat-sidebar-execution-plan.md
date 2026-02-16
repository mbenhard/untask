# Chat Sidebar + AI View-Switching Execution Plan

## Preconditions

- Design intent in `/Users/marcusbenhard/Development/untitled/docs/plans/2026-02-16-chat-sidebar-design.md` remains the source behavior target.
- Review findings in `/Users/marcusbenhard/Development/untitled/docs/plans/2026-02-16-chat-sidebar-plan-review.md` are resolved in this execution sequence.
- Process boundaries remain unchanged:
  - main process: DB, filesystem, tool execution
  - preload: typed IPC bridge only
  - renderer: UI state/routing only
- Baseline validation commands are available in `/Users/marcusbenhard/Development/untitled/flusk`:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test -- --run`

## Task List
1. Lock behavior contracts and explicit non-goals.
   - Define panel behavior (`open`, `close`, `toggle`) as replacement for chat view takeover.
   - Define deterministic action-to-view mapping and precedence rules.
   - Confirm non-goals: no resizable divider, no persistence of panel state.
2. Migrate app-level chat UI state from mode to panel.
   - Replace `isChatMode` with `isChatPanelOpen` in `appStore`.
   - Add `openChatPanel`, `closeChatPanel`, `toggleChatPanel`.
   - Keep `setView` domain semantics intact and renderer-owned.
3. Refactor shell layout to side-by-side content + chat panel.
   - Update `AppShell` to render content and optional right panel with `ChatView` + `ChatInput`.
   - Remove chat takeover branch and absolute footer input positioning.
   - Keep animation budget at ~200ms and honor reduced-motion behavior.
4. Remove Chat tab and align all renderer dependencies.
   - Update `TitleBar` to only show `Today`, `Tasks`, `Inbox`, `Notes`.
   - Update `ChatView` empty-state copy to panel language.
   - Replace all `enterChatMode/exitChatMode` call sites (including `SearchModal`, `scratchpadStore`, and shortcut wiring) with panel actions.
5. Update keyboard behavior and Escape layering.
   - `4` toggles panel.
   - `Cmd/Ctrl+K` toggles panel and focuses input when opening.
   - `Escape` layering becomes: search overlay -> clear input -> memory settings -> close panel -> request hide.
6. Add scratchpad AI tools with explicit safety gating.
   - Add `read_scratchpad` (read-only) and `edit_scratchpad` (`append`, `replace`, `rewrite`) in `src/main/ai/tools.ts`.
   - Add explicit risk mapping in `src/main/ai/autonomy.ts` so `edit_scratchpad` rewrite is never treated as implicit low risk.
   - Ensure action cards include sufficient diff/summary payload for approval UX.
7. Implement AI-driven view intent without main-process UI side effects.
   - Tool layer emits view intent metadata (e.g., via action card metadata), but never mutates renderer state directly.
   - Renderer (`chatStore` + `appStore`) applies navigation on successful action completion.
   - Apply only once per assistant turn using last-significant action precedence.
8. Implement deterministic view-switch and user override policy.
   - Mapping:
     - `create_task`: `today=true` -> `today`; `status='inbox'` -> `inbox`; else -> `tasks`.
     - `set_today` -> `today`.
     - `edit_scratchpad` -> `scratchpad`.
     - `parse_notes`: destination `inbox` -> `inbox`; non-inbox destination -> `today`.
     - `update_task`/`complete_task`: use resulting task lens (`today` first, then `inbox`, else `tasks`).
   - User override: if user manually changes view during an active assistant turn, suppress auto-switch for that request.
9. Add tests and run verification matrix.
   - Unit tests for app store panel actions/selectors.
   - Unit tests for keyboard shortcut layering behavior.
   - Unit tests for risk classification and gating of `edit_scratchpad`.
   - Unit tests for chat auto-switch batching and user-override suppression.
10. Finalize docs and handoff.
   - Update touched plan artifacts and note deferred follow-ups.
   - Record rollback triggers and operational fallbacks.

## Verification Per Task
- Task 1:
  - Contract notes include explicit non-goals and precedence table.
  - No unresolved ambiguity remains for mapping or ownership boundaries.
- Task 2:
  - `appStore` compiles with no `isChatMode` references.
  - Existing view navigation behavior still works with panel closed.
- Task 3:
  - Panel closed: content uses full width and chat input is hidden.
  - Panel open: content/chat split is rendered and input is in panel footer.
- Task 4:
  - Title bar contains no Chat tab.
  - Search and scratchpad integrations open/close chat panel correctly.
- Task 5:
  - `4`, `Cmd/Ctrl+K`, and `Escape` behavior matches layering spec.
  - No regression in search modal or memory settings dismissal.
- Task 6:
  - `read_scratchpad` returns current content safely.
  - `edit_scratchpad` rewrite requires approval in safe/manual/autopilot modes per risk policy.
  - Replace action includes before/after summary in tool card payload.
- Task 7:
  - No renderer navigation mutation is executed from main process code.
  - View intent metadata is persisted through stream events and consumable in renderer.
- Task 8:
  - One auto-switch max per assistant turn.
  - Manual user navigation during stream suppresses further auto-switch for that turn.
  - Mapping outcomes match deterministic table.
- Task 9:
  - `npm run lint` passes.
  - `npm run typecheck` passes.
  - `npm run test -- --run` passes for touched scope.
  - Manual smoke checks pass for panel toggle, tool cards, and view transitions.
- Task 10:
  - Plan artifacts updated with final implementation notes.
  - Residual risk list and deferred items documented.

## Batch Size
Default: 3 tasks per batch

Recommended batches:
- Batch 1 (state + layout): Tasks 1-4
- Batch 2 (shortcuts + tooling safety): Tasks 5-6
- Batch 3 (view intent + stabilization): Tasks 7-10

## Blockers and Escalation

- Blocker: scratchpad rewrite can execute without explicit approval due incomplete risk mapping.
  - Escalation: ship no `edit_scratchpad` mutations until autonomy classification is explicit and tested.
- Blocker: auto-switch implemented in main process introduces renderer ownership violation.
  - Escalation: block merge and move switching logic to renderer via metadata-only events.
- Blocker: `Escape` layering regression hides window before dismissing overlays/panel.
  - Escalation: pause release and restore deterministic layer handling first.
- Blocker: user override policy not enforced causes AI navigation fights.
  - Escalation: disable auto-switch feature flag and ship sidebar-only layout.
- Blocker: scratchpad save failure after approved rewrite.
  - Escalation: keep prior content, emit error tool card, and suppress view switch for failed mutation.

## Completion Criteria

- Chat is a sidebar panel with content visible concurrently and no chat takeover mode remaining.
- Keyboard and escape behaviors match documented layering and are regression-tested.
- Scratchpad read/edit tools exist with explicit autonomy safety handling and approval UX for high-risk rewrites.
- AI view-switching is deterministic, batched per turn, renderer-owned, and user-overridable.
- Lint/typecheck/tests and manual matrix pass for touched areas.
- Documentation artifacts are updated for review and implementation handoff.
