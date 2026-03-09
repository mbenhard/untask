# UI Polish Design: Prototype to Product

Date: 2026-03-07

## Problem

The desktop app works but feels like a prototype — unfinished, somewhat clunky flows, flat/lifeless interactions. The goal is a holistic polish pass that takes it to "finished product" level while preserving the existing design language (monochrome, dense, industrial, keyboard-first).

## North Star

Linear x Raycast: dense, fast, keyboard-first, every pixel intentional, smooth transitions, minimal chrome but maximum polish.

## Design Philosophy

Remove decoration, add precision. Every hover, transition, and spacing choice should feel intentional and mechanical.

---

## 1. Shell & Navigation

### 1.1 Sidebar: Icon Rail

Replace the 200px text sidebar with a compact ~52px icon-only rail.

- Each nav item: 32x32 icon button
- Active view: `bg-accent` pill behind the icon
- Hover: `bg-accent/40` fill (120ms ease)
- Keyboard hints (`1`, `2`, `3`, `4`): tiny `10px` mono badges beside each icon
- No text labels — icons are self-evident for 4 items (Board, List, Docs, Next)

### 1.2 Title Bar

- Increase height from 32px to ~40px for better presence
- Project name centered in title bar: `11px` mono uppercase, `muted-foreground`
- Click project name to open project switcher (see 1.3)
- Subtle dropdown chevron next to name

### 1.3 Project Switcher

Replace the full-screen ProjectPicker with a command-palette-style dropdown.

- Floating panel: `max-w-[320px]`, blurred backdrop, centered under title bar
- Recent projects list: project name + path (`10px` mono muted) + relative time
- Type to filter (instant search)
- Bottom actions: "Open folder..." and "Init new project"
- Keyboard: `Cmd+O` to open, arrow keys navigate, Enter selects, Esc closes
- First launch / no project: same component rendered centered in viewport (larger)

### 1.4 View Transitions

- Switching views: subtle crossfade (150ms opacity + 4px translateY)
- Switching projects: brief fade-out (100ms) -> load -> fade-in (150ms)
- No hard cuts anywhere

---

## 2. Board (Kanban) View

### 2.1 Column Headers

- Uppercase `11px` mono column name (left) + count badge (right)
- `border-b border-border/60` separator below header
- Done columns: header text at `muted-foreground` opacity to visually recede

### 2.2 Task Cards

- `1px border-border/60` boundary, `rounded-[6px]`
- Hover: border brightens to `border-border` + subtle shadow lift (`0 2px 8px -2px rgba(0,0,0,0.3)`, 120ms)
- Inner padding: `8px 10px`
- Layout:
  - Row 1: Priority dot (5px) + Title (`13px`, single-line truncate)
  - Row 2 (conditional): Tags as `10px` mono chips (max 2 + `+N`) + relative date right-aligned `10px` mono muted
  - Row 2 only renders if metadata exists
- Subtask progress: thin 2px bar under card (full width, `rounded-full`), not text

### 2.3 Drag & Drop

- Dragged card: `scale-[0.97]` + slight rotation (`rotate-[1deg]`) + elevated shadow
- Drop target: 2px horizontal accent line with subtle glow
- On drop: card settles with quick `scale-[1.02] -> scale-[1]` bounce (80ms)

### 2.4 Quick-Add

- `+ Add task` renders as a dashed-border ghost row matching card width
- Click: expands into inline input with card styling
- Enter submits, Esc collapses

### 2.5 Empty Column State

- `+ Add task` sits at the top, directly under the header (not at column bottom)
- Below: dashed-border empty zone (`border-dashed border-border/40 rounded-[6px]`) as drop target
- Tiny `"Drop here"` in `10px` mono — only visible during drag, hidden otherwise
- Empty zone fills remaining column height

### 2.6 Column Scroll & Overflow

Current problem: columns are capped at viewport height and tasks scroll within each column,
but with many tasks the area feels overcrowded — cards are too tall, scrollbars are invisible,
and there's no visual indication that content overflows.

Fixes:

- Compact card height: with the refined card layout (2.2), cards drop to ~36-44px (single metadata row) vs current ~56px+. This immediately fits more tasks per viewport.
- Visible scroll: each column's task area gets the thin `6px` styled scrollbar (from 6.4), visible on hover/scroll — not hidden by default. Users need to know there's more content.
- Scroll fade: subtle gradient fade at the bottom of each column when content overflows (4px tall, `bg-gradient-to-t from-background/80 to-transparent`), signaling more tasks below.
- Top fade: same gradient at top when scrolled down, so users know there's content above too.
- Scroll position preserved: when data refreshes (new task added, drag-drop), maintain scroll position within each column rather than resetting to top.

### 2.7 Column Sizing & Layout

- Replace `gap-px bg-border/40` hack with proper `1px` border between columns using `border-r border-border/40` on each column (except last). Cleaner than background color trick.
- Each column: `min-w-[240px] max-w-[300px]`
- Horizontal scroll: subtle fade gradient on right edge when columns overflow viewport width

---

## 3. List View

### 3.1 Row Design

- `40px` row height
- Hover: `bg-accent/50` full-row fill (120ms)
- Selected/focused row: left `2px` accent border
- Rows separated by `1px border-border/40`

### 3.2 Column Layout

Remove the `#` ID column. New order:

| Column | Width | Content |
|--------|-------|---------|
| Priority | 24px | Clickable 5px dot, click to cycle |
| Title | flex-1 | `13px` sans, truncated |
| Tags | max 160px | `10px` mono text joined by `*` separators |
| Status | 100px | `10px` mono chip, clickable inline dropdown |
| Updated | 72px | Relative time, `10px` mono muted |

### 3.3 Sort Indicators

- Active sort column: tiny arrow in `muted-foreground`
- Other headers: arrow only on hover (more muted)

### 3.4 Filter Bar

- Single compact bar above table
- Filter input: no border by default, border appears on focus (Linear-style)
- Status filter: small `10px` mono dropdown

### 3.5 Quick-Add

- Permanent subtle input row at bottom (not a button that reveals input)
- Placeholder: `"Add task..."` in `muted-foreground`
- Just start typing, Enter submits

---

## 4. Task Modal

### 4.1 Shell

- Max width: `600px`
- Rounded: `12px`
- Border: `1px border-border/60`
- Shadow: `0 12px 36px -8px rgba(0,0,0,0.5)`
- Backdrop: `bg-black/50 backdrop-blur-[2px]`

### 4.2 Header

- Close `x` top-right
- Task ID as `10px` mono muted top-left
- Delete action moves to a `...` overflow menu (top-right, next to close)

### 4.3 Title

- `16px` sans, medium weight, plain text by default
- Entire title row is clickable to enter edit mode
- Edit mode: no border — text color shifts to `foreground/80`, blinking cursor appears
- Tiny `10px` mono `"Esc to cancel"` hint fades in at right edge
- On commit: text snaps back to full `foreground`

### 4.4 Metadata Row

Horizontal row below title, all inline, all clickable:

- Status: `10px` mono chip with border, click opens popover (not native select)
- Priority: clickable dot + label (`10px` mono), cycle on click
- Tags: inline `10px` mono pills, `x` to remove, `+` opens inline input
- No labels ("Status:", "Priority:") — values are self-evident

### 4.5 Body

- Empty state: muted `"Add notes..."` placeholder, clickable to focus
- Subtle top border separator from metadata
- Auto-save on blur; tiny `*` dot next to close button for unsaved state (replace the "Unsaved changes" bar)

### 4.6 Dates Footer

- Created / Updated / Completed in single line at bottom
- `10px` mono muted, separated by `*`

### 4.7 Animations

- Open: `scale(0.97) -> scale(1)` + `opacity(0->1)`, 180ms ease-out
- Close: `opacity(1->0)` + `scale(1->0.98)`, 120ms

---

## 5. Docs View

### 5.1 Tree Sidebar

- Width: `240px`
- Nodes: `32px` row height, `12px` sans text
- Expand/collapse: tiny chevron (`10px`), rotates 90deg (120ms)
- Active node: `bg-accent/50` + left `2px` accent border
- Hover: `bg-accent/30` (120ms)
- Depth indentation: `12px` base + `16px` per level
- Icons: tiny monochrome folder/doc outlines (`14px`)

### 5.2 Folder View

- Children as clean list rows (same style as tree nodes, not buttons)
- Folder header: name `14px` sans + count `10px` mono muted, single line
- Read-only indicator: subtle lock icon (not text)

### 5.3 Editor Pane

- Breadcrumb trail replaces back button: `10px` mono, clickable segments, `>` separators
- Doc name: `16px` sans
- Path: `10px` mono muted below name
- Tighter top padding

### 5.4 Empty States

- No doc selected: `"Select a document"` in `12px` mono muted + subtle doc outline icon
- Empty folder: `"No documents"` in `12px` mono muted

---

## 6. Micro-interactions & Global Polish

### 6.1 Focus & Keyboard

- All interactive elements: `ring-1 ring-ring/50` on `:focus-visible` (not on click)
- Logical tab order: sidebar -> main content -> modal

### 6.2 Loading States

- Project/data switch: subtle pulse animation on existing layout (skeleton)
- No spinners

### 6.3 Hover Consistency

- Every clickable surface: `120ms` ease transition on background/opacity
- No instant color snaps

### 6.4 Scrollbars

- Thin `6px`, `bg-border/40`, auto-hide on inactivity
- Rounded track

### 6.5 Health Warnings

- `10px` mono text, `border-border/60`, `rounded-[6px]`
- Amber dot before "unmatched", muted dot before "unindexed"
- Dismissible with tiny `x`

### 6.6 Error Feedback

- No toasts for routine actions (UI change is the feedback)
- Errors only: small bottom-right toast, `10px` mono, auto-dismiss 3s, dark border styling

---

## 7. Edge Cases & Flow Fixes

These are fixes to existing flows that need to be addressed as part of the polish pass.

### 7.1 View Keyboard Shortcuts

The sidebar displays `1`, `2`, `3`, `4` hints but no global keydown listener exists. Wire up:

- `1` → Board, `2` → List, `3` → Docs, `4` → Next (or remove if Next is cut)
- Listener on `window` level, only active when no input/textarea is focused
- Suppress when modal is open or when inside an editor

### 7.2 Quick-Add Error Handling

Currently, if `addTask()` fails, the input silently clears. Fix:

- On API error: keep the typed title in the input (don't clear)
- Flash the input border red briefly (same 800ms error flash pattern as task modal)
- Show a tiny inline error message below the input in `10px` mono destructive: `"Failed to create task"`
- Auto-dismiss error after 3s

### 7.3 Inline Priority Cycling (List View)

The plan mentions clickable priority dots in board cards but list rows need it too:

- Priority dot in list row column (24px) is clickable
- Click cycles: `null -> low -> medium -> high -> urgent -> null`
- Dot animates between colors (120ms crossfade, not instant snap)
- Saves immediately via `updateTask()`
- On save error: revert to previous state + flash row border red

### 7.4 Inline Status Dropdown (List View)

The status chip in list rows needs a popover spec:

- Click status chip → opens a small popover anchored below the chip
- Popover: `max-w-[180px]`, `rounded-[6px]`, `1px border-border/60`, `bg-popover`, subtle blur
- Lists configured columns as options, `12px` sans text
- Current status has a subtle checkmark or `bg-accent` highlight
- Done columns visually recede (`muted-foreground`)
- Keyboard: arrow keys to navigate, Enter to select, Esc to close
- Selecting a status saves immediately + closes popover
- Popover auto-closes on click outside

### 7.5 Delete Confirmation Flow

Delete moves to `...` overflow menu. Full flow:

- Click `...` → popover with actions: "Delete task" (destructive text)
- Click "Delete task" → popover content swaps to confirmation: "Delete this task?" with `Cancel` and `Delete` buttons
- `Delete` button: `bg-destructive` styling
- Keyboard: Enter on "Delete" to confirm, Esc to cancel back to overflow menu
- After deletion: modal closes, parent refreshes

### 7.6 Truncated Title Tooltips

- Board cards: on hover over truncated title, show native `title` attribute tooltip with full text
- List rows: same — `title` attribute on the title cell
- Keep it native (no custom tooltip component) — lightweight and consistent with macOS feel

### 7.7 Tags Overflow in Modal

- Metadata tags row: set `max-h-[80px] overflow-y-auto` when tag count > 6
- Thin scrollbar styling (same as global scrollbar spec)
- The `+` add-tag button always stays visible at the end (sticky)

### 7.8 Deep Doc Tree Indentation

- Cap indentation at depth 6: `padding-left: min(12 + depth * 16, 108)px`
- Beyond depth 6, items still render but don't indent further
- Alternatively: show a horizontal scroll on the tree sidebar if content overflows
- Tree sidebar gets `overflow-x-auto` with the same thin scrollbar styling

### 7.9 Stale File Detection (Docs)

Preserve the existing DocsEditor stale file banner during polish:

- Keep the three-action flow: Reload / Save as New / Keep Editing
- Style the banner to match polish: `10px` mono text, `border-border/60`, `rounded-[6px]`, amber left accent border
- "Reload" as primary action, others as ghost buttons

### 7.10 Modal Focus Trap

- When modal opens: trap focus within the modal container
- Tab cycles through interactive elements inside the modal only
- Shift+Tab cycles backwards
- Focus returns to the trigger element (task row/card) on close
- Implement with a lightweight focus-trap (manual `keydown` listener on Tab, not a library)

### 7.11 Error States

Spec error handling for all async operations:

**Failed task save (modal)**
- Keep existing 800ms red border flash
- Add tiny `10px` mono error text below the field that failed: `"Save failed"`, auto-dismiss 3s

**Failed doc save**
- Keep content in editor (don't discard)
- Show error banner at top of editor: `"Could not save — check file permissions"` in `10px` mono, amber border, dismissible

**Failed project open**
- Project switcher shows inline error: `"Could not open project"` in `10px` mono destructive
- Keep the project list visible so user can try another

**Backend unreachable / refresh failure**
- Health bar at top shows: `"Connection lost"` in `10px` mono, amber dot
- Auto-retry on 5s interval, remove bar when reconnected
- Don't block UI — show stale data with the warning

### 7.12 Unindexed Task UX

Current: locked fields + text banner. Improve:

- Banner: `"This task is unindexed — it exists on disk but isn't tracked yet."` in `10px` mono, `border-border/60`, amber left accent
- Add a single action button in the banner: `"Index this task"` (calls a reindex/repair API if available)
- If no repair API exists: `"Run 'unship reindex' in terminal to fix"` — copy-pasteable command
- All fields remain locked but visually present (not hidden)

### 7.13 Unsaved Changes Protection

When user has unsaved doc changes and tries to navigate away:

- Switch doc in tree: auto-save current doc before switching (docs already save on blur, but ensure this fires on tree node click)
- Switch view (Docs → Board): auto-save any open doc first
- Close app: Tauri `on_close_requested` hook → check for dirty docs → auto-save
- Task modal body: already auto-saves on blur, which fires on modal close. Ensure blur event fires before modal unmounts

Strategy: prefer silent auto-save over confirmation dialogs. This matches the "quiet, mechanical" design language — no nagging modals.

---

## 8. New Features (tracked separately)

The following are new features beyond the polish scope, tracked as unship tasks:

- **#12** Command palette / global search (`Cmd+K`)
- **#13** Column management UI
- **#14** Context menus (right-click)
- **#15** Theme toggle UI
- **#16** Next view (spec or remove)
- **#17** Subtask management UI

These should be implemented after the polish pass is complete.

---

## Implementation Priority

1. **Shell & nav** (icon rail, title bar, project switcher, view shortcuts) — sets the stage
2. **Task modal** (layout, title editing, metadata row, overflow menu, focus trap, error states)
3. **Board view** (cards, drag feedback, empty states, quick-add errors)
4. **List view** (row polish, inline status/priority, filter bar)
5. **Docs view** (tree, editor, breadcrumbs, stale file, indentation cap)
6. **Micro-interactions** (hover consistency, transitions, scrollbars, tooltips, unsaved protection)
7. **Edge cases** (unindexed UX, tags overflow, error states, backend unreachable)
