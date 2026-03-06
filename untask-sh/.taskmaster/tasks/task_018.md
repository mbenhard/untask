# Task ID: 18

**Title:** Desktop Frontend: Shell, Project Lifecycle, and Core Views

**Status:** pending

**Dependencies:** 17

**Priority:** high

**Description:** Build the desktop UI with project picker, sidebar, kanban board, task list, task detail with Milkdown editor, and docs viewer/editor, all aligned with `docs/untask-design-language.md`.

**Details:**

Implement the frontend UI. All visual work in this task should follow `docs/untask-design-language.md`:

1. Create `apps/desktop/src/lib/stores.ts`:
```typescript
import { writable } from 'svelte/store';

export const currentProject = writable<string | null>(null);
export const tasks = writable<Task[]>([]);
export const selectedTask = writable<Task | null>(null);
export const docs = writable<Doc[]>([]);
export const view = writable<'kanban' | 'list' | 'docs'>('kanban');
```

2. Create components:
   - `ProjectPicker.svelte` - folder selection with Tauri dialog
   - `Sidebar.svelte` - navigation and project info
   - `Kanban.svelte` - column-based board view
   - `TaskList.svelte` - table view with filtering and sorting
   - `TaskDetail.svelte` - metadata + Milkdown body editor
   - `DocsViewer.svelte` - doc list and preview
   - `DocsEditor.svelte` - Milkdown-based doc editing

3. Milkdown integration:
```typescript
import { Editor, rootCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';

// Use Svelte action for integration
export function milkdownEditor(node: HTMLElement, content: string) {
    let editor: Editor;
    // Initialize editor, handle updates
    return {
        update(newContent: string) { /* ... */ },
        destroy() { editor.destroy(); }
    };
}
```

4. Frontmatter handling:
   - Strip YAML frontmatter before passing to Milkdown
   - Re-prepend frontmatter on save
   - Preserve exact frontmatter format

5. Task operations:
   - Drag-drop or move button between columns that follow config order
   - Click to open detail view
   - Edit body with Milkdown
   - Save triggers backend update
   - Surface Unmatched and Unindexed items non-destructively

6. Restore the last project on launch via backend recent-project metadata stored in Application Support, not frontend-only persistence.

**Test Strategy:**

Manual testing with sample project:
1. Test first-run flow: show project picker.
2. Test folder selection offers inline initialization when `.untask/` is missing.
3. Test kanban displays tasks in config-defined columns plus any Unmatched/Unindexed groups.
4. Test task list displays all tasks and supports filter/sort flows.
5. Test clicking task opens detail view.
6. Test Milkdown editor loads task body.
7. Test editing and saving task body.
8. Test docs viewer lists documents.
9. Test docs editor saves changes.
10. Test markdown round-trip fidelity (no format mangling).
11. Test last project restore on app relaunch via backend metadata.
12. Verify the resulting UI matches `docs/untask-design-language.md` for typography, density, borders, chroma restraint, and priority-dot treatment.
