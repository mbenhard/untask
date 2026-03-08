---
id: 78
title: I noticed that the task card doesnt have background during the drag and drop, can we somehow improve it ?
status: done
tags:
- issue
created: 2026-03-08
updated: 2026-03-08T19:00:09.473725Z
completed: 2026-03-08T19:00:09.473724Z
position: 8.0
confidence: high
---

## Agent Summary
Added `bg-card` to the kanban card element in `Kanban.svelte`. The card had no explicit background color, so when the browser captured it as a drag ghost image during HTML5 drag-and-drop, it appeared transparent. The `bg-card` class applies `#1a1a1a`, giving the drag preview a solid dark background that matches the design language.
