---
id: 95
title: when we open/dismiss the task modal, the defaut view of app zooms in/out. I dont like the effect, can we safely remov eit ?asdas
status: review
created: 2026-03-09
updated: 2026-03-09T14:15:24.947137Z
position: 3.0
confidence: high
---

## Agent Summary
Removed the zoom/scale effect on the app content when opening/closing the task modal. Stripped the `content-shell-modal-open` CSS class (which scaled to 0.989 and reduced opacity to 0.9), removed the associated CSS custom properties and transitions from `.content-shell`, and removed all three `class:content-shell-modal-open` bindings in `App.svelte`.