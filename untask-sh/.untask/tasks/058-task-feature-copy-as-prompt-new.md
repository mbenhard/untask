---
id: 58
title: Task Feature - Copy as prompt + new?
status: done
created: 2026-03-08
updated: 2026-03-08T14:50:50.606488Z
completed: 2026-03-08T14:50:50.606487Z
position: 1.0
confidence: high
---
Replace "Copy as prompt" with a split button. Left = last-used action (one-click copy), right chevron = dropdown with Do / Plan / Discuss. Each generates a different prompt template. Last-used persisted in localStorage. Pure frontend change.

See: docs/plans/2026-03-08-tags-owner-prompt-actions.md §3

## Agent Summary
Implemented split prompt button in TaskModal footer:
- Replaced single "Copy as prompt" button with a split button: left side copies with current mode, right chevron opens dropdown
- Three modes: Do (implement), Plan (outline approach without implementing), Discuss (analyze and explore)
- Each mode generates a different prompt template with task context
- Last-used mode persisted in localStorage under `untask-prompt-mode` key
- Dropdown opens upward (above footer), closes on mouseleave

## Review Notes
I tested it but it seems that I still only see the “Copy as prompt” ? please review the task properly
