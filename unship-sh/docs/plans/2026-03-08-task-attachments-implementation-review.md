# Implementation Review

## Plan Path

- `docs/plans/2026-03-08-task-attachments.md`

## Traceability Summary

| Plan task | Status | Code evidence | Notes |
| --- | --- | --- | --- |
| 1. Add `AttachmentRef` and `Task.attachments` | implemented | `crates/unship-core/src/task.rs` | Metadata is serialized through task frontmatter. |
| 2. Create attachments CRUD module | implemented | `crates/unship-core/src/attachments.rs`, `crates/unship-core/src/lib.rs` | Add/remove/path helpers exist, including byte uploads. |
| 3. Clean up attachments on task delete | implemented | `crates/unship-core/src/store.rs` | Single-task and bulk delete paths remove attachment dirs. |
| 4. Add attachment integration tests | implemented | `crates/unship-core/tests/attachments_test.rs` | Core file lifecycle tests are present and passing. |
| 5. Add Tauri attachment commands | partial | `apps/desktop/src-tauri/src/commands.rs`, `apps/desktop/src-tauri/src/lib.rs` | Commands exist, but attachment mutation is not atomic and no command-level tests were added. |
| 6. Add TypeScript API functions | implemented | `apps/desktop/src/lib/api.ts` | Frontend bindings cover attach/delete/get-path flows. |
| 7. Create `AttachmentList.svelte` | partial | `apps/desktop/src/lib/components/AttachmentList.svelte` | Dialog upload, delete, thumbnails, and paste exist; drag-and-drop/drop-zone behavior from the plan is missing. |
| 8. Integrate into `TaskModal` with paste | implemented | `apps/desktop/src/lib/components/TaskModal.svelte` | Paste events are forwarded into `AttachmentList`. |
| 9. Add kanban indicator | implemented | `apps/desktop/src/lib/components/Kanban.svelte` | Paperclip count renders on cards with attachments. |
| 10. Configure Tauri asset protocol | partial | `apps/desktop/src-tauri/tauri.conf.json` | Asset protocol is enabled, but scope is broader than the plan’s attachment-only restriction. |
| 11. Update `.gitignore` handling | implemented | `crates/unship-core/src/init.rs` | New projects now ignore `.unship/attachments/`. |
| 12. End-to-end testing and polish | partial | `cargo test -p unship-core --test attachments_test`, `cargo test -p unship-desktop`, `pnpm --dir apps/desktop check` | Scoped verification exists, but no UI/E2E coverage was added for attach dialog, paste, preview, or drag-and-drop. |

## Findings (by severity)

### P1

1. Drag-and-drop attachments from the approved plan are not implemented.
   - Plan evidence: the goal explicitly requires file dialog, drag-and-drop, and CMD+V paste, and Task 7 describes `AttachmentList.svelte` as an attachment list plus drop zone.
   - Code evidence: `apps/desktop/src/lib/components/AttachmentList.svelte` has no `dragenter`/`dragover`/`drop` handlers, and `apps/desktop/src-tauri/tauri.conf.json` still sets `"dragDropEnabled": false`.
   - Impact: one of the three promised input methods is absent, so the implementation does not satisfy the user-visible scope of the plan.

2. Attachment add/delete commands can leave file storage and task metadata out of sync on failure.
   - Code evidence: `apps/desktop/src-tauri/src/commands.rs` writes or deletes files first in `attach_file`, `attach_file_bytes`, and `delete_attachment`, then performs a separate `TaskStore::update`.
   - Impact: if the YAML update fails after the filesystem operation, the app can leave orphaned files on disk or frontmatter entries pointing at missing files. This also diverges from the plan’s stated goal of atomic persistence and using the project lock around attachment modifications.

### P2

1. The asset protocol scope is wider than the approved design.
   - Plan evidence: Task 10 narrows access to `["**/.unship/attachments/**"]`.
   - Code evidence: `apps/desktop/src-tauri/tauri.conf.json` currently uses `"scope": ["**"]`.
   - Impact: previews work, but the desktop webview is granted broader local file access than the plan intended, which weakens the security posture unnecessarily.

## Improvements Applied

- None. The review found two material implementation gaps and one configuration divergence; I did not make speculative fixes during the audit.

## Test Delta
- Before: `cargo test -p unship-core attachments -- --nocapture` compiled successfully but matched zero tests, so it did not provide a meaningful baseline for the attachment flow.
- After: `cargo test -p unship-core --test attachments_test -- --nocapture` passed (5/5), `cargo test -p unship-desktop -- --nocapture` passed (17/17), and `pnpm --dir apps/desktop check` passed with 0 errors and 1 unrelated accessibility warning in `TaskModal.svelte`.
- Gaps: no command-level tests for the new Tauri attachment IPC, and no UI/E2E coverage for dialog upload, paste handling, preview rendering, delete flow, or drag-and-drop.

## Verification Run

- `cargo test -p unship-core attachments -- --nocapture`
- `cargo test -p unship-core --test attachments_test -- --nocapture`
- `cargo test -p unship-desktop -- --nocapture`
- `pnpm --dir apps/desktop check`

## Verdict
FAIL

## LESSONS_LEARNED
1. Plan-complete attachment work needs interaction-level verification, not just core file tests.
2. File copy/delete plus YAML updates should be treated as one locked transaction or explicitly rolled back.
3. Security-scoped local file access should stay as narrow as the plan specifies.
