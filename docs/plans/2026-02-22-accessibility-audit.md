# Untask Accessibility Audit — 2026-02-22

## Executive Summary

**Overall Accessibility Maturity: MODERATE**

The app shows intentional effort: custom `useFocusTrap` hook, `useTaskListKeyboard` hook, comprehensive keyboard shortcuts, `role="listbox"` on task lists, `aria-label` on most interactive elements, and `prefers-reduced-motion` support. The keyboard-first design philosophy helps significantly.

However, several significant gaps exist in screen reader support, ARIA semantics, color contrast, and keyboard-only operation for certain features.

**Finding breakdown:** 2 CRITICAL, 7 HIGH, 10 MEDIUM, 5 LOW

---

## 1. Focus Management

### CRITICAL

**F-1: Chat overlay panel has no focus trap**
- `AppShell.tsx:362-454` — When chat overlay opens, focus is placed on the input, but users can Tab out into obscured content behind the panel. The `useFocusTrap` hook exists (used for SearchModal) but isn't applied here.
- **Fix:** Apply `useFocusTrap(openPanelRef, chatOverlayState === 'open')`.
- **WCAG:** 2.4.3 Focus Order

### MEDIUM

**F-2: Focus restoration after chat overlay close is fragile**
- `AppShell.tsx:219-227` — `collapseChatOverlay` restores focus to `[data-primary-focusable]` regardless of where the user was before opening chat.
- **Fix:** Store `document.activeElement` on open, restore on close.
- **WCAG:** 2.4.3

**F-3: Popover menus don't reliably return focus to trigger on close**
- `TaskItem.tsx:555-716`, `TaskBody.tsx:239-489` — `stopPropagation()` and manual `setMenuOpen(false)` may interfere with Radix's focus restoration.
- **Fix:** Let Radix `onOpenChange` handle closes where possible.
- **WCAG:** 2.4.3

**F-4: View transitions don't manage focus placement**
- `AppShell.tsx:195-213` — Switching views (Cmd+1-4) leaves focus on nav button or `document.body`.
- **Fix:** Place focus on heading or primary element in new view after transition.
- **WCAG:** 2.4.3

---

## 2. ARIA Labels and Roles

### HIGH

**A-1: TitleBar navigation lacks tab semantics**
- `TitleBar.tsx:32-53` — Uses `aria-current="page"` (valid alternative pattern) but lacks `role="tablist"`/`role="tab"`/`aria-selected`.
- **Fix:** Add tab roles for better screen reader announcements.
- **WCAG:** 4.1.2

**A-2: Settings view tab strip lacks tab semantics**
- `SettingsView.tsx:58-80` — No `role="tablist"`, `role="tab"`, `aria-selected`, or `role="tabpanel"`.
- **Fix:** Add proper ARIA tab pattern with `aria-controls`/`aria-labelledby` linkage.
- **WCAG:** 4.1.2

**A-3: Custom note context menu lacks `role="menu"`**
- `NotesList.tsx:119-175` — Rendered as positioned `<div>` with no role. Items lack `role="menuitem"`.
- **Fix:** Add `role="menu"` and `role="menuitem"`.
- **WCAG:** 4.1.2

**A-4: Task action popover lacks menu role**
- `TaskItem.tsx:583-715` — Buttons inside PopoverContent function as menu but lack ARIA semantics.
- **Fix:** Add `role="menu"` and `role="menuitem"`.
- **WCAG:** 4.1.2

### MEDIUM

**A-5: Priority dot indicator not accessible**
- `TaskItem.tsx:426-432` — Colored circle conveys priority through color only, with no text alternative.
- **Fix:** Add `<span className="sr-only">Priority: {priority}</span>`.
- **WCAG:** 1.3.1, 1.4.1

**A-6: Search results lack combobox/listbox pattern**
- `SearchModal.tsx:146-218` — No `role="combobox"`, `role="listbox"`, `role="option"`, `aria-selected`, or `aria-activedescendant`.
- **Fix:** Implement proper ARIA combobox pattern.
- **WCAG:** 4.1.2, 1.3.1

**A-7: Thread list lacks selection semantics**
- `ThreadListView.tsx:240-299` — No `role="listbox"` or `aria-selected` on items.
- **Fix:** Add listbox/option roles with `aria-selected={isCursor}`.
- **WCAG:** 4.1.2

### LOW

**A-8: Chat "Back to threads" button lacks descriptive label**
- `AppShell.tsx:382-391` — Button with arrow icon has no `aria-label`.
- **Fix:** Add `aria-label="Back to threads"`.
- **WCAG:** 4.1.2

---

## 3. Screen Reader Support

### CRITICAL

**S-1: Toast notifications not announced**
- `Toast.tsx:39-77` — No `role`, `aria-live`, or `aria-atomic`. Status messages are invisible to screen readers.
- **Fix:** Add `role="status"` and `aria-live="polite"` to toast container.
- **WCAG:** 4.1.3

### HIGH

**S-2: Task completion state changes not announced**
- `TaskItem.tsx` — When Space completes a task, no screen reader announcement. No `aria-checked` or live region.
- **Fix:** Add `role="checkbox"` with `aria-checked={isCompleted}`, or announce via live region.
- **WCAG:** 4.1.3

### MEDIUM

**S-4: Error states not associated with inputs**
- `SettingsView.tsx:82-90` — Error banner uses `role="alert"` (good) but not linked to specific input via `aria-describedby`.
- **WCAG:** 3.3.1

### LOW

**S-3: Decorative icons not consistently hidden**
- Multiple files — Most icons are appropriately handled, but pattern is inconsistent.
- **Fix:** Verify all decorative icons have `aria-hidden="true"`.
- **WCAG:** 1.3.1

---

## 4. Keyboard-Only Operation

### HIGH

**K-1: Note hover actions are mouse-only**
- `NotesList.tsx:249-280` — Pin, archive, delete buttons use `opacity-0 group-hover:opacity-100`. Unreachable by keyboard.
- **Fix:** Add `group-focus-within:opacity-100`.
- **WCAG:** 2.1.1

**K-2: Thread hover actions are mouse-only**
- `ThreadListView.tsx:271-296` — Archive and delete buttons same pattern as K-1.
- **Fix:** Add `group-focus-within:opacity-100`.
- **WCAG:** 2.1.1

### MEDIUM

**K-3: Cross-lane drag requires mouse (but S key mitigates)**
- Task drag between status lanes is mouse-only, but `S` key cycles status.
- **WCAG:** 2.1.1 (partial mitigation)

**K-4: Tab key trapped within task lists**
- `useTaskListKeyboard.ts:103-106` — `preventDefault()` on Tab prevents escaping the task list to reach other app regions.
- **Fix:** Allow Tab to leave the list container while preventing cycling through items.
- **WCAG:** 2.1.1, 2.4.3

### LOW

**K-5: InlineTaskInput metadata not keyboard-navigable in list context**
- `InlineTaskInput.tsx:197-242` — Tab blocked by task list keyboard handler.
- **WCAG:** 2.1.1

---

## 5. Color Contrast

### HIGH

**C-1: `muted-foreground` fails AA contrast**
- `index.css:36-57` — Dark mode: `#8A8A8A` on `#161616` ≈ 4.22:1 (below 4.5:1 AA). Light mode: `#737373` on `#F7F7F7` ≈ 4.11:1.
- **Fix:** Dark: `#8A8A8A` → `#999999` (5.0:1). Light: `#737373` → `#636363` (5.3:1).
- **WCAG:** 1.4.3

**C-2: Opacity modifiers further reduce contrast**
- Multiple components — `text-muted-foreground/50` yields ≈ 2.3:1. `text-muted-foreground/40` even worse. Used for empty metadata segments, placeholders.
- **Fix:** Use solid colors meeting contrast requirements. Minimum `text-muted-foreground/80` (≈ 3.5:1).
- **WCAG:** 1.4.3

### MEDIUM

**C-3: Placeholder text contrast insufficient**
- `InlineTaskInput.tsx:178`, `SearchModal.tsx:136` — `placeholder:text-muted-foreground/30` yields ≈ 1.5:1.
- **Fix:** Increase to at least 50% opacity.
- **WCAG:** 1.4.3 (informative)

### LOW

**C-4: Disabled state uses `opacity-40`**
- `TaskDueDatePicker.tsx:261-298` — Extremely faint. WCAG exempts disabled elements, but usability concern.
- **Fix:** Use `opacity-50` minimum.

---

## 6. Additional Findings

### MEDIUM

**X-1: `<html>` lacks `lang` attribute**
- `index.html:2` — Screen readers can't determine page language.
- **Fix:** Add `lang="en"`.
- **WCAG:** 3.1.1

**KS-2: Some shortcuts may conflict with VoiceOver**
- `useKeyboardShortcuts.ts` — `Alt+Arrow` overlaps with VO modifier. Single-letter shortcuts conflict with Quick Nav. However, shortcuts only fire when task list is focused, satisfying WCAG 2.1.4.

### HIGH

**E-2: Chat error messages not announced**
- `ChatView.tsx:694-718` — Error div lacks `role="alert"`. Renders outside the `aria-live` region.
- **Fix:** Add `role="alert"`.
- **WCAG:** 4.1.3

### MEDIUM

**E-3: Chat input image error not announced**
- `ChatInput.tsx:235-237` — Error `<p>` has no live region.
- **Fix:** Add `role="alert"`.
- **WCAG:** 4.1.3

**T-1: Multiple task lists create many tab stops**
- `TaskList.tsx:507` — Each list container is `tabIndex={0}`. In Tasks view with 3 lanes, creates many tab stops.
- Acceptable UX since each section is distinct.

### LOW

**E-4: Shortcut recorder errors not announced**
- `SettingsShortcuts.tsx:248-249` — Conflict/validation errors not in live region.
- **Fix:** Add `role="alert"`.

**X-4: Metadata segments only show field name, not value**
- `TaskBody.tsx` — `aria-label="Status"` instead of `aria-label="Status: Active"`.
- **Fix:** Include current value.

---

## Positive Findings

- `prefers-reduced-motion` well-respected throughout (CSS + framer-motion + View Transitions API)
- `useFocusTrap` hook well-implemented and ready for reuse
- Chat message log has `role="log" aria-live="polite" aria-relevant="additions"`
- Streaming indicator uses `role="status"` with `sr-only` text
- Settings error banner uses `role="alert"`
- Hidden file input and TitleBar spacer properly removed from a11y tree
- Keyboard shortcuts are documented and customizable in Settings

---

## Recommended Priority Actions

1. Add focus trap to chat overlay (F-1) — hook exists, apply it
2. Add `aria-live="polite"` to Toast container (S-1) — one-line fix
3. Add `role="alert"` to chat errors (E-2) — one-line fix
4. Add `lang="en"` to `<html>` (X-1) — one-line fix
5. Improve `muted-foreground` contrast values (C-1) — CSS variable change
6. Add ARIA menu roles to task/note action menus (A-3, A-4)
7. Make hover actions keyboard-accessible with `group-focus-within:opacity-100` (K-1, K-2)
8. Add tab semantics to Settings view (A-2)
9. Add combobox pattern to SearchModal (A-6)
