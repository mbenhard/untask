# Keyboard Shortcuts Redesign

## Problem

The current shortcut system has accuracy issues in its Settings hints, an inconsistent mix of bare keys and modifier shortcuts, no support for international keyboard layouts, and a global shortcut "customization" UI that is display-only with no way to actually edit shortcuts.

## Decisions

### 1. Move bare navigation keys behind Cmd

All view-switching shortcuts move from bare keys to `Cmd+` modifier using `event.code` (physical key position) instead of `event.key` (character output) to support international keyboards (Slovak, Czech, French AZERTY, etc.).

| Before | After | Action |
|--------|-------|--------|
| `1` | `Cmd+1` (`Digit1`) | Today view |
| `2` | `Cmd+2` (`Digit2`) | Tasks view |
| `3` | `Cmd+3` (`Digit3`) | Inbox view |
| `4` (was: chat toggle) | `Cmd+4` (`Digit4`) | Notes view |
| `,` | `Cmd+,` | Settings (macOS standard) |

Note: bare `4` currently toggles the chat overlay, NOT Notes view. This change repurposes the `4` position to Notes (the 4th tab). Chat toggle is covered by `Cmd+K` which remains unchanged — no replacement for bare `4` is needed.

### 2. Resolve Cmd+N conflict

| Shortcut | Before | After |
|----------|--------|-------|
| `Cmd+N` | Jump to Notes view | Create new task |
| `Cmd+Shift+N` | Create new note | Create new note (unchanged) |
| `N` (bare, task views) | Open new-task input | Removed (replaced by Cmd+N) |

`Cmd+N` = "create new primary thing" is the universal convention for a task manager.

### 3. Keep task list bare keys as-is

These are scoped to a focused task list context and don't conflict with modifiers:

- `Arrow Up/Down` — move focus
- `Enter` — expand/collapse
- `Space` — toggle complete
- `T` — toggle Today flag
- `P` — cycle priority
- `S` — cycle status
- `E` — edit title
- `Escape` — collapse, then blur

No changes needed. These only fire when: task list container is focused, no text input active, no drag active, no inline edit active.

### 4. Standardize notes list navigation

Drop `J`/`K` for notes. Add arrow key navigation matching the task list pattern:

- `Arrow Up/Down` — move selection in notes list
- `Enter` — open selected note

This requires `NotesList.tsx` (`src/renderer/components/notes/NotesList.tsx`) to gain a focused container (`tabIndex={0}`, `ref`, `onKeyDown`) mirroring `useTaskListKeyboard`. A new `useNotesListKeyboard` hook with the same structure. The store already has `selectRelativeActive(delta)` and `openSelectedNote()` — the hook just wires them to arrow keys and Enter. Must work in both standalone list and split-view contexts (rendered by `NotesView.tsx`).

### 5. Fix visual highlight

Both task list and notes list have a `bg-accent/20` highlight on the focused/selected item, but it may be too subtle. Evaluate and increase contrast if needed (e.g., `bg-accent/40` or `bg-muted`). The highlight is driven by `focusedIndex` in `TaskItem.tsx` and `selectedListNoteId` in `NotesList.tsx`.

### 6. Fix Settings hint inaccuracies

**Escape layer order** — update the hint to match actual code priority:

```
search → notes editor back-to-list → clear chat input → leave settings → close chat overlay
```

Remove "hide window" from the hint (not implemented in renderer).

**Remove stale notes entries** — drop J/K entries, add arrow key entries for notes list.

**Update all hints** to reflect new modifier shortcuts (Cmd+1 through Cmd+4, Cmd+, for settings, Cmd+N for new task).

### 7. Global shortcut recorder

Replace the display-only `<code>` blocks for global shortcuts (toggle window, quick add) with an interactive recorder:

**UI behavior:**
1. Each global shortcut row shows current binding + a "Record" button
2. Clicking "Record" enters recording mode (visual indicator: pulsing border or "Press a shortcut..." placeholder)
3. User presses a key combination
4. Validate: must include at least one modifier (Cmd/Ctrl/Alt/Shift) + a non-modifier key
5. Check for conflicts with other registered global shortcuts
6. Display the recorded combo; save on confirm
7. "Reset" button restores the default accelerator

**Implementation:**
- Recording state managed locally in `SettingsShortcuts` component
- On save: call `settings.set(key, accelerator)` then notify main process to re-register via IPC (`shortcut:update`)
- Add `SHORTCUT_UPDATE` to `IPC_CHANNELS` in `src/types/ipc.ts`
- Expose the channel in `src/preload/index.ts` (under `settings` namespace or new `shortcuts` namespace)
- Main process: export a `reRegisterShortcuts()` from `shortcuts.ts`, register the IPC handler in the main entry point (where other handlers live), calling into `reRegisterShortcuts()`
- Main process unregisters old shortcut, registers new one via `globalShortcut.register()`
- Validation rejects: bare keys without modifiers, already-taken combos, OS-reserved combos where detectable

### 8. International keyboard support

For all renderer-side shortcuts that use number keys, switch from `event.key` to `event.code`:

```typescript
// Before (breaks on Slovak/Czech/French keyboards)
if (event.key === '1') { ... }

// After (works on all layouts)
if (event.code === 'Digit1') { ... }
```

This applies to `Cmd+1` through `Cmd+4`. Letter-based shortcuts (`Cmd+K`, `Cmd+N`, `Cmd+F`) can continue using `event.key` since letter keys are consistent across Latin-script layouts.

## Unchanged shortcuts

These are correct and stay as-is:

| Shortcut | Action |
|----------|--------|
| `Cmd+K` | Toggle chat overlay + focus input |
| `Cmd+F` | Toggle search |
| `Cmd+Shift+N` | Create new note |
| `Cmd+Enter` | Process note with AI (notes editor) |
| `Cmd+Shift+A` | Archive note (notes editor) |
| `Alt+Up/Down` | Previous/next note (notes editor) |
| `Cmd+Z` | Undo assistant action (chat open, not typing) |
| `Cmd+Shift+L` | Toggle theme |
| `Escape` | Layered dismiss (updated order) |
| `Cmd+Shift+Space` | Toggle window (global, customizable) |
| `Cmd+Shift+Q` | Quick add (global, customizable) |

## Files to modify

| File | Changes |
|------|---------|
| `src/renderer/hooks/useKeyboardShortcuts.ts` | Replace bare keys with Cmd+code, update Cmd+N to trigger new task, remove J/K, update Escape hint comment |
| `src/renderer/hooks/useTaskListKeyboard.ts` | No changes (bare keys stay) |
| `src/renderer/components/settings/SettingsShortcuts.tsx` | Update hint sections, add shortcut recorder UI for global shortcuts |
| `src/renderer/stores/notesStore.ts` | No changes (store actions already exist) |
| New: `src/renderer/hooks/useNotesListKeyboard.ts` | Arrow key + Enter handler for notes list (mirrors useTaskListKeyboard pattern) |
| `src/renderer/components/notes/NotesList.tsx` | Add `tabIndex={0}`, `ref`, `onKeyDown` to container; wire up useNotesListKeyboard; verify visual highlight contrast |
| `src/renderer/components/tasks/TaskItem.tsx` | Verify visual highlight contrast on focused row (`bg-accent/20` may need bump) |
| `src/types/ipc.ts` | Add `SHORTCUT_UPDATE` to `IPC_CHANNELS` |
| `src/main/shortcuts.ts` | Export `reRegisterShortcuts()` for runtime re-registration |
| Main process entry point (where IPC handlers live) | Register `ipcMain.handle` for `SHORTCUT_UPDATE`, calling `reRegisterShortcuts()` |
| `src/preload/index.ts` | Expose `shortcut:update` IPC channel |
