---
id: 67
title: Task Review - Confidence label that is created by AI is honestly lost and I sometimes dont even notice. wHat would be best way to present it?
status: done
tags:
- planning
- brainstorming
- feature
- swasa
created: 2026-03-08
updated: 2026-03-08T19:28:36.104494Z
completed: 2026-03-08T19:28:36.104493Z
position: 1.0
confidence: high
---
## Problem Analysis

The `confidence` field (low/medium/high) is set by AI agents when they finish a task, but it is practically invisible in the current UI:

* **Kanban cards**: Confidence is not displayed at all. The user has no way to see it without opening the task.

* **TaskModal**: Shown as a plain monochrome chip (`border border-border/60`, 10px mono text) in the metadata row. It blends in with Status, Priority, Tags, and Owner — nothing distinguishes it as a signal that needs attention.

* **ReviewView list**: Shown as `text-muted-foreground/60` at 10px — the faintest possible treatment. The list does sort low-confidence first, which helps, but the label itself is nearly invisible.

The core issue: confidence is treated as just another metadata field, but it is actually a **trust signal** — the one piece of information that tells you "this might need extra scrutiny." It deserves elevated treatment without breaking the monochrome/restrained design language.

***

## Approach A: Confidence Dot (Recommended)

**Concept:** Reuse the same tiny-dot pattern from PriorityDot, but for confidence. Add a second dot to the Kanban card bottom row and to the ReviewView list row.

**Kanban card:** Add a confidence dot next to the priority dot in the bottom row. Use a distinct visual language from priority — a ring/outline dot instead of a filled dot, or a different shape (e.g., a tiny diamond). Color-code: low = rose/red tint, medium = amber tint, high = emerald tint. This is intentionally the inverse of priority colors: low confidence = warning, high confidence = safe.

**ReviewView list:** Replace the plain text confidence label with a dot + text pair, same as how priority is shown. Low-confidence rows could also get a subtle left border accent (2px, `border-l-priority-high/40`) to draw the eye.

**TaskModal:** Replace the plain chip with a dot + label, and for low confidence, tint the chip border slightly (e.g., `border-priority-high/30`) to make it stand out from the other neutral metadata.

**Pros:**

* Follows the design language exactly (tiny dots for state signals, monochrome first, color only for semantic meaning).

* Minimal UI footprint — a 5px dot does not clutter the card.

* Confidence becomes scannable at the board level without opening tasks.

* Inverse color mapping creates an intuitive "attention gradient" — red dot = look closer, green dot = probably fine.

**Cons:**

* Two dots on a card (priority + confidence) could cause confusion without a learning moment. Mitigated by: different dot styles (filled vs ring), tooltip on hover, and only showing confidence dot when the field is set (i.e., only AI-touched tasks).

* Adds another visual element to an already dense card.

***

## Approach B: Confidence Banner in TaskModal

**Concept:** When opening a task that has confidence set (especially low or medium), show a thin banner just below the header bar — similar to the existing "Unindexed" warning banner but tuned for confidence.

**Implementation:** A 28px-high strip below the header with a left border accent:

* Low confidence: `border-l-priority-high/60` (rose tint), text like "AI confidence: low — review carefully"

* Medium confidence: `border-l-priority-medium/60` (amber tint), text like "AI confidence: medium"

* High confidence: no banner at all, or a very subtle one-liner

**Kanban card:** No change to cards (keeps them clean). Instead, rely on the ReviewView sort order (low-confidence first) and the modal banner to surface the signal when the user actually opens the task.

**Pros:**

* Zero visual noise on the board. Cards stay clean.

* Strong signal when it matters — the moment you open a task to review it, the banner is right there.

* Follows the existing pattern (Unindexed banner) so no new UI concept needed.

* Good for a workflow where the user reviews from the ReviewView tab, opening tasks one by one.

**Cons:**

* No board-level visibility at all. The user still cannot scan the Kanban and see which tasks need more scrutiny.

* Only works if the user opens each task. Does not help with triage from the board view.

***

## Approach C: Hybrid — Dot on Card + Tinted Chip in Modal

**Concept:** Combine elements of A and B. Add a confidence dot to Kanban cards (only when confidence is set and is low or medium — high confidence tasks get no extra indicator since they are "fine"). In the TaskModal, upgrade the confidence chip to use a tinted border that matches the confidence level.

**Kanban card:** Show a small ring-style dot only for low and medium confidence. The dot uses the inverse color mapping (low = rose ring, medium = amber ring). High confidence or no confidence = no dot shown. This means the dot only appears when something needs attention, reducing visual noise.

**ReviewView list:** Add the same ring dot before the confidence text label. Keep sorting low-confidence first.

**TaskModal:** Tint the confidence chip border: low gets `border-priority-high/40`, medium gets `border-priority-medium/40`, high stays neutral. This is enough to make it pop without adding a full banner.

**Pros:**

* Board-level signal exists, but only when it matters (low/medium confidence).

* High-confidence tasks remain visually clean — no noise for tasks that are fine.

* Modal treatment is subtle but distinct from other metadata.

* Least visual overhead of any approach that includes board-level visibility.

**Cons:**

* "Absence of a dot" for high confidence could be confusing — user might wonder if confidence was set at all. Mitigated by: confidence text is still shown in the modal metadata row regardless.

***

## Recommendation

**Approach C (Hybrid)** is the strongest fit for the design language and the problem.

Rationale:

1. The design language says "color only appears when it communicates state" and "priority is usually shown as a tiny 5px dot, not a badge." Confidence is a state signal and deserves the same dot treatment.
2. Showing the dot only for low/medium confidence follows the principle of "quiet by default, loud only when needed." High-confidence tasks do not need visual noise.
3. The inverse color mapping (low confidence = red, high confidence = green) is intuitive and distinct from priority (low priority = green, high priority = red), avoiding confusion.
4. No new UI concepts are introduced — ring dots, tinted borders, and metadata chips all exist already in the design system.

**Implementation notes:**

* Create a `ConfidenceDot.svelte` component: a 5px ring (1px border, transparent fill) with color based on confidence level. Alternatively, reuse PriorityDot but with a ring variant.

* In `Kanban.svelte`, add the confidence dot to the bottom row, after the priority dot, only when `task.confidence` is "low" or "medium".

* In `ReviewView.svelte`, add the confidence dot before the text label.

* In `TaskModal.svelte`, add a subtle border tint to the confidence chip based on the value.

## Agent Summary
Moved confidence display from the metadata bar into the Agent Summary speech bubble. Removed the standalone confidence chip. Added an inline pill to the bubble header row (right-aligned next to "AGENT SUMMARY" label) that translates AI confidence into user-actionable language: low → "! Needs review" (rose pill), medium → "~ Spot check" (amber pill), high/unset → no pill shown. This keeps the bubble clean for routine tasks and only surfaces a signal when review attention is needed.
