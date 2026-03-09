---
id: 52
title: |-
  The core problem: /unship covers session start and task
    pickup, but says nothing about what to do when finishing. The agent has to independently
    remember to invoke /unship-finish — which is easy to forget since it's never referenced.

    Three approaches:

    A) Merge finish into /unship — Add a "Completing a task" section to the main skill. The
    agent sees the full lifecycle (pick up → work → finish) in one place. The finish
    checklist is only ~15 lines, so it doesn't bloat the skill much. My recommendation — the
    agent should never need to think "which skill do I invoke now?"

    B) Keep separate, add a pointer — Add "When done, invoke /unship-finish" to /unship.
    Keeps skills focused but still relies on the agent choosing to invoke it.

    C) Hook-based automation — Use a Claude Code hook (e.g., pre-commit or a custom trigger)
    that detects when a task file is modified and prompts the agent to follow the finish
    checklist. Most robust but more complex to implement.

    Which direction feels right?
status: backlog
created: 2026-03-08
updated: 2026-03-08T13:02:22.875381Z
position: 20.0
---
