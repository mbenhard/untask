# Website Feature Previews — Design

## Summary

Replace the text-only Philosophy and Features card grids with 1:1 CSS recreations of each major app view. Every preview is a pixel-perfect copy of the real Untask UI, inside a macOS window frame (same as the existing AppPreview). Move the download CTA to a dedicated section at the bottom so users scroll through the full product tour first.

## Page Flow

```
Hero (slimmed — download button anchors to #download)
  ↓
AppPreview (existing — Today view + Dock)
  ↓
ChatPreview (new)
  ↓
TaskDetailPreview (new)
  ↓
NotesPreview (new)
  ↓
InboxPreview (new)
  ↓
Download (new — full CTA with brew command, direct download, GitHub)
  ↓
TechStack (keep as-is)
  ↓
Footer (keep as-is)
```

**Removed:** Philosophy.astro, Features.astro — replaced by the previews themselves.

Simple vertical scroll. No animations, no fade-ins. Each section uses the same `px-6 py-24 sm:py-32` spacing and `max-w-2xl` container as the existing AppPreview.

Each new preview section gets a small mono label above the window frame: `font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground`, plus a one-line subtitle in `text-[13px] text-muted-foreground` to give just enough context without requiring reading.

## Hero Changes

**Remove from Hero:**
- Brew command button (`brew install mbenhard/untask/untask`)

**Change in Hero:**
- "Download for macOS" button: change `href` from GitHub releases URL to `#download` (smooth scroll anchor)
- "GitHub" button: stays as external link to `https://github.com/mbenhard/untask`

**Hero keeps:** Bird mascot, version badge, "Untask" heading, tagline, both buttons, "MIT Licensed · macOS only", scroll hint.

## Preview 1: ChatPreview.astro

**Label:** "AI Assistant"
**Subtitle:** "Manages tasks, answers questions, asks before acting."

**What it shows:** The chat overlay panel as it appears in the app — docked to the right side of the window.

**Layout:** Full app window frame (TitleBar with "Today" active + content area). The main content area shows the Today view (simplified — reuse a couple tasks from existing AppPreview). The chat overlay panel is open on the right side, exactly as it appears in AppShell.tsx.

**Chat panel structure (1:1 from AppShell + ChatView):**
- Header: dashed bottom border, "New Thread" label with back arrow, X close button
- Body — hybrid interaction:
  1. **Initial state:** Empty state with bird mascot SVG (36px), description text ("Your personal assistant. Asks before acting, double-checks risky changes, and remembers what matters — even after chats are cleared."), and 3 suggestion chips ("Create a task", "What's due today?", "Summarize my week") — exact copy of ChatView EmptyState
  2. **On suggestion chip click:** Transitions to a pre-written conversation:
     - User bubble (right-aligned, `rounded-xl border border-border/70 bg-secondary px-3 py-2 text-sm`): "Create a task: Review quarterly report"
     - "Thinking..." shimmer appears briefly (~0.8s)
     - Assistant message (left-aligned, bird avatar icon 16px + `rounded-xl border border-border bg-card/80 px-3 py-2 text-sm`): "I'll create that task for you."
     - Tool action card (`rounded-md border border-border/60 bg-card/40 px-2.5 py-1.5 text-xs`): green checkmark icon, "Created task: Review quarterly report", "Undo" button (outline, xs)
     - Suggestion chips below: "Add a due date", "Set priority to high" — `rounded-full border border-border/60 px-2.5 py-1 text-xs`
- Footer: Chat input with paperclip icon, textarea placeholder "Ask Untask...", arrow-up send button — exact copy of ChatInput layout

**Panel styling (from AppShell.tsx line 337):**
- `width: min(clamp(340px, 30vw, 460px), calc(100vw - 24px))`
- `rounded-xl border border-border/70 bg-card/90 shadow-[0_8px_20px_-14px_rgba(0,0,0,0.6)] backdrop-blur-sm`
- Positioned `absolute inset-y-3 right-3`

## Preview 2: TaskDetailPreview.astro

**Label:** "Task Detail"
**Subtitle:** "Due dates, priorities, recurrence, subtasks — all inline."

**What it shows:** A task expanded in the Today view, showing the rich body editor and full metadata toolbar.

**Layout:** App window frame (TitleBar with "Today" active). Content area shows a SectionGroup "Today" with 3 tasks. The second task is expanded.

**Task list:**
1. "Ship landing page" — completed (solid circle, checkmark, strikethrough, muted text), "Feb 18" date badge
2. "Prepare client presentation" — active, amber priority dot, "Feb 20" date badge, bookmark filled, **expanded** (see below)
3. "Write API documentation" — active, rose priority dot, no date badge

**Expanded task body (1:1 from TaskBody.tsx):**
- Border-top border-border/30
- Rich text content zone (px-3 py-3): Static HTML styled to match BlockNote output — a short paragraph ("Deck needs to cover Q1 results and Q2 roadmap. Check with finance for updated numbers.") and a bullet list ("Revenue slide — pull from dashboard", "Roadmap timeline — ask product team", "Customer quotes — marketing folder")
- Metadata toolbar (1:1 from MetadataLine):
  - `font-mono text-[11px] text-muted-foreground`, items separated by `·` (MetaDot)
  - Segments: `Feb 20` · amber dot + `Med` · `weekly` · `Active` · `Acme Corp` · paperclip icon + `1` · `2 subtasks`

**Subtasks visible below expanded task:**
- 2 nested rows at one indentation level (left padding to indicate nesting)
- Subtask 1: "Draft slide outline" — completed (solid circle, strikethrough)
- Subtask 2: "Collect Q1 metrics" — active, no priority dot

**Bottom bar:** Settings icon + theme toggle + Chat pill (same as existing AppPreview).

## Preview 3: NotesPreview.astro

**Label:** "Notes"
**Subtitle:** "Freeform writing with AI processing built in."

**What it shows:** The full-screen note editor view.

**Layout:** App window frame (TitleBar with "Notes" active). Content area shows the NoteEditor component full-width.

**Editor view (1:1 from NoteEditor.tsx):**
- Header bar (flex items-center gap-2 px-3 py-2):
  - Back arrow button (ghost icon-xs, muted-foreground)
  - Title input: "Weekly planning — Feb 17" (`text-[13px] font-medium text-foreground`, bg-transparent, no border)
  - Right side actions:
    - "process" button with sparkles icon (`h-6 gap-1 px-1.5 text-[11px] text-muted-foreground`, ghost)
    - "archive" button with archive icon (same styling)
- Editor body (min-h-0 flex-1, px and py matching real editor):
  - Pre-written rich text content styled to match BlockNote output:
    - Heading: "Priorities this week" (bold, slightly larger)
    - Bullet list:
      - "Finalize Q1 report and send to stakeholders"
      - "Review hiring pipeline with Sarah"
      - "Ship v0.1.3 patch for the sync bug"
    - Paragraph: "Need to block Wednesday afternoon for deep work on the architecture doc. No meetings."
    - Checkbox list:
      - [x] "Book flight for March conference" (checked, with strikethrough or muted styling matching BlockNote)
      - [ ] "Update team on roadmap changes"

**Bottom bar:** Settings icon + theme toggle + Chat pill.

## Preview 4: InboxPreview.astro

**Label:** "Inbox"
**Subtitle:** "Capture first, organize later."

**What it shows:** The Inbox view with the capture-first workflow.

**Layout:** App window frame (TitleBar with "Inbox" active). Content area shows the InboxView.

**Inbox content (1:1 from InboxView.tsx + SectionGroup + TaskItem):**
- SectionGroup header: chevron (rotated 90deg), "Inbox" label (`text-[12px] font-medium`), count "4", add button (+)
- Border-top, then task list (px-1 py-1):
  1. "Call dentist to reschedule" — dashed circle, no priority dot (bg-foreground/15), no metadata badges, bookmark (unfilled), chevron, grip dots
  2. "Look into new project management tool" — same minimal style
  3. "Birthday gift for Sarah" — same
  4. "Research flights to Tokyo" — same (last item, no bottom border)
- All items use `text-[13px] text-foreground` for title, no dates, no subtask counts — pure capture state

**Bottom bar:** Settings icon + theme toggle + Chat pill.

## New Section: Download.astro

**Placement:** After InboxPreview, before TechStack.

**Layout:** Same `px-6 py-24 sm:py-32` spacing, `max-w-2xl` container, centered.

**Content:**
- Section label: `font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground` — "Get Untask"
- Heading: "Untask" in `text-2xl font-normal tracking-tight` or similar (smaller than hero)
- Subtitle: "Free, open source, runs on your Mac." in `text-[15px] text-muted-foreground`
- Two buttons (same style as current hero buttons):
  - "Download for macOS" — `bg-primary text-primary-foreground` → links to `https://github.com/mbenhard/untask/releases/latest`
  - "GitHub" — `border border-border text-foreground` → links to `https://github.com/mbenhard/untask`
- Brew command (copied from current hero): `brew install mbenhard/untask/untask` — copyable pill with clipboard icon
- "MIT Licensed · macOS only" — `font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground/50`

**Anchor:** `id="download"` on the section element, so the hero button scrolls here.

## Interaction Summary

| Preview | Interactive? | Behavior |
|---------|-------------|----------|
| Today (existing) | Yes | Task toggle checkboxes, theme toggle |
| Chat | Yes | Click suggestion chip → reveals conversation with shimmer |
| Task Detail | No | Static expanded state with subtasks |
| Notes | No | Static editor content |
| Inbox | No | Static task list |
| Download | Yes | Copy brew command |

## Implementation Notes

- Each preview is a standalone `.astro` component in `src/components/`
- All styling must be copied 1:1 from the real app components — reference the actual React component files
- Use the same CSS custom properties already defined in global.css
- The window frame (rounded-xl border, traffic lights, nav tabs) should be consistent across all previews — the active tab changes per preview
- Chat interaction uses vanilla JS in `<script is:inline>` blocks (same pattern as existing AppPreview)
- No framework dependencies — pure HTML/CSS/JS in Astro components
- Hero smooth scroll: add `scroll-behavior: smooth` to html or use JS `scrollIntoView({ behavior: 'smooth' })`

## File Changes Summary

| Action | File |
|--------|------|
| Edit | `src/pages/index.astro` — new component imports, remove Philosophy/Features |
| Edit | `src/components/Hero.astro` — remove brew command, change download href to `#download` |
| Create | `src/components/ChatPreview.astro` |
| Create | `src/components/TaskDetailPreview.astro` |
| Create | `src/components/NotesPreview.astro` |
| Create | `src/components/InboxPreview.astro` |
| Create | `src/components/Download.astro` |
| Keep | `src/components/AppPreview.astro` (no changes) |
| Keep | `src/components/TechStack.astro` (no changes) |
| Keep | `src/components/Footer.astro` (no changes) |
| Remove from index | Philosophy.astro, Features.astro (files can stay, just unused) |
