# Task Expanded Layout Redesign

**Date:** 2026-02-16
**Status:** Approved
**Goal:** Declutter the expanded task edit area while keeping all functionality. Prioritize body editor as hero, metadata as quiet supporting context, subtasks as minimal section.

## Design Principles

- Body editor is the hero — maximum breathing room
- Metadata is present but not loud — dot-separated text, no chip borders
- Subtasks are minimal — no empty state box, hover-only action icons
- Two borders total in the expanded area. Zero dashed lines.
- "Today" chip removed (bookmark icon on title row already handles this)
- "Move to project" relocated to `···` overflow menu on title row

## Layout Structure

Three zones, top to bottom:

### Zone 1 — Body Editor (hero)
- Sits below task title row with thin `border-t border-border/30`
- Generous padding: `px-3 py-3`
- Placeholder: "Enter text or type '/' for commands"
- No border between body and metadata — spacing only

### Zone 2 — Metadata Line
- Single line of dot-separated text
- Format: `● Med · Feb 19 · Fresh & Co · Active`
- Padding: `px-3 py-2`
- Each segment is a clickable inline trigger for its editor (dropdown, picker, input)
- Empty fields render as dim hints: `+ due date`, `+ client`
- Overflow: line does not wrap. If it exceeds container width, trailing segments truncate with gradient fade on right edge. Scroll on hover/focus to reveal.

### Zone 3 — Subtasks
- Header: `Subtasks` label left + `Add subtask...` ghost input right, same line
- Empty state: nothing renders below header — no box, no message
- Subtask rows: `[checkbox] [priority dot] [title]`, action icons on hover only
- Padding: `px-3 pt-2 pb-1`

## Visual Specifications

### Metadata Line Typography
- `text-[11px] font-mono text-muted-foreground`
- Separator dot `·` uses `text-border` (dimmer than muted)
- Hover: segment brightens to `text-foreground`, `transition-colors duration-150`
- Active/editing: `text-foreground` immediately
- Focus (keyboard): `bg-accent/30 rounded-sm px-1 -mx-1` — subtle highlight without border

### Priority Indicator
- 6px colored dot inline before priority text
- Colors: emerald-500 (low), amber-500 (med), rose-500 (high), hidden (none)
- When priority is "none": dot hidden, segment reads `+ priority`

### Hit Targets
- Each segment wrapper has `py-1 -my-1` for comfortable click/touch target (extends beyond visible text)
- Priority segment: dot + text together form the clickable area, not just the 6px dot

### Spacing (8px grid)
- Editor: `px-3 py-3` (12px × 12px)
- Metadata: `px-3 py-2` (12px × 8px)
- Segment gaps: `gap-1.5` (6px) between segment+dot pairs
- Subtask zone: `px-3 pt-2 pb-1`

### Borders
- One `border-t border-border/30` between title row and editor
- One `border-t border-border/20` between metadata and subtasks
- Total: 2 borders. Zero dashed lines.

### Subtask Rows
- `min-h-8` (down from min-h-10)
- Action icons: `opacity-0 group-hover:opacity-100`
- No right-side badges in collapsed state
- Expanded subtask metadata: only priority + due date as dot-separated text

## Interaction Patterns

### Clicking Metadata Segments
- "Med" → priority dropdown anchored below segment
- "Feb 19" → date picker popover below
- "Fresh & Co" → inline text input replaces segment, Enter/blur to save. Input is `min-w-[60px] max-w-[140px]`, auto-grows to content. Adjacent dots remain visible.
- "Active" → status dropdown below

### Empty Field States
- Render as `+ due date`, `+ client`, `+ priority`
- Use `text-muted-foreground/50` — dimmer than set values
- Hover brightens, click opens editor
- Still participate in dot line: `● Med · + due date · + client · Active`

### Keyboard
- Tab through segments left-to-right
- Enter/Space opens editor for focused segment
- Escape closes editor, returns focus to segment

### Accessibility
- Metadata line: `role="toolbar"` with `aria-label="Task metadata"`
- Each segment: `role="button"` with `tabindex="0"`
- Separator dots: `aria-hidden="true"` (decorative)
- Open editors trap focus; Escape returns to segment

## Title Row Changes

### Current
`[checkbox] [dot] [title] ... [client badge] [date badge] [edit] [bookmark] [drag]`

### New
`[checkbox] [dot] [title] ... [client badge] [date badge] [edit] [bookmark] [···] [drag]`

- `···` overflow menu contains:
  - "Move to project →" (submenu with project list)
  - Future home for rare actions

## Edge Cases

- **Long client names:** truncate at `max-w-[140px]` with ellipsis, tooltip on hover
- **Many subtasks:** no max-height, parent view handles scrolling
- **Completed tasks:** metadata line gets `opacity-60`, segments still clickable
- **Nested subtasks:** not supported (one level deep only)

## Summary of Changes

| Current | New |
|---------|-----|
| Bordered chips in flex-wrap row | Dot-separated text line, no borders |
| Dashed borders between sections | 2 thin solid borders total |
| "Today" chip in metadata | Removed (bookmark handles it) |
| "Move to project" in metadata row | Moved to `···` overflow menu |
| "No subtasks yet." empty box | Nothing — just "Add subtask..." input |
| Subtask action icons always visible | Hover-only visibility |
| `h-7` chip height | Inline text at `text-[11px]` |

## Files to Modify

- `flusk/src/renderer/components/tasks/TaskBody.tsx` — main expanded area restructure
- `flusk/src/renderer/components/tasks/TaskItem.tsx` — add `···` overflow menu, remove Today from metadata
- `flusk/src/renderer/components/tasks/InlineTaskInput.tsx` — subtask add input styling
- `flusk/src/renderer/styles/index.css` — remove dashed border overrides, adjust BlockNote editor spacing
