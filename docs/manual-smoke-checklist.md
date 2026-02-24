# Untask Manual Smoke Checklist (20 Minutes)

Date: 2026-02-23
Goal: Catch high-impact regressions quickly without full exploratory QA.

## Before Starting

- Run `npm run test:smoke`.
- Start app with `npm start`.
- Use a fresh local profile/db when possible.

## Critical Flows

1. Task create/edit/delete
- Create task, edit title/body, delete it.
- Expected: no stale selection, no ghost task rows, no console/runtime errors.

2. Subtask complete with undo
- Create parent with active subtasks, complete with children, then undo from toast.
- Expected: parent + all completed subtasks restore together.

3. Subtask delete with undo
- Delete parent with active subtasks (cascade), then undo.
- Expected: full parent/subtask tree restores.

4. Keyboard reorder and delete shortcut isolation
- Focus task list, use `Option+ArrowUp/Down` repeatedly, then `Cmd+Backspace`.
- Expected: reorder does not open delete confirm; delete shortcut only triggers on `Cmd+Backspace`.

5. Expand/collapse + focus navigation
- Use Arrow navigation + Enter expand/collapse across task rows.
- Expected: focus remains in correct row/list and does not jump unexpectedly.

6. Today toggle + undo
- Toggle `Today` on/off from Today view and undo from toast.
- Expected: item leaves/re-enters view correctly with no stale selection.

7. Cross-view navigation
- Switch Today/Tasks/Inbox/Notes with keyboard shortcuts and click navigation.
- Expected: active view and focus state remain consistent.

8. Chat send/stream/cancel
- Send a message, observe sending/thinking/streaming, cancel a stream, retry.
- Expected: indicator phases are coherent; no orphan placeholders after cancel/error.

9. Chat tool action + undo
- Trigger a task mutation through chat tool/action card and undo if available.
- Expected: action state resolves correctly and task state matches timeline.

10. App relaunch resilience
- Quit and reopen app after several task/chat operations.
- Expected: no crash, data intact, no broken initial render state.

11. Quick-add summon/create/navigate flow
- Trigger quick-add from global shortcut/menu, create a task, and verify main window navigates to the created task.
- Expected: quick-add opens/closes reliably, task appears in main list, and navigation target is correct.

12. Notes -> AI handoff
- Open a note with content, run "process with AI", then confirm chat opens with staged note context; also try with unsaved/empty content edge cases.
- Expected: non-empty note stages context and opens chat; empty content shows explicit guidance; failed save does not force view switch.

## Bug Logging Rule

For each bug found, log in `docs/bugs-and-edge-cases.md` with:
- Repro steps
- Expected vs actual
- Status (`Open`, `In Progress`, `Fixed`)
- Test coverage added (if fixed)
