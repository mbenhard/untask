# Flow Coverage Matrix

Date: 2026-02-23
Scope: high-signal core flows for a lean task/notes/chat app quality gate.

| Flow | Automated Coverage | Manual Coverage | Status |
| --- | --- | --- | --- |
| Task create/update optimistic path | `src/renderer/stores/taskStore.test.ts` | Checklist #1 | Covered |
| Task cascade delete + rollback | `src/renderer/stores/taskStore.test.ts` | Checklist #3 | Covered |
| Task complete with children + undo | `src/main/services/taskService.test.ts` | Checklist #2 | Covered |
| Task selection consistency after refresh/delete failure | `src/renderer/stores/taskStore.test.ts` | Checklist #1/#7 | Covered |
| Task keyboard reorder/delete shortcut routing | `src/renderer/hooks/useTaskListKeyboard.test.ts` | Checklist #4 | Covered |
| Task refresh race and ordering | `src/renderer/stores/taskStore.test.ts` | Checklist #7 | Covered |
| Chat stream event sequencing/state cleanup | `src/renderer/stores/chatStore.test.ts` | Checklist #8 | Covered |
| Chat stream indicator phase behavior | `src/renderer/stores/chatStore.test.ts` | Checklist #8 | Covered |
| Cross-thread/proactive chat completion guards | `src/renderer/stores/chatStore.test.ts` | Checklist #9 | Covered |
| Notes -> AI handoff + failed-save guard | `src/renderer/stores/notesStore.test.ts` | Checklist #12 | Covered |
| Quick-add summon/create/navigate cross-window flow | `src/main/clipboard.test.ts`, `src/main/shortcuts.test.ts`, `src/main/window/summonController.test.ts`, `src/main/window/quickAddWindow.test.ts` | Checklist #11 | Covered |
| Startup/relaunch resilience | N/A | Checklist #10 | Manual only |

## Execution Gate

- Automated: `npm run test:smoke`
- Manual: `docs/manual-smoke-checklist.md`
- Escalation rule: any bug found in manual flow must add one regression test before closure.
