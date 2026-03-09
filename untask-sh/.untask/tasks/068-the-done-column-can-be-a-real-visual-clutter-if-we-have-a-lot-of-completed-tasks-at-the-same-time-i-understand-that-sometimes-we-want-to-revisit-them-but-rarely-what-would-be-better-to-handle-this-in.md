---
id: 68
title: the “Done” column can be a real visual clutter if we have a lot of completed tasks. at the same time I understand that sometimes we want to revisit them but rarely. what would be better to handle this in UI while keeping amazing UX?
status: done
created: 2026-03-08
updated: 2026-03-08T21:09:12.667648Z
completed: 2026-03-08T21:09:12.667647Z
position: 1.0
---
## Current state

* The done column renders identically to all other columns -- full-height card list, same card styling.

* Tasks in the done column already have a dimmed column header (`text-muted-foreground/50`), but the cards themselves are not visually differentiated.

* Every comdpleted task has a `completed` timestamp, which can be used for time-based filtering/grouping.

* The column uses internal scrolling via `overflow-y-auto`, so it already scrolls independently, but with many tasks it becomes a long scroll of cards the user rarely needs.

***

## Approach A: Collapsible done column with recent-only default

**How it works:**

* The done column shows only the N most recently completed tasks by default (e.g. last 5, or last 7 days).

* A small counter at the bottom reads something like “18 older” in mono text.

* Clicking the counter expands the full list inline (with a subtle height transition).

* A second click or a “Collapse” affordance at the bottom collapses it back.

* The column header gets a small chevron or toggle indicator showing collapsed/expanded state.

**Visual treatment (design language compliant):**

* Collapsed indicator: dashed border button at the bottom of the visible cards, `font-mono text-[10px] text-muted-foreground/40`, matching the existing “+ Add task” style.

* Expanded: cards render normally but the older cards get progressively more muted (e.g. `opacity-60` on cards older than 7 days, `opacity-40` on cards older than 30 days).

* Toggle animation: `200ms` height expand, mechanical feel. No bounce.

**Pros:**

* Zero extra UI chrome -- the column still looks like a column.

* Users see recent completions at a glance (satisfying “I just finished something” feeling).

* Full history is one click away, not hidden behind navigation.

* No new views or routes needed. Pure frontend state in the Kanban component.

* `completed` timestamp already exists on TaskDto, so no backend changes needed.

**Cons:**

* Choosing the right default count/timeframe requires some judgment (configurable later).

* If the user completes many tasks in a short burst, the “recent” set can still feel cluttered.

***

## Approach B: Compressed done column with condensed card rows

**How it works:**

* Done column cards render in a condensed format: single-line rows instead of full cards.

* Each row shows only: title (truncated), priority dot, and completion date.

* Tags, body indicator, subtask progress, and owner icon are hidden in the condensed view.

* Clicking a condensed row still opens the full TaskModal.

* The column takes up less horizontal space (narrower `min-w` / `max-w`).

**Visual treatment:**

* Condensed rows: `h-[28px]`, `text-[11px]`, no border on individual rows, separated by `divide-y divide-border/30`.

* The column itself gets a slightly narrower width constraint (e.g. `min-w-[180px] max-w-[220px]` vs the normal `min-w-[240px] max-w-[300px]`).

* Column background gets a very subtle difference: `bg-background/60` instead of `bg-background/80`.

* Priority dot stays but moves inline-left of the title text.

* Completed date shown as relative time in `font-mono text-[9px] text-muted-foreground/40`.

**Pros:**

* All done tasks remain visible without scrolling through large cards.

* The visual density difference between done and active columns signals “these are resolved” without any interaction.

* Fits the design language perfectly -- dense, compact, information-first.

* Still opens the same TaskModal on click, so no loss of functionality.

**Cons:**

* Drag-and-drop from done back to other columns requires mapping from condensed row to full card, slightly more complex.

* With very large done lists (50+ tasks), even condensed rows can get long. Would benefit from combining with Approach A's collapse mechanism.

***

## Approach C: Auto-archive with a separate “Archive” view

**How it works:**

* Tasks that have been in the done column for more than N days (e.g. 14 days) are automatically moved to an “archived” state.

* Archived tasks disappear from the kanban board entirely.

* A small “Archive” link or tab appears in the app chrome (e.g. next to the existing board/list tabs) to view archived tasks in a flat list.

* Users can un-archive a task, which moves it back to done (or to any column).

**Visual treatment:**

* Archive tab: matches existing tab pill styling, `text-[11px]`, only appears when archived tasks exist.

* Archive view: simple bordered list view with search/filter, same design language as the existing list view.

* Auto-archive happens silently -- no notifications, no prompts. Tasks just disappear from the board after the threshold.

**Pros:**

* The done column stays permanently clean without any user action.

* Separation between “recently done” (still on board) and “historical” (archived) is clear.

* Archived tasks are still searchable and accessible -- they are not deleted.

**Cons:**

* Requires a new status or flag in the data model (`archived: bool` or a new column type).

* Needs backend changes: new field in Task struct, new API endpoints, timer/check logic for auto-archiving.

* More complex to implement than the other two approaches.

* The concept of “archiving” might feel heavy for a tool that values simplicity.

* Users may be confused about where their tasks went if they don't notice the auto-archive behavior.

***

## Recommendation

**Approach A (collapsible with recent-only default)** is the best fit for untask's design philosophy and current architecture.

Reasons:

1. **Minimal implementation surface.** It requires only frontend changes in `Kanban.svelte` -- slicing the done column's task array and adding a toggle button. No backend or data model changes.
2. **Respects the design language.** The collapse/expand affordance reuses existing visual patterns (dashed border button, mono text, mechanical transition). No new UI concepts.
3. **Progressive disclosure.** Users see what matters (recent completions) and can drill deeper on demand. This aligns with untask's “dense but calm” philosophy.
4. **The** **`completed`** **timestamp already exists.** Sorting by recency and showing “N older” is trivial with the existing data.

A natural follow-up would be to combine Approach A with elements of Approach B: once the column is expanded, show the older cards in the condensed row format from Approach B. This gives the best of both -- recent tasks as full cards, older tasks as dense rows, and a collapse toggle to hide the whole tail.

## Agent Summary
Reviewed the Kanban.svelte component, api.ts types, config.rs column definitions, store.rs task operations, and the design language spec. The done column currently renders identically to other columns with no mechanism to reduce visual weight.

Proposed three approaches: (A) collapsible done column showing only recent tasks with an expand toggle, (B) condensed single-line card rows for the done column, and (C) auto-archive with a separate view. Recommended Approach A as the primary solution because it requires only frontend changes, reuses existing design patterns, and leverages the existing `completed` timestamp. Suggested combining A+B as a follow-up enhancement for the expanded state.
