---
id: 76
title: improve the kick back and approve button to use same components/style as the main copy button
status: done
created: 2026-03-08
updated: 2026-03-08T19:00:04.633167Z
completed: 2026-03-08T19:00:04.633165Z
position: 7.0
confidence: high
attachments:
- filename: paste-1772995358786.png
  mime_type: image/png
  size: 6131
  created: 2026-03-08T18:42:45.015734Z
---

## Agent Summary
Updated "Kick back" and "Approve" buttons in TaskModal footer to use the same inverted primary style as the "Copy for AI" button (`bg-foreground text-background` with `border-foreground/20` and `hover:bg-foreground/85`). Also updated the "Kick back" submit button in the kick-back notes panel and the "Approve all" button in ReviewView for consistency. Cancel button in the notes panel kept as ghost/outlined since it's a dismissive action.
