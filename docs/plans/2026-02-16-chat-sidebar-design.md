# Chat Sidebar + AI View-Switching Design

**Date**: 2026-02-16
**Status**: Approved

## Overview

Transform chat from a full-screen takeover into a fixed sidebar panel. The AI can auto-navigate views when it performs actions, and gains read/write access to the scratchpad for drafting, proofreading, and task extraction.

## Goals

- Always see content and chat side-by-side
- Watch AI changes happen in real-time on the content side
- AI navigates to relevant views when acting
- AI can read, edit, and rewrite scratchpad content
- Magical but not over-engineered

## Layout Architecture

```
┌──────────────────────────────────────────────────┐
│ TitleBar (tabs: Today, Tasks, Inbox, Notes)      │
├────────────────────────────┬─────────────────────┤
│                            │                     │
│   Content Area (60%)       │   Chat Panel (40%)  │
│   - Active view renders    │   - Message history │
│     here                   │   - Tool cards      │
│   - Full width when chat   │   - Thinking steps  │
│     panel is closed        │                     │
│                            │                     │
│                            ├─────────────────────┤
│                            │ ChatInput           │
└────────────────────────────┴─────────────────────┘
```

### Key decisions

- **Chat is a panel, not a view.** Remove "Chat" from TitleBar tabs.
- **ChatInput moves** from AppShell bottom into the chat panel.
- **Panel closed** = content full-width, no input visible. Clean focus mode.
- **Panel open** = 60/40 fixed split. Content shrinks with smooth width transition (~200ms).
- **Toggle**: `4` or `Cmd+K` opens/closes. `Escape` closes.

## AI View-Switching

When the AI performs an action tied to a specific view, it auto-navigates the content side.

### Action → View mapping

| Action | Target View |
|--------|-------------|
| `create_task` with `today: true` | Today |
| `create_task` with `status: 'inbox'` | Inbox |
| `complete_task` | View where task lives |
| `update_task` | View where task lives |
| `set_today` | Today |
| `write_scratchpad` / `edit_scratchpad` | Scratchpad |
| `parse_notes` (bulk create) | Today or Inbox (based on destination) |

### Batching

Multi-step operations don't flip the view on every call. Only switch to the view relevant to the last/most significant action. E.g., edit scratchpad then create 3 tasks → land on Today.

### Indicator

No toast. The tool card in chat already communicates what happened. The view transition animation (200ms crossfade) + TitleBar tab highlight updating is sufficient visual feedback.

### User override

If the user manually navigates while AI is working, AI stops auto-switching for that interaction. User's explicit navigation takes priority.

## Scratchpad AI Tools

### `read_scratchpad`

- Reads current scratchpad content.
- Risk level: `low` (read-only, no confirmation).
- Used by AI to understand drafts before acting.

### `edit_scratchpad`

Accepts an `action` parameter:

| Action | Behavior | Risk | Confirmation |
|--------|----------|------|--------------|
| `append` | Adds content to end | `low` | No |
| `replace` | Finds and replaces a section | `medium` | Tool card shows before/after diff |
| `rewrite` | Rewrites entire scratchpad | `high` | Requires approval via autonomy gate |

### Example workflow

1. User dumps rough notes into scratchpad
2. User: "Clean this up and pull out action items"
3. AI calls `read_scratchpad` → reads notes
4. AI calls `edit_scratchpad` action=`rewrite` → presents cleaned version (needs approval)
5. User approves → scratchpad updates, view auto-switches to Scratchpad
6. AI calls `parse_notes` → creates tasks
7. View auto-switches to Today

## Implementation Scope

### Files to modify

**AppShell.tsx** — Main layout refactor:
- Single-column → flex split layout
- Chat panel as conditional right panel (width-animated)
- ChatInput moves into chat panel
- Content: `width: 100%` when closed, `width: 60%` when open

**appStore.ts** — State changes:
- Remove `isChatMode`
- Add `isChatPanelOpen: boolean`
- Add `toggleChatPanel()`, `openChatPanel()`, `closeChatPanel()`
- `setView()` unchanged — AI and user both call it

**TitleBar.tsx** — Remove Chat tab:
- Only show: Today, Tasks, Inbox, Notes
- Tab highlight updates naturally on AI view-switch

**tools.ts** — New tools + side effects:
- Add `read_scratchpad` and `edit_scratchpad` tool definitions
- Add view-switching side effects to existing mutation tools

**useKeyboardShortcuts.ts** — Update bindings:
- `4` toggles chat panel (not chat mode)
- `Escape` closes chat panel

**ChatInput.tsx** — Minor relocation:
- Remove absolute positioning from AppShell
- Render inside chat panel instead

### What stays the same

- ChatView.tsx internals (messages, tool cards, thinking steps)
- All existing tools and autonomy system
- Animation timing (200ms, same easing)
- All view components render identically (just narrower when panel open)

### Not building

- No resizable divider (fixed 60/40)
- No drag-to-dock or floating panel
- No panel state persistence across restarts (always starts closed)
