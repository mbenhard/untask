# Chat Sidebar Transition Contracts

**Date**: 2026-02-16  
**Status**: Locked for implementation batch 1

## 1. Panel Behavior Contract

`chat panel` replaces full-screen chat mode and is controlled by three explicit actions:

- `openChatPanel()`: opens right panel and leaves `activeView` unchanged.
- `closeChatPanel()`: closes right panel and leaves `activeView` unchanged.
- `toggleChatPanel()`: flips panel visibility and leaves `activeView` unchanged.

State model contract:

- `isChatPanelOpen` is renderer-owned UI state in `appStore`.
- `setView()` changes `activeView` only. It must not implicitly open/close the panel.

## 2. Action-to-View Intent Contract

Deterministic mapping and precedence for assistant-originated navigation:

| Action | View intent |
| --- | --- |
| `create_task` with `today: true` | `today` |
| `create_task` with `status: 'inbox'` | `inbox` |
| `create_task` otherwise | `tasks` |
| `set_today` | `today` |
| `edit_scratchpad` | `scratchpad` |
| `parse_notes` to inbox destination | `inbox` |
| `parse_notes` to non-inbox destination | `today` |
| `update_task`/`complete_task` | `today` first, then `inbox`, else `tasks` |

Precedence rules:

- Apply at most one auto-switch per assistant turn.
- Use last-significant-action precedence for multi-step turns.
- If user manually changes view during a turn, suppress auto-switch for the remainder of that turn.

## 3. Ownership Boundary Contract

- Main process AI tooling may emit view-intent metadata only.
- Main process must never mutate renderer navigation state directly.
- Renderer (`chatStore` + `appStore`) decides whether and when to apply `setView()`.

## 4. Explicit Non-Goals

This iteration does not include:

- Resizable split divider.
- Docking/floating chat panel variants.
- Persisting panel open/closed state across restarts.
