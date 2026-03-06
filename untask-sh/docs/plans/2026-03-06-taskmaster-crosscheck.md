# Taskmaster Crosscheck

Date: 2026-03-06

## Scope

This audit crosschecks `.taskmaster/tasks/tasks.json` and the generated task markdown files against:

1. `docs/plans/2026-03-06-untask-implementation.md`
2. `docs/plans/2026-03-06-untask-design.md`
3. `docs/untask-design-language.md` for UI-specific follow-through

## Summary

Taskmaster currently contains 19 tasks and 77 subtasks. Top-level coverage is complete, but several implementation-plan tasks were split or merged when the backlog was generated.

## Task Mapping

1. Implementation Tasks 1-4 map directly to Taskmaster 1-4.
2. Implementation Task 5 was split into Taskmaster 5 and 6.
3. Implementation Task 6 was split into Taskmaster 7 and 8.
4. Implementation Tasks 7-10 map directly to Taskmaster 9-12.
5. Implementation Task 11 was split into Taskmaster 13 and 14.
6. Implementation Task 12 maps directly to Taskmaster 15.
7. Implementation Tasks 13-14 map directly to Taskmaster 16-17.
8. Implementation Tasks 15-16 were merged into Taskmaster 18.
9. Implementation Task 17 was merged into Taskmaster 19 subtasks 1-2.
10. Implementation Task 18 was folded into Taskmaster 11 subtask 5.
11. Implementation Task 19 was folded into Taskmaster 19 subtasks 3-4.

## Corrections Applied

The Taskmaster data was updated to remove drift from the approved docs:

1. Theme modeling now points to `mono`, `color`, and `none` instead of invented light/dark/system variants.
2. Subtask progress counting now explicitly ignores nested subtasks for v1 progress math.
3. Store-layer verification now explicitly includes concurrency coverage for `add`, `status`, and `delete`.
4. CLI, TUI, and desktop task-list work now includes status/tag/priority filtering and stable sort modes.
5. `next` command subtasks now match the design doc: recent commits, open tasks, recently completed tasks, and cleanup hints, with empty sections omitted.
6. Skill packaging now explicitly ships bundled `skill/untask.md` guidance instead of treating install as a generic config-file copy.
7. Desktop backend doc commands now honor configured `config.docs` globs rather than assuming `.untask/docs/` only.
8. Desktop frontend state now restores the last project from backend Application Support metadata rather than frontend-only persistence.
9. Desktop kanban work now follows config-defined columns and preserves `Unmatched` / `Unindexed` visibility.
10. Desktop UI tasks now explicitly reference `docs/untask-design-language.md`.
11. CI scope now matches the approved plan: Rust checks on Ubuntu, desktop verification on macOS.

## Recommendation

Keep both root `AGENTS.md` and `CLAUDE.md` in sync so future coding sessions load the same project brief regardless of agent.
