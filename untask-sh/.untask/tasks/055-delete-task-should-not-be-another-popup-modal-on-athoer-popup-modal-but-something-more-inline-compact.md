---
id: 55
title: '"Delete task?” should not be another popup modal on athoer popup modal but something more inline, compact'
status: done
created: 2026-03-08
updated: 2026-03-08T13:03:51.610107Z
completed: 2026-03-08T13:03:51.610106Z
position: 1.0
confidence: high
---

## Agent Summary
Replaced the nested `AlertDialog` confirmation modal with an inline confirmation pattern in the TaskModal footer. When the trash icon is clicked, it transforms into "Delete? [Yes] [No]" inline text with bordered buttons. Removed the `AlertDialog` import (only `Dialog` from bits-ui remains). Reused the existing `showDeleteConfirm` state variable. Styling: monochrome, `font-mono text-[10px]`, dense spacing, red accent only on the destructive "Yes" action.
