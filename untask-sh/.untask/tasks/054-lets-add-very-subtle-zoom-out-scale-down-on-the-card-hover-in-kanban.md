---
id: 54
title: lets add very subtle zoom out/scale down? on the card hover in kanban
status: done
created: 2026-03-08
updated: 2026-03-08T13:03:01.200228Z
completed: 2026-03-08T13:03:01.200227Z
position: 1.0
confidence: high
---

## Agent Summary
Added `transform: scale(0.98)` to the `.kanban-card:hover` CSS rule in `Kanban.svelte`. The existing `transition-all duration-[120ms]` classes handle the smooth animation. The 2% scale-down is barely noticeable but gives tactile feedback, and naturally progresses to the drag state (0.97 + rotation). Follows design language: restrained motion, 120ms timing, mechanical feel.
