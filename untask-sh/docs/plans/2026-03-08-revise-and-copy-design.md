# Revise & Copy — Review Flow Redesign

## Summary

Combine the kick-back and copy-for-AI actions in the review flow into a single "Revise & copy" split button. Rename "Kick back" / "Send back" to "Revise" throughout.

## Current State

Review footer: `[Copy for AI]` ... `[Kick back]` `[Approve]`
After clicking Kick back (textarea): `[Cancel]` ... `[Send back]`

Problems:
- "Kick back" / "Send back" are unclear jargon
- No combined action for the common workflow: reject + copy revision prompt for AI

## Design

### Button Layout

**Review footer (before textarea):**
`[Copy for AI]` ... `[Revise]` `[Approve]`

**After clicking Revise (textarea open):**
`[Cancel]` ... `[Revise & copy ▾]` (dropdown: `Revise`)

### Behavior

- **Revise & copy (default):** Sets status to `in-progress`, appends review notes under `## Review Notes` in body, copies revision prompt to clipboard, closes modal.
- **Revise (dropdown):** Same as above but without copying. For when you don't need the AI prompt.
- Button styling: split button pattern (matches existing Copy for AI split button).

### Revision Prompt Format

New `"revise"` mode in `copyPrompt()`:

```
Revise task #X: <title>

This task was reviewed and needs changes.

## Review Notes
<notes from textarea>

<original task body>
<tags, attachments>
```

### Auto-close

Modal closes after action (matches current send-back behavior).

## Scope

- Rename all `kickBack` references to `revise`
- Add `"revise"` mode to `copyPrompt()`
- Replace kick-back footer with split button (`Revise & copy` default / `Revise` dropdown)
- Rename "Kick back" button label to "Revise"
