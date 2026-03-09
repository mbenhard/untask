# Bits UI Migration Plan

Migrate hand-rolled interactive UI patterns to Bits UI headless components.
Goal: better accessibility, less boilerplate, consistent behavior — zero visual change.

---

## Principles

- **Behavior only.** Bits UI provides keyboard nav, ARIA, focus trapping, portals. We provide all styling via Tailwind.
- **No visual regressions.** Every migrated component must look identical to current. The design language is non-negotiable.
- **Incremental.** Each phase is independently shippable. No big-bang rewrite.
- **Test after each component.** Run `pnpm tauri dev`, verify keyboard nav, screen reader, visual match.

---

## Phase 1 — Core Primitives (High Priority)

These replace the most hand-rolled complexity and fix real UX issues.

### 1.1 Select (replace native `<select>`)

| Detail | Value |
|--------|-------|
| Bits component | `Select.Root`, `Select.Trigger`, `Select.Content`, `Select.Item` |
| Files to change | `TaskModal.svelte`, `TaskDetail.svelte`, `TaskList.svelte`, `DocsViewer.svelte` |
| Instances | 6 native `<select>` elements (see breakdown below) |
| Why first | Native `<select>` popups can't be styled. This is the root cause of the visual consistency issue in task metadata. A Bits Select trigger is a regular `<button>` — same flex/border/font as priority and tag chips. |

Instances breakdown:

| File | Purpose | Wrapper |
|------|---------|---------|
| `TaskModal.svelte` | Status metadata chip | `MetaSelect` |
| `TaskDetail.svelte` | Status metadata chip | `MetaSelect` |
| `TaskList.svelte` (toolbar) | Filter by status | Direct Bits Select (not a chip) |
| `TaskList.svelte` (row) | Inline status for unindexed tasks (disabled) | `MetaSelect` (disabled) |
| `DocsViewer.svelte` | Move destination picker | Direct Bits Select |
| `DocsViewer.svelte` | New doc type selector | Direct Bits Select |

Note: `MetaSelect` wrapper is only for 20px metadata chip selects. Filter/utility selects use Bits Select directly with their own styling.

Steps:
1. Create `$lib/components/ui/MetaSelect.svelte` — a thin wrapper around Bits Select styled to match the 20px metadata chip pattern (h-5, rounded-[4px], border-border/60, font-mono text-[10px]).
2. Replace the status `<select>` in `TaskModal.svelte` first (most complex — has disabled state, dynamic options).
3. Verify keyboard nav: arrow keys to navigate, Enter to select, Escape to close.
4. Migrate remaining 5 instances (use `MetaSelect` for chip selects, direct Bits Select for utility selects).
5. Delete the `.task-meta-select` CSS class (custom chevron SVG hack no longer needed).

### 1.2 Dialog (replace hand-rolled modal)

| Detail | Value |
|--------|-------|
| Bits component | `Dialog.Root`, `Dialog.Trigger`, `Dialog.Portal`, `Dialog.Overlay`, `Dialog.Content` |
| Files to change | `TaskModal.svelte`, parent components that open it |
| Lines deleted | ~35 lines: entire `handleKeydown` function (291-323) including Escape handler + focus trap, plus `handleBackdropClick` (325-329) |
| Why | The modal's focus trap, escape handling, backdrop click, and portal behavior are all built into Bits Dialog. Current implementation has edge cases (tab cycling with querySelectorAll). |

Steps:
1. Wrap TaskModal content in `Dialog.Root` + `Dialog.Portal` + `Dialog.Overlay` + `Dialog.Content`.
2. Move open/close animation classes to Bits' `forceMount` + CSS transitions (or Svelte transitions).
3. Remove manual `handleKeydown` focus trap logic.
4. Remove manual `handleBackdropClick`.
5. Keep `onClosingStart` / close animation timing — use Bits `onOpenChange` callback.
6. Verify: Escape closes, backdrop click closes, Tab cycles within modal, focus returns to trigger on close.

### 1.3 Alert Dialog (replace delete confirmation)

| Detail | Value |
|--------|-------|
| Bits component | `AlertDialog.Root`, `AlertDialog.Action`, `AlertDialog.Cancel` |
| Files to change | `TaskModal.svelte` (delete confirm), `ProjectPicker.svelte` (init confirm) |
| Why | Current inline yes/no toggle doesn't lock focus. A proper AlertDialog prevents accidental interaction with background. |

Steps:
1. Replace the `showDeleteConfirm` toggle in TaskModal footer with an AlertDialog.
2. Style to match: compact, monochrome, same border/radius/font tokens.
3. Replace ProjectPicker init confirmation similarly.

### 1.4 Popover (replace hand-rolled status dropdown)

| Detail | Value |
|--------|-------|
| Bits component | `Popover.Root`, `Popover.Trigger`, `Popover.Content` |
| Files to change | `TaskList.svelte` (inline status change popover) |
| Lines deleted | ~60 lines total: popover template (382-411), `openStatusPopover` (164-186), `handlePopoverKeydown` (188-211), plus state vars `statusPopoverTaskId`/`popoverIndex` and `changeStatusTo` helper |
| Why | Current implementation has manual arrow key handling and absolute positioning. Bits Popover auto-positions with Floating UI and handles keyboard nav. |

Steps:
1. Replace the status popover div (lines 382-411) with Bits Popover.
2. Use a listbox pattern inside the popover content for status options.
3. Remove all supporting code: `openStatusPopover`, `handlePopoverKeydown`, `changeStatusTo`, and the state variables.
4. Verify: opens on click, arrow keys navigate options, Enter selects, Escape closes, auto-positioned.

### 1.5 Dialog (replace ProjectPicker dropdown mode)

| Detail | Value |
|--------|-------|
| Bits component | `Dialog` for shell, filtered listbox for project list |
| Files to change | `ProjectPicker.svelte` |
| Lines deleted | ~35 lines of manual keyboard nav (`handleKeydown` at 136-168), manual backdrop (`handleBackdropClick` at 130-134) |
| Scope | **Dropdown mode only.** ProjectPicker has two modes: `fullpage` (initial setup, "Choose folder" button, init prompt) and `dropdown` (command-palette-style project switcher). Only the dropdown mode benefits from Dialog wrapping. The fullpage mode stays as-is. |
| Why | The dropdown mode is a modal with search + filtered list + arrow key navigation — all hand-rolled. Dialog provides focus trapping, Escape handling, and backdrop for free. |

Note: The project list is not a true combobox (it has an "Open folder..." action button at the bottom, not just selectable items). Use Dialog + a simple filtered listbox pattern rather than Bits Combobox.

Steps:
1. Wrap the dropdown-mode ProjectPicker in Dialog.Root + Dialog.Portal + Dialog.Overlay + Dialog.Content.
2. Keep the existing filter input and list rendering but remove manual `handleKeydown` and `handleBackdropClick`.
3. Keep project creation flow (init button + confirmation) as-is inside the dialog.
4. Leave fullpage mode unchanged.

---

## Phase 2 — Common Patterns (Medium Priority)

These improve consistency and reduce repeated CSS patterns.

### 2.1 Toggle Group (replace sidebar navigation) — optional

| Detail | Value |
|--------|-------|
| Bits component | `ToggleGroup.Root`, `ToggleGroup.Item` |
| Files to change | `SidebarNav.svelte` |
| Why | Sidebar buttons act as a single-select group but lack ARIA semantics. |
| Caveat | SidebarNav is a navigation component, not a form control. Semantically, `role="navigation"` with `aria-current` on the active button may be more correct than a toggle group (which implies value selection). Evaluate which fits better during implementation. |

Steps:
1. Option A: Wrap nav buttons in ToggleGroup.Root with `type="single"`, style via `data-state`.
2. Option B: Keep plain buttons, add `role="navigation"` to the aside and `aria-current="page"` to the active button.
3. Choose whichever provides better screen reader UX for a 4-button nav.

### 2.2 Collapsible (replace folder expand/collapse)

| Detail | Value |
|--------|-------|
| Bits component | `Collapsible.Root`, `Collapsible.Trigger`, `Collapsible.Content` |
| Files to change | `DocsViewer.svelte` |
| Why | Manual Set-based toggling + rotation CSS → built-in open/close with animation support and ARIA expanded. |

Steps:
1. Wrap each folder node in Collapsible.Root, controlled by `expandedPaths.has(path)`.
2. Replace manual chevron rotation with Bits' `data-state="open"` CSS.
3. Keep the tree keyboard navigation as-is (Arrow Up/Down/Left/Right) — Bits doesn't have a full tree component.

### 2.3 Scroll Area (replace custom scrollbar CSS)

| Detail | Value |
|--------|-------|
| Bits component | `ScrollArea.Root`, `ScrollArea.Viewport`, `ScrollArea.Scrollbar`, `ScrollArea.Thumb` |
| Files to change | `TaskList.svelte`, `Kanban.svelte`, `DocsViewer.svelte` |
| Why | Three separate CSS blocks for custom scrollbars → one consistent component. |

Steps:
1. Create a thin wrapper or use Bits ScrollArea directly.
2. Style scrollbar thumb to match: thin, muted, rounded.
3. Replace the CSS `::-webkit-scrollbar` blocks.

### 2.4 Tooltip (replace title attributes)

| Detail | Value |
|--------|-------|
| Bits component | `Tooltip.Root`, `Tooltip.Trigger`, `Tooltip.Content` |
| Files to change | Throughout — TaskList, TaskModal, Kanban, DocsViewer |
| Why | Native title attributes are unstyled, delayed, and inconsistent. Bits Tooltip gives styled, accessible tooltips matching the design language. |

Steps:
1. Create `$lib/components/ui/MetaTooltip.svelte` — a thin wrapper with design language styling (dark bg, 10px mono text, rounded-[4px], subtle shadow).
2. Replace `title="..."` attributes incrementally, starting with TaskModal metadata chips.
3. Use `Tooltip.Provider` at the app root for consistent delay grouping.

### 2.5 Progress (replace manual progress bars)

| Detail | Value |
|--------|-------|
| Bits component | `Progress.Root`, `Progress.Indicator` |
| Files to change | `Kanban.svelte`, `TaskModal.svelte`, `TaskDetail.svelte` |
| Why | Semantic progress with ARIA. Minor improvement but proper. |

Note: TaskDetail uses a different visual style (`h-1 w-24` with text label) compared to TaskModal and Kanban (`h-[2px]` full-width). Preserve each variant's styling during migration.

Steps:
1. Replace manual `<div style="width: {pct}%">` with Progress component.
2. Style TaskModal/Kanban to match: h-[2px], rounded-full, bg-foreground/60.
3. Style TaskDetail to match: h-1 w-24, rounded-full, bg-foreground/60, with text label alongside.

### 2.6 Dropdown Menu (doc action buttons) — optional, evaluate UX first

| Detail | Value |
|--------|-------|
| Bits component | `DropdownMenu.Root`, `DropdownMenu.Trigger`, `DropdownMenu.Content`, `DropdownMenu.Item` |
| Files to change | `DocsViewer.svelte` |
| Trade-off | Current individually-visible buttons (New doc, Rename, Move, Delete) are already compact and provide instant access. Collapsing into a "..." menu adds an extra click and reduces discoverability. Only do this if the button row becomes too crowded (e.g., more actions are added). |

Steps (if proceeding):
1. Replace the action button row with a single trigger button (e.g., "..." icon).
2. Render actions as DropdownMenu items with keyboard shortcuts shown.
3. Style to match: monochrome, 10px mono text, border-border/60, rounded-[6px].

---

## Phase 3 — Future Enhancements (Low Priority)

These are not urgent but worth adopting when building new features.

| Component | Use case | When |
|-----------|----------|------|
| **Context Menu** | Right-click on task rows, doc items | When adding context menu support |
| **Combobox** | Tag autocomplete, assignee picker | When adding tag suggestions |
| **Separator** | Replace `border-b border-border/60` dividers | Opportunistic — when touching a file |
| **Tabs** | If adding tabbed views within a panel | When needed |
| **Switch** | Toggle settings (e.g., theme, notifications) | When adding settings UI |

---

## Shared Wrapper Components to Create

To avoid repeating Tailwind classes across every Bits UI usage, create thin wrappers in `$lib/components/ui/`:

| Wrapper | Wraps | Purpose |
|---------|-------|---------|
| `MetaSelect.svelte` | Bits Select | 20px metadata chip select with design language styling |
| `MetaTooltip.svelte` | Bits Tooltip | Compact styled tooltip |
| `ConfirmDialog.svelte` | Bits AlertDialog | Reusable delete/destructive confirmation |
| `ScrollPanel.svelte` | Bits ScrollArea | Consistent thin scrollbar styling (replaces 3 duplicate CSS blocks) |

Keep wrappers minimal — just styling + common props. Don't abstract away Bits UI's API.

---

## Migration Checklist Per Component

For each component migration:

- [ ] Read the current implementation fully
- [ ] Read Bits UI docs for the target component
- [ ] Implement the swap
- [ ] Verify visual match (no regressions)
- [ ] Verify keyboard navigation (Tab, Escape, Arrow keys, Enter)
- [ ] Verify screen reader output (ARIA roles, labels)
- [ ] Test disabled states where applicable
- [ ] Test with light and dark themes
- [ ] Remove dead code (old handlers, CSS)

---

## Estimated Scope

| Phase | Components | Files touched | Rough effort |
|-------|-----------|---------------|-------------|
| Phase 1 | 5 components | 6 files | Largest — core dialog/select patterns |
| Phase 2 | 6 components | 7 files | Medium — incremental improvements |
| Phase 3 | 5 components | As needed | Small — future work |

Phase 1 delivers the most value: eliminates the most hand-rolled code, fixes the select styling issue, and adds proper accessibility to the modal and confirmation flows.
