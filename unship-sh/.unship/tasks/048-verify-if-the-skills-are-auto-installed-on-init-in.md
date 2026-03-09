---
id: 48
title: Verify if the skills are auto installed on init in
status: done
created: 2026-03-08
updated: 2026-03-08T18:30:32.176548Z
completed: 2026-03-08T13:04:39.959113Z
position: 8.0
confidence: high
---

## Agent Summary
Investigated the `init` command in `crates/unship-core/src/init.rs` and the CLI handler in `crates/unship-cli/src/main.rs`. **Skills are NOT auto-installed on `unship init`.** The init command only creates the `.unship/` directory structure and default config. Skill installation is a separate command: `unship skill install --provider claude-code`, implemented in `crates/unship-cli/src/commands/skill.rs`. To auto-install, the CLI init handler would need to detect the agent provider (e.g. check for `~/.claude/`) and call skill install after project setup.

## Deferred
- Actual implementation of auto-install on init (separate feature task if desired)
