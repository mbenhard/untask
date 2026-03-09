# Task ID: 14

**Title:** TUI Views: Kanban, List, Docs, and Detail

**Status:** pending

**Dependencies:** 13

**Priority:** medium

**Description:** Implement the four main TUI views: kanban board with columns, task list with filtering and sorting, docs browser, and task detail pane.

**Details:**

Implement TUI view components:

1. Create `crates/unship-cli/src/tui/kanban.rs`:
   - Render columns based on config
   - Show task cards with title, priority badge, subtask progress
   - Highlight selected column and task
   - Show Unmatched column for unknown statuses
   - Show Unindexed section for unmanaged tasks

2. Create `crates/unship-cli/src/tui/list.rs`:
   - Tabular task list
   - Column headers: ID, Title, Status, Priority, Tags
   - Highlight selected row
   - Support filtering by status/tag/priority and stable sort options (show filter bar)

3. Create `crates/unship-cli/src/tui/docs.rs`:
   - File tree or flat list of docs
   - Show doc path and title
   - Highlight selected doc

4. Create `crates/unship-cli/src/tui/detail.rs`:
   - Show full task metadata
   - Render body markdown (plain text with formatting hints)
   - Show subtask progress bar
   - Action hints at bottom: 'e' to edit, 's' to change status

5. Keyboard actions in views:
   - Kanban/List: Enter → detail view, 'd' → mark done
   - Docs: Enter → open in $EDITOR
   - Detail: 'e' → edit in $EDITOR, Escape → back

**Test Strategy:**

Manual smoke testing:
1. Create sample tasks across different statuses.
2. Verify kanban shows columns with tasks.
3. Verify list shows all tasks in table format.
4. Verify list filters by status, tag, and priority and supports stable sort modes.
5. Verify docs shows discovered documents.
6. Verify detail view shows full task information.
7. Verify keyboard navigation works in each view.
8. Verify unmatched/unindexed items are visible.
9. Verify 'e' opens editor correctly.
