# Task UX Revamp Design

**Date**: 2026-02-16
**Status**: Approved

## Problem

The current three-view model (Today / Projects / Inbox) is overengineered, has unclear mental model boundaries, and forces AI dependency for basic task management. Users cannot add subtasks, edit most fields, or manage tasks without expanding bodies and hunting through dropdowns. Projects as a separate view creates unnecessary cognitive overhead when many tasks are simply standalone items.

## Design Principles

1. **Direct manipulation first** — every field editable with a click or keypress, no AI required
2. **Flat with structure** — one list, grouped by status, projects are inline collapsible groups
3. **Today is a lens** — flagging a task for today doesn't move it, it just also appears in the focused view
4. **Inbox is pure capture** — zero friction entry, process by changing status
5. **Fewer fields, all editable** — trim the model, make everything interactive

## Clarification Decisions (2026-02-16)

1. **Risk/cashflow fields are hidden in UI for this revamp, not removed from storage yet.**
   - Keep backend compatibility for `invoiceStatus`, `valueAtRisk`, and `lastClientTouchAt` so proactive policies and risk prompts continue to function.
   - Remove these fields from primary task editing surfaces in this UX pass.
2. **`Projects` tab is fully replaced by `Tasks` for task navigation.**
   - Routing, keyboard shortcuts, and search result navigation should target `Tasks` instead of `Projects`.
   - Chat remains overlay-only; Scratchpad remains accessible but is not part of the three-task-nav tabs.
3. **Migration policy is non-destructive for this release.**
   - Add `waiting` status across types/contracts and keep legacy data fields during transition.
   - Defer physical field removal until assistant risk-signal replacements are shipped.

## Navigation

Three tabs: `Today | Tasks | Inbox`

Chat remains as a bottom input overlay (not a tab). Activates on `Cmd+K` or input focus.

### Tab Mental Model

| Tab | Mode | Question it answers |
|-----|------|---------------------|
| Today | Execute | "What am I doing right now?" |
| Tasks | Plan | "What's my full picture?" |
| Inbox | Capture | "Let me dump this before I forget" |

## Data Model Changes

### Hidden In Task UX (Retained In Backend This Release)
- `effort` (unknown/tiny/small/medium/deep)
- `invoiceStatus` (none/draft/sent/paid/overdue)
- `dueType` (hard/soft)
- `valueAtRisk`
- `lastClientTouchAt`

### Added Status
- `waiting` added to status enum: `inbox | active | in_progress | waiting | done`

### Final Task Schema

Primary UI contract for this revamp (storage may retain transitional fields listed above):

```typescript
{
  id: string
  parentId: string | null
  title: string
  body: string | null              // Markdown notes
  status: 'inbox' | 'active' | 'in_progress' | 'waiting' | 'done'
  priority: 'none' | 'low' | 'medium' | 'high'
  today: boolean
  client: string | null
  dueDate: string | null           // YYYY-MM-DD
  order: number | null
  createdAt: string
  completedAt: string | null
}
```

## Task Row (Collapsed State)

Every task displays as a single interactive row:

```
○  Fix landing page hero         @Acme    Feb 20  ▸
●                            [in_progress]
```

- **Checkbox** (left): Click to complete
- **Priority dot** (left, color-coded): Click to cycle none→low→med→high→none
  - none: transparent
  - low: subtle border color
  - medium: muted foreground
  - high: foreground/bold
- **Title** (center): Click to inline edit, Enter to save, Escape to cancel
- **Client tag** (center-right): Shown only when set, subtle uppercase badge
- **Due date** (right): Shown when set, click to open date picker
- **Status badge** (right): Click to open status dropdown
- **Today sun icon**: Visible on hover, filled when flagged
- **Expand chevron** (far right): Click to expand TaskBody

**Key principle**: No need to expand the task for basic edits. Everything is one click from the row.

## Expanded Task (TaskBody)

Clicking the row or chevron expands the task body below:

### 1. Notes Section
- Displays rendered text when not editing
- Click to edit (textarea)
- Cmd+Enter to save
- Empty state: subtle "+ Add notes..." placeholder

### 2. Subtasks Section
- Listed inline with checkboxes
- `+ Add` button at top right (or press `A` when focused)
- Type title, Enter to add, input stays open for rapid entry
- Subtasks are draggable to reorder
- Subtask checkboxes work independently

### 3. Metadata Bar
- Compact row(s) of all editable fields
- Each field clicks to edit inline:
  - **Priority**: Click dot to cycle
  - **Due date**: Click to open date picker
  - **Client**: Click to edit text field, dashed border when empty
  - **Project**: Dropdown to assign parent task
  - **Today**: Toggle switch
- Empty fields show as subtle placeholder: `+ client`, `+ due date`
- Delete button at bottom right (with confirmation)

### Animation
- Expand/collapse: 200ms height auto (easeOut)
- Reduced motion: 100ms

## Tasks View (Main Workspace)

Flat list grouped by status. Projects and standalone tasks coexist.

```
── In Progress ──────────────────────────────────── 3
  ○ Fix landing page hero         @Acme    Feb 20
  ○ Write blog post draft
  ▸ Mobile App Redesign                       2/6

── Active ───────────────────────────────────────── 5
  ○ Call dentist
  ○ Buy monitor cable
  ▸ Website Redesign                          3/7
  ○ Review PR for mobile nav      @BigCo
  ○ Update portfolio site

── Waiting ──────────────────────────────────────── 2
  ○ Invoice feedback              @Acme   [waiting]
  ○ Design approval               @BigCo  [waiting]

── Done ──────────────────────────────── ▸ 14 tasks
```

### Status Groups
- Collapsible (click header to collapse/expand)
- Count shown in header
- Tasks draggable to reorder within group
- Changing status badge moves task to new group

### Projects (Inline)
- Projects are tasks with subtasks — shown with ▸ chevron and completion count (e.g., 2/6)
- Click to expand: subtasks shown indented below
- Project row has its own status independent of subtask statuses
- Project row is fully interactive (same as any task)

### Done Section
- Collapsed by default at very bottom
- Shows count: "▸ 14 tasks"
- Expand to see completed tasks with checked boxes, strikethrough titles, completion dates
- Can uncheck to reopen a task (moves back to active)

### New Task Input
- Bottom of view: `+ Add task...`
- Defaults to `active` status
- Press `N` to focus

## Today View

Morning cockpit. Only tasks flagged `today=true`.

```
LiveThought
"3 tasks today. Acme deadline is tomorrow."

○ Fix landing page hero         @Acme    Feb 20
○ Call dentist
○ Review PR for mobile nav      @BigCo

── Done today ──────────────────────── 2 tasks

+ Add to today...
```

- **LiveThought** at top: AI-generated summary/nudge
- **Flat list** — no status grouping (intentionally simple)
- **Same task rows** — fully interactive, expandable, all fields editable
- **Done today** section collapsed at bottom
- **Tasks are the same objects** as in Tasks view — today is a lens, not a copy
- New task input defaults to `active` status + `today=true`

## Inbox View

Pure capture. Zero friction.

```
+ Type to capture...

○ Call dentist about appointment
○ Acme wants homepage changes asap
○ Look into that invoice tool Maria mentioned
○ Buy new monitor cable
```

- **Input at top**, always visible. Type, Enter, done. No fields, no dropdowns.
- Tasks created with `status: 'inbox'`
- **Processing**: Click item → expands (same TaskBody) → change status to anything other than inbox → it disappears from Inbox, appears in Tasks view
- No bulk processing (MVP)

## Keyboard Shortcuts

### Navigation
| Key | Action |
|-----|--------|
| `1` | Today view |
| `2` | Tasks view |
| `3` | Inbox view |
| `Cmd+K` | Focus chat |
| `Cmd+N` | Scratchpad |
| `Escape` | Close/back (layered) |

### Task Actions (when task is focused)
| Key | Action |
|-----|--------|
| `Enter` | Expand/collapse task body |
| `Space` | Complete task (checkbox) |
| `T` | Toggle today flag |
| `E` | Edit title inline |
| `S` | Cycle status |
| `P` | Cycle priority |
| `D` | Open due date picker |
| `↑/↓` | Navigate between tasks |

### Creating
| Key | Action |
|-----|--------|
| `N` | New task (inline input in current view) |
| `A` | Add subtask (when inside expanded project) |

## Migration from Current UI

### Deleted
- Projects view (`ProjectsView.tsx`)
- ProjectGroup component
- Chat as a tab (remains as overlay only)
- Effort field, invoice status field, due type field, value at risk, last client touch

### Modified
- TaskItem: add inline priority cycling, status dropdown, due date click
- TaskBody: add subtask creation UI, simplify metadata bar
- TaskList: add status grouping logic
- TitleBar: three tabs instead of four
- appStore: remove 'projects' from activeView, update view types
- taskStore: add 'waiting' status, remove deleted field selectors
- Task model: remove unused fields, add waiting status

### New
- Status group headers (collapsible)
- Inline subtask creation (+ Add in TaskBody)
- Status badge dropdown component
- Priority dot cycling component

## Component Architecture

```
AppShell
├── TitleBar
│   ├── Tab: Today (1)
│   ├── Tab: Tasks (2)
│   ├── Tab: Inbox (3)
│   └── Right: Scratchpad | Settings
│
├── Main View Area
│   ├── TodayView
│   │   ├── LiveThought
│   │   ├── TaskList (flat, today=true tasks)
│   │   ├── DoneSection (collapsed, completed today)
│   │   └── InlineTaskInput (default: active + today)
│   │
│   ├── TasksView
│   │   ├── StatusGroup "In Progress"
│   │   │   └── TaskList (status=in_progress tasks + projects)
│   │   ├── StatusGroup "Active"
│   │   │   └── TaskList (status=active tasks + projects)
│   │   ├── StatusGroup "Waiting"
│   │   │   └── TaskList (status=waiting tasks + projects)
│   │   ├── DoneSection (collapsed)
│   │   └── InlineTaskInput (default: active)
│   │
│   └── InboxView
│       ├── InlineTaskInput (top, default: inbox)
│       └── TaskList (status=inbox tasks)
│
├── ChatView (overlay, shown when chat active)
│
└── ChatInput (fixed bottom, always visible)
```

## Status Flow

```
inbox ──→ active ──→ in_progress ──→ done
                  ──→ waiting ──────→ active (when unblocked)
                                    → done
```

- Inbox → Active: when processed (status changed in inbox)
- Active → In Progress: manual status change
- Active/In Progress → Waiting: when blocked on external
- Waiting → Active: when unblocked
- Any → Done: checkbox or status change
- Done → Active: uncheck to reopen
