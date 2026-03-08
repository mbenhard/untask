---
id: 59
title: AI agent tweaks needed in Skills?
status: todo
created: 2026-03-08
updated: 2026-03-08T13:04:55.916565Z
position: 2.0
---
When we asked AI agent to process tasks in todo, for some reason it loaded ALL tasks instead of displaying the tasks in todo column via CLI?

\--

process todo tasks

&#x20; ⎿  Async hook Stop completed

&#x20; ⎿  Async hook Notification completed

&#x20; ⎿  Async hook SessionEnd completed

&#x20;                                                          01:57 PM claude-opus-4-6

⏺ Using untask to process tasks.

⏺ Skill(/untask)

&#x20; ⎿  Successfully loaded skill

&#x20; ⎿  1 PostToolUse hook ran

&#x20; ⎿  Async hook UserPromptSubmit completed

⏺ Bash(cargo run -p untask -- next --json 2>/dev/null)

++ it said we dont have a config file? No config file — defaults apply (auto\_done: false, tasks go to review)

how is it posible?

<br />