# Search Revamp Design

**Date**: 2026-02-16
**Status**: Approved

## Problem

1. FTS5 virtual table is corrupted (`SqliteError: database disk image is malformed`)
2. Search UI is a full-screen overlay — heavy, noisy, bad UX
3. Staggered animations, section grouping, footer hints add unnecessary chrome

## Design

### UX Pattern: Command Palette

Spotlight/Raycast-style floating panel. Keyboard-first.

- **Trigger**: `Cmd+F` (toggle)
- **Position**: Centered horizontally, ~20% from top
- **Size**: Fixed `max-w-md` (448px), max ~7 visible results
- **Dismiss**: Escape key, click outside, or `Cmd+F` again

### Search Input

- Left-aligned search icon
- Placeholder: `Search tasks...  ⌘F`
- No border, transparent background within the panel
- Auto-focus on open

### Results List

Flat list, no section headers, no footer.

Each result row:
```
● Task title here                   P1
  Client name · matched snippet...
```

- **Line 1**: Priority-colored dot + title (truncated). Priority badge (high/medium only) on right.
- **Line 2**: Client (if exists) + FTS snippet with `<mark>` highlights. `text-xs text-muted-foreground`.
- **Done tasks**: `line-through` title, `opacity-60` on entire row.
- **Selected**: `bg-accent` — instant, no animation.
- **Row sizing**: `py-1.5 px-3` — compact.
- **No staggered entry animations**. Results appear immediately.

### Keyboard Navigation

- `↑` / `↓` — move selection
- `Enter` — navigate to selected task
- `Escape` — close palette

### Empty States

- No query: placeholder text only (no separate message)
- No results: "No results" inline, same muted style
- Error: red inline message, auto-retry rebuild

### Backend: FTS Corruption Fix

**Strategy**: Drop and rebuild FTS on every app start.

`initSearchFts()` changes:
1. `DROP TABLE IF EXISTS tasks_fts`
2. Recreate FTS5 virtual table
3. Recreate sync triggers
4. Rebuild index from tasks table

`searchTasks()` changes:
- Wrap in try/catch
- On error: drop + rebuild + retry once
- If retry fails: return error to renderer

### Store Changes

Flatten response — remove `active`/`done` grouping:
```typescript
// Before
{ active: SearchResultItem[], done: SearchResultItem[], total: number }

// After
{ results: SearchResultItem[], total: number }
```

Done tasks are visually differentiated by `line-through` + dimmed opacity, not by section.

### Scope

- Search scope: tasks only (title, body, client)
- No new IPC channels
- No new DB tables
- Same `search:query` channel

## Files to Change

| File | Change |
|------|--------|
| `src/main/services/searchService.ts` | Drop+rebuild FTS, flatten response, try/catch retry |
| `src/renderer/components/search/SearchModal.tsx` | Command palette UI, remove animations/sections/footer |
| `src/renderer/stores/searchStore.ts` | Flatten results, remove active/done split |
| `src/types/ipc.ts` | Update `SearchQueryResponse` type |

## Non-Goals

- Searching journals, memory, or chat
- Fuzzy matching (FTS5 prefix matching is sufficient)
- Recent searches / search history
- Filter chips or advanced query syntax
