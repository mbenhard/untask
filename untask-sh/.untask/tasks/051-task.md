---
id: 51
title: In the status dropdown, the priority tag and the text placeholder, as well as the button for copying the prompt, it seems that the text size is too big compared to the outline or boundary of the element. We could either make the inner padding bigger or reduce the text size in the labels or text fields or inputs or maybe combination of both.
status: done
created: 2026-03-08
updated: 2026-03-08T13:03:01.259391Z
completed: 2026-03-08T12:50:19.091595Z
position: 7.0
confidence: high
---

## Agent Summary
Fixed text-to-container proportions across the entire Task Modal. Root cause was twofold: (1) bumping chip/button text from 10px to 11px made text too large for h-6 (24px) containers — reverted to 10px with the larger containers and padding for better breathing room, and (2) a global `font: inherit` rule in app.css on all button/input/textarea/select elements was overriding all Tailwind font-size utilities because unlayered CSS beats Tailwind v4's cascade layers. Fixed by changing to `font-family: inherit`. Also fixed modal position glitch on open, subtask container spacing, metadata label contrast, and added "Copy as prompt" labeled button.

## Deferred
- Kanban task card polish (priority dot styling, empty progress bar, tag chip styling) — noted in analysis but not addressed per user's request to focus on modal first