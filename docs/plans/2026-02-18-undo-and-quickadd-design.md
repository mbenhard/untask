# Undo System & Quick Add Fixes

Date: 2026-02-18

## Overview

Two features in one pass:

1. **Global undo** — toast + Cmd+Z for all user task mutations (delete, complete, cancel, edit, move)
2. **Quick Add fixes** — broken shortcut, missing chat overlay open, silent registration failures

## Undo System

### Architecture

The infrastructure already exists: `task_events` logs full before/after JSON snapshots for every mutation, and `undoTaskEvent(eventId)` can restore any previous state including resurrecting deleted tasks. Currently only wired up for AI actions via Cmd+Z in chat overlay.

**Undo stack (main process):**
- In-memory array of recent user-sourced `taskEvent` IDs, capped at ~20
- Every `logTaskEvent()` call with `source: 'user'` pushes the event ID
- New IPC channel `undo:last-user-action` pops the last ID and calls `undoTaskEvent()`
- Stack clears on app restart (not persisted)

**Cmd+Z (renderer):**
- Extend existing keyboard shortcut to work globally, not just in chat overlay
- Skip when focus is in a text input (title, description, chat textarea) — native undo takes precedence
- Chat overlay open + Cmd+Z still calls existing AI undo path (no change)

### Toast Component

**Placement:** Fixed bottom-center, `bottom-3` (12px margin).

**Styling (matches existing design system):**
- `bg-card/90 backdrop-blur-sm` — same as chat peek button and chat panel
- `border border-border/60` — standard semi-transparent border
- `rounded-lg` — 8px, matches tab buttons and footer icon buttons
- `shadow-md` — popover-level shadow
- `px-2.5 py-1.5` — tight padding matching UpdateBanner
- `text-[11px] text-muted-foreground` — standard hint/metadata tier
- "Undo" link: `text-[11px] font-medium text-foreground`
- Separator: `·` in `text-border` — same as MetadataLine dots

**Behavior:**
- Auto-dismiss after 3 seconds
- Fade in/out via opacity, 200ms
- New action instantly replaces current toast (only one visible at a time)
- Clicking "Undo" triggers the undo, toast swaps to "Undone" for 1.5s, then dismisses
- No close button, no slide animation

**Action labels:**
- `Task deleted` / `Task completed` / `Task cancelled` / `Task reopened`
- `Task updated` (for field edits)
- `Task moved` (for reparenting/project change)

### Undo stack behavior

- Replace: new action replaces current toast visually
- Queue: Cmd+Z cycles through last ~20 actions even after toast dismisses
- One toast is the simple surface, keyboard is the deep surface

## Quick Add Fixes

### Fix 1 — Default shortcut conflict

`CommandOrControl+Shift+Q` is macOS system "Log Out" shortcut (hotkey #81, enabled). Electron's `globalShortcut.register` returns `false` silently.

**Change:** Default from `CommandOrControl+Shift+Q` to `CommandOrControl+Shift+A`. Users with stored custom shortcuts are unaffected.

### Fix 2 — Open chat overlay

`useQuickAddListener` only prefills the textarea and focuses it. It never calls `openChatOverlay()`, so if the chat panel is closed, nothing visible happens.

**Change:** Call `openChatOverlay()` before prefill/focus in `useQuickAddListener`.

### Fix 3 — Surface registration failures

When `registerShortcut` returns `false`, store the failure state. Expose via IPC so Settings shortcuts UI shows a `text-[11px] text-destructive` warning under the shortcut field.

## Not in scope

- No redo (Cmd+Shift+Z)
- No persisted undo history across restarts
- No toast for non-task actions (settings changes, etc.)
- No stacking toasts
- No slide animation

## Files touched

| Area | Files |
|---|---|
| New component | `src/renderer/components/ui/Toast.tsx` |
| Undo stack | `src/main/services/taskService.ts` |
| New IPC | `src/main/ipc.ts`, `src/preload/index.ts`, `src/types/ipc.ts` |
| Keyboard shortcut | `src/renderer/hooks/useKeyboardShortcuts.ts` |
| Toast integration | `src/renderer/components/layout/AppShell.tsx` |
| Task store | `src/renderer/stores/taskStore.ts` |
| Quick Add default | `src/main/shortcuts.ts` |
| Quick Add overlay | `src/renderer/hooks/useQuickAddListener.ts` |
| Shortcut failure UI | `src/main/shortcuts.ts`, `src/renderer/components/settings/SettingsShortcuts.tsx` |
