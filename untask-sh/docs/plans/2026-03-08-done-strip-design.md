# Done Strip Design

## Problem

The Done column creates visual clutter on the kanban board. Completed tasks are rarely revisited but currently take up a full column's worth of space. We need a way to drag tasks to "done" without displaying them by default.

## Design

### Collapsed state (default): drop strip

The Done column is replaced by a **56px vertical strip** sticky to the right edge of the kanban viewport. It serves as a drag-and-drop target and an entry point to view completed tasks.

- **Width:** 56px resting, expands to ~120px when a drag is active (strip "reaches out" to catch the card)
- **Position:** `position: sticky; right: 0` — always visible regardless of horizontal scroll
- **Label:** "Done" — `font-mono text-[10px] uppercase tracking-widest text-muted-foreground/40`, horizontal (not rotated)
- **Counter:** task count below label — `font-mono text-[10px] text-muted-foreground/30`
- **Border:** 1px left border at `border-border/40`, no background fill
- **Visibility:** hidden when 0 done tasks and no drag is active. Appears during any drag regardless of count.
- **Click target:** clicking the label/counter area toggles the expanded column. The rest of the strip surface is drop-only.

### Drag-and-drop target

The strip acts as a drop zone for completing tasks:

- **Drag proximity:** strip widens from 56px to ~120px when any drag is active (200ms transition), making it easier to hit
- **Drag hover:** border brightens to `border-border`, faint `bg-muted/10` fill appears
- **On drop:** strip border flashes bright for 200ms, counter increments
- **Task behavior:** task disappears from source column, status updated to done column's ID

### Expanded state: click to toggle

Clicking the label/counter area expands the strip into a full column:

- **Width:** standard column width (240–300px), 200ms width transition
- **Scroll behavior:** board scrolls right to accommodate the expanded column rather than shifting existing columns left
- **Header:** "Done" with a collapse chevron
- **Cards:** standard card layout with muted presentation — `text-muted-foreground/60` on titles, `border-border/30` on card borders. Card structure stays at full opacity for readability.
- **Sort:** by `completed` timestamp, most recent first
- **Scroll:** independent overflow-y like other columns
- **Drag out:** cards can be dragged back to any active column to un-complete
- **Persistence:** expanded/collapsed state saved to local storage, defaults to collapsed

Clicking the collapse chevron (or the header) returns to the strip.

### What doesn't change

- Task data model unchanged — uses existing `completed` timestamp and `done: true` column flag
- No new backend endpoints or status fields
- TaskModal still opens on card click (in expanded state)
- Quick-add is not available on the done column (no reason to create tasks as done)

## Scope

- Frontend only: changes to `Kanban.svelte`
- No new components needed (strip is inline in the kanban layout)
- No keyboard shortcuts in v1 (add later)
