---
id: 61
title: Task Modal UI Improvements and Rendering
status: done
created: 2026-03-08
updated: 2026-03-08T18:30:32.153159Z
completed: 2026-03-08T14:19:03.258549Z
position: 6.0
confidence: high
---
- [x] During Review process, the agent summary has markdown text - we dont render it properly for some reaason? needs fixing
- [x] When there is too much content, i.e from the agent summary or notes, the row with status/priority/Tags/etc is fucked up and its like if it was shrinked, we must enforce somehow to keep the row height not shrinked, or something similar/cleaner solution?

## Agent Summary
Fixed both bugs in TaskModal.svelte:
1. **Markdown rendering**: Added `marked` dependency and replaced raw text `<p>` tags in agent sections (Agent Summary, Deferred, Review Notes) with `{@html renderMarkdown()}`. Added scoped `.agent-md` CSS for lists, code, bold, blockquotes at appropriate scale.
2. **Metadata row squishing**: Added `shrink-0` to title and metadata row divs, removed constraining `max-h-[80px] overflow-y-auto` from metadata row so flexbox no longer compresses these sections when content below is long.