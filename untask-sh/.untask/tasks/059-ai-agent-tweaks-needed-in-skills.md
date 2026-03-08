---
id: 59
title: AI agent tweaks needed in Skills?
status: done
created: 2026-03-08
updated: 2026-03-08T18:30:32.187865Z
completed: 2026-03-08T14:20:20.028537Z
position: 9.0
confidence: high
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

## Agent Summary
Fixed both issues in the untask skill (`crates/untask-cli/skill/untask.md`):
1. Added explicit guidance: "When the user asks to process tasks in a specific column, use `untask list --status <status> --json`" — prevents the agent from using `untask next` (which returns all tasks) when the user specifies a column.
2. Removed the config file check (`read .untask/config.yml for auto_done`). Simplified to just "run `untask status <id> review`" with a note that review is the default. This eliminates the confusing "No config file" message since there is no config file in the project.