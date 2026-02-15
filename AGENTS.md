# Flusk Project Instructions for Coding Agents

## Mission
Build Flusk as a personal AI assistant for Marcus, not just a chat UI. The assistant should feel like a durable extension of the user: same priorities, stable personality, strong memory, and proactive execution support.

## Product Principle: Assistant First
Chat is a transport layer, not the product. Core value is:
1. Identity continuity (consistent personality and decision style)
2. Personal memory continuity (profile, patterns, commitments, context)
3. Useful agency (proactive planning, reminders, and prioritization)
4. Safe actioning (clear boundaries and confirmations for risky actions)

Any feature that improves chat UX but weakens these four goals is not acceptable.

## Source of Truth
- Product requirements: `docs/plans/2026-02-15-flusk-design.md`
- Assistant identity docs: `docs/assistant/SOUL.md`, `docs/assistant/CHARTER.md`
- Task plan and dependencies: `.taskmaster/tasks/tasks.json`
- Complexity guidance: `.taskmaster/reports/task-complexity-report.json`
- Workflow command docs: `.opencode/command/tm-*.md`

If there is a conflict, prioritize in this order:
1. User request
2. Assistant identity docs (`docs/assistant/*`)
3. Product plan (`docs/plans/2026-02-15-flusk-design.md`)
4. Task plan (`.taskmaster/tasks/tasks.json`)
5. Other docs

## Execution Order
Current bootstrap remains valid, with one critical gate:
1. Complete foundation work (Task 1, then dependencies)
2. Complete Assistant Identity Kernel task before deep AI chat behavior work
3. Only then implement full chat/tool orchestration flows

Hard gate:
- Do not ship Task 7 behavior (AI chat orchestration) without identity kernel outputs integrated into context building and response policy.

## Assistant Architecture Requirements
The runtime assistant must combine these layers on every response:
1. Soul: stable personality and communication style (`SOUL.md`)
2. Charter: role, boundaries, and operating rules (`CHARTER.md`)
3. User Profile: durable facts/preferences (editable)
4. Patterns: learned workflows and recurring structures
5. Journal: time-based observations and progress notes
6. Live Context: current tasks, due risk, today focus, recent activity

## Behavior Requirements
- Tone: direct, concise, non-corporate, accountability-oriented.
- Agency: propose next actions without waiting for prompts when context indicates drift, risk, or ambiguity.
- Time awareness: adapt behavior by morning/afternoon/evening and deadline pressure.
- Decision posture: optimize for user outcomes (completion, focus, cashflow) over conversational niceness.
- Safety: confirm destructive/high-financial actions regardless of autonomy mode.

## Personalization Rules
- Promote stable facts to profile/patterns only when confidence is high.
- Ask for confirmation before saving high-impact personal assumptions.
- Keep memory entries atomic and editable; avoid opaque hidden state.
- Track preference changes over time instead of overwriting history blindly.

## Development Guardrails
- Maintain strict process boundaries:
  - Main process owns DB, filesystem, tray, and shortcuts.
  - Preload exposes minimal typed APIs only.
  - Renderer never accesses raw Node/Electron internals.
- Keep IPC domain-first (`task:*`, `chat:*`, `settings:*`), never generic raw DB IPC.
- Validate write payloads (zod) before mutation.
- Log task mutations to `task_events` for undo/audit.
- Preserve PRD model names (`today`, `client`, `order`, etc.).

## Session Workflow
1. Run `task-master next`
2. Run `task-master show <id>`
3. Set status to in-progress
4. Implement in small validated increments
5. Update task/subtask notes with implementation and behavior decisions
6. Validate build/type/lint/test for touched scope
7. Mark done only after acceptance checks pass

## Acceptance Checks (Assistant-Specific)
Before closing any assistant-related task:
- Soul and charter constraints are actually consumed by runtime prompt/context assembly.
- At least one proactive behavior path is implemented and testable.
- Memory updates are auditable and reversible.
- High-risk actions require confirmation.
- Response style matches assistant identity docs.

## UI and UX Guardrails
- Follow PRD visual direction:
  - Monochrome, minimal, keyboard-first
  - 8px spacing grid
  - Inter typography
  - Dark mode default with light mode parity
- Keep motion subtle (200ms clean transitions; no bouncy animation).

## Safety
- Do not rewrite task history or mutate unrelated tasks.
- Avoid broad refactors during bootstrap unless explicitly requested.
- Prefer incremental delivery and keep dependency order intact.
