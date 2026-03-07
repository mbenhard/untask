---
id: 3
title: Extend Skills Capability
status: backlog
created: 2026-03-07
updated: 2026-03-07T10:49:17.260863Z
position: 3.0
---
We need to improve skills to better automate things/flows

<br />

and 

<br />

Currently it's Claude Code only. The implementation:

&#x20; \- Only checks for \~/.claude/ (line 39)

&#x20; \- Only writes to \~/.claude/commands/ (line 41)

&#x20; \- Fallback message only mentions \~/.claude/commands/ (line 45)

&#x20; It doesn't detect or install to any other agent config directories. Other coding agents

&#x20; that could benefit from the same skill markdown:

&#x20; ┌─────────────┬───────────────────────────────────────────────────────┐

&#x20; │    Agent    │                    Config location                    │

&#x20; ├─────────────┼───────────────────────────────────────────────────────┤

&#x20; │ Claude Code │ \~/.claude/commands/                                   │

&#x20; ├─────────────┼───────────────────────────────────────────────────────┤

&#x20; │ Cursor      │ .cursor/rules/ or .cursorrules                        │

&#x20; ├─────────────┼───────────────────────────────────────────────────────┤

&#x20; │ Windsurf    │ .windsurfrules                                        │

&#x20; ├─────────────┼───────────────────────────────────────────────────────┤

&#x20; │ Cline       │ .clinerules                                           │

&#x20; ├─────────────┼───────────────────────────────────────────────────────┤

&#x20; │ Codex       │ codex.md or AGENTS.md                                 │

&#x20; ├─────────────┼───────────────────────────────────────────────────────┤

&#x20; │ Aider       │ .aider.conf.yml conventions                           │

&#x20; ├─────────────┼───────────────────────────────────────────────────────┤

&#x20; │ Generic     │ .github/copilot-instructions.md, CLAUDE.md, AGENTS.md │

&#x20; └─────────────┴───────────────────────────────────────────────────────┘

&#x20; The skill content itself (untask.md) is agent-agnostic — it's just a markdown prompt with

&#x20;  CLI usage instructions. Any agent that can read markdown instructions would understand

&#x20; it. The only thing that's Claude Code-specific is the install target path.

&#x20; Want me to extend detect\_install\_target to support multiple agents?
