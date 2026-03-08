---
id: 69
title: The “owner” label in task - whether User/AI - the label “owner” seems weird, propose alterantives
status: review
created: 2026-03-08
updated: 2026-03-08T15:04:50.741555Z
position: 3.0
---

## Context

The `owner` field on tasks currently serves one purpose: differentiating tasks the human wants to handle personally from tasks the AI agent can pick up. It is a binary toggle — either `”user”` (human-only) or `null` (AI-eligible, the default). The field name “Owner” appears as a label in the task modal metadata row and as a comment in the kanban card code. On kanban cards, user-owned tasks show a small person icon next to the priority dot.

The word “owner” feels off because:

- Tasks are not “owned” in the traditional project-management sense — there is no team, no assignment to specific people.
- The binary is really about *who should work on this* (human vs. agent), not possession.
- “Owner: AI” reads oddly — AI does not “own” anything; it just processes tasks.
- The label competes conceptually with what “owner” means in git/GitHub contexts.

---

## Proposal A: “Assigned To” / `assigned`

**Label in UI:** `Assigned`
**Values displayed:** `User` / `AI` (or just the person icon vs. default)
**Frontmatter key:** `assigned: user | null`

**How it reads:**
- Modal: `ASSIGNED` [User] or `ASSIGNED` [AI]
- Conceptually: “This task is assigned to the user” / “This task is assigned to the agent”

**Pros:**
- Familiar concept from project management tools (Jira, Linear, GitHub Issues).
- Reads naturally in both directions: “assigned to user” and “assigned to AI” both make sense.
- Works if the system ever grows to support named assignees or multiple agents.

**Cons:**
- Implies a richer assignment system than what exists (just a binary toggle).
- “Assigned: AI” still feels slightly odd since AI is the default and does not need explicit assignment — it is more that the user is claiming the task.
- Slightly generic / enterprise-flavored for the tool's indie-developer identity.

---

## Proposal B: “For” / `for`

**Label in UI:** `For`
**Values displayed:** `Me` / `Agent` (or icon-only)
**Frontmatter key:** `for: user | null`

**How it reads:**
- Modal: `FOR` [Me] or `FOR` [Agent]
- Conceptually: “This task is for me” / “This task is for the agent”

**Pros:**
- Extremely short and direct — fits the design language's preference for compact mono labels.
- Reads like natural speech: “for me” is how you would actually say it.
- Avoids enterprise jargon entirely.
- Works well as a tiny label next to the toggle button.

**Cons:**
- `for` is a reserved keyword in many languages, which could cause friction in frontmatter tooling or scripting (though YAML handles it fine as a key).
- “For: Agent” is less natural than “For: Me” — the default (AI-eligible) might be better left unlabeled.
- Very terse — could be unclear to new users without context.

---

## Proposal C: “Handled By” / `handled_by`

**Label in UI:** `Handled by`
**Values displayed:** `User` / `AI`
**Frontmatter key:** `handled_by: user | null`

**How it reads:**
- Modal: `HANDLED BY` [User] or `HANDLED BY` [AI]
- Conceptually: “This task is handled by the user” / “This task is handled by the agent”

**Pros:**
- Clearly communicates the intent: who is doing the work.
- Avoids the “ownership” connotation entirely.
- Feels operational and tool-like.

**Cons:**
- Two words as a label — takes more horizontal space in the dense metadata row.
- `handled_by` is verbose for a frontmatter key compared to `owner`.
- Reads a bit passively — “handled by” implies delegation, which is not quite right when the user claims a task for themselves.

---

## Recommendation

**Proposal B: “For”** is the strongest fit for this tool.

Rationale:
1. **Design language alignment.** The mono uppercase label `FOR` is as compact as it gets — 3 characters. It matches the density-first principle and sits well alongside `STATUS`, `PRIORITY`, and `TAGS` in the metadata row.
2. **Natural mental model.** When a user toggles the button, they are saying “this one is for me” — that is exactly how the feature works. The AI-eligible default does not need a label at all; the toggle only lights up when the user claims it.
3. **Tone.** It avoids both enterprise jargon (“assigned”, “handled by”) and the awkward possession implied by “owner.” It sounds like something a solo developer would say to themselves.
4. **Values.** Display `Me` when toggled on (with the person icon), and `Agent` when toggled off. Or even simpler: just show the person icon when it is user-claimed, and nothing when it is AI-eligible — the label `FOR` plus the icon tells the whole story.

If `for` as a YAML key is a concern, `actor` is a clean single-word alternative frontmatter key that avoids reserved-word issues while keeping the UI label as `For`.

---

## Agent Summary

Analyzed how the `owner` field is used across the full stack: Rust data model (`task.rs`, `store.rs`, `next.rs`), Tauri commands (`commands.rs`), TypeScript types (`api.ts`), the task modal UI (`TaskModal.svelte`), kanban cards (`Kanban.svelte`), and the CLI skill instructions (`untask.md`). The field is a simple binary toggle — `”user”` means human-only, `null` means AI-eligible.

Proposed three alternatives:
- **”Assigned”** — familiar but enterprise-flavored
- **”For”** — compact, natural, fits the design language best
- **”Handled By”** — clear but verbose

Recommended **”For”** as the best fit for the tool's identity and design language.
