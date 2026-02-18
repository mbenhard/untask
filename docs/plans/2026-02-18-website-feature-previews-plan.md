# Website Feature Previews — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace text-only Philosophy/Features sections with 1:1 CSS recreations of Chat, Task Detail, Notes, and Inbox views. Add a Download section at the bottom. Slim down the Hero.

**Architecture:** Each preview is a standalone Astro component using the same window frame pattern as the existing AppPreview. All styling is copied 1:1 from real app components. Chat preview has vanilla JS interactivity. Download section anchored from the Hero.

**Tech Stack:** Astro 5.2, Tailwind v4, vanilla JS (no React — matches existing site patterns)

---

### Task 1: Slim down Hero.astro

**Files:**
- Modify: `website/src/components/Hero.astro`

**Step 1: Remove brew command button**

Delete the entire `<button onclick="copyInstall(this)"...>` block (lines 64-77 in current file) and the `copyInstall` function from the inline script.

**Step 2: Change download button href**

Change:
```html
<a href="https://github.com/mbenhard/untask/releases/latest" ...>
  Download for macOS
</a>
```
To:
```html
<a href="#download" ...>
  Download for macOS
</a>
```

**Step 3: Verify**

Run: `cd /Users/marcusbenhard/Development/untitled/website && pnpm dev`
Check: Hero shows bird, name, tagline, two buttons (Download scrolls down, GitHub opens external), MIT badge, scroll hint. No brew command.

**Step 4: Commit**

```
feat(website): slim hero, move download CTA to anchor
```

---

### Task 2: Create Download.astro

**Files:**
- Create: `website/src/components/Download.astro`

**Step 1: Create the component**

This is a new centered section with `id="download"`. Content: mono label "Get Untask", heading, subtitle, two buttons (actual download link + GitHub), brew command with copy, MIT badge.

```astro
---
// Download section — full CTA at bottom of page
---

<section id="download" class="px-6 py-24 sm:py-32">
  <div class="mx-auto flex max-w-2xl flex-col items-center text-center">

    <h2 class="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
      Get Untask
    </h2>

    <p class="mt-6 text-2xl font-normal tracking-tight text-foreground">
      Untask
    </p>

    <p class="mt-3 text-[15px] text-muted-foreground">
      Free, open source, runs on your Mac.
    </p>

    <div class="mt-8 flex items-center gap-2.5">
      <a
        href="https://github.com/mbenhard/untask/releases/latest"
        class="inline-flex h-8 items-center rounded-md bg-primary px-4 text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-80"
      >
        Download for macOS
      </a>
      <a
        href="https://github.com/mbenhard/untask"
        class="inline-flex h-8 items-center rounded-md border border-border px-4 text-[12px] font-medium text-foreground transition-colors hover:bg-accent"
      >
        GitHub
      </a>
    </div>

    <button
      onclick="copyBrewInstall(this)"
      class="group mt-4 inline-flex h-7 cursor-pointer items-center gap-2 rounded-md border border-border/40 px-3 font-mono text-[11px] text-muted-foreground/70 transition-colors hover:border-border hover:text-foreground"
      aria-label="Copy install command"
    >
      <span>brew install mbenhard/untask/untask</span>
      <svg class="copy-icon size-3 shrink-0 opacity-40 transition-opacity group-hover:opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
        <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
      </svg>
      <svg class="copy-check hidden size-3 shrink-0 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </button>

    <p class="mt-2.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground/50">
      MIT Licensed &middot; macOS only
    </p>

  </div>
</section>

<script is:inline>
  function copyBrewInstall(btn) {
    navigator.clipboard.writeText('brew install mbenhard/untask/untask').then(function() {
      var copyIcon = btn.querySelector('.copy-icon');
      var checkIcon = btn.querySelector('.copy-check');
      copyIcon.classList.add('hidden');
      checkIcon.classList.remove('hidden');
      setTimeout(function() {
        copyIcon.classList.remove('hidden');
        checkIcon.classList.add('hidden');
      }, 1500);
    });
  }
</script>
```

**Step 2: Verify**

Check: section renders centered, brew copy works, buttons link correctly, `#download` anchor scrolls here from Hero.

**Step 3: Commit**

```
feat(website): add Download section with brew command
```

---

### Task 3: Create ChatPreview.astro

**Files:**
- Create: `website/src/components/ChatPreview.astro`

**Reference components (copy styling 1:1 from):**
- `untask/src/renderer/components/layout/TitleBar.tsx` — header with traffic lights + nav tabs
- `untask/src/renderer/components/layout/AppShell.tsx:326-418` — chat overlay panel structure
- `untask/src/renderer/components/chat/ChatView.tsx:304-325` — EmptyState (bird mascot + suggestions)
- `untask/src/renderer/components/chat/ChatView.tsx:488-599` — message bubbles (user + assistant)
- `untask/src/renderer/components/chat/ChatView.tsx:142-243` — ToolStep card
- `untask/src/renderer/components/chat/ChatView.tsx:269-292` — ChipBar
- `untask/src/renderer/components/layout/ChatInput.tsx:197-301` — input footer
- `untask/src/renderer/components/chat/BirdMascot.tsx` — bird SVG paths

**Step 1: Create the component with all HTML/CSS**

Structure:
1. Section label + subtitle above the window frame
2. Full app window frame (same `rounded-xl border` as AppPreview)
3. TitleBar with "Today" active tab
4. Content area with simplified task list on the left
5. Chat overlay panel positioned `absolute inset-y-3 right-3`
6. Chat panel has two states: `#chat-empty` (initial) and `#chat-conversation` (hidden initially)
7. Bottom bar with Settings + theme toggle + Chat pill

**Chat empty state content:**
- Bird mascot SVG (same paths from BirdMascot.tsx HeadSvg + FeetSvg)
- Text: "Your personal assistant. Asks before acting, double-checks risky changes, and remembers what matters — even after chats are cleared."
- 3 suggestion chips: "Create a task", "What's due today?", "Summarize my week"

**Chat conversation state content:**
- User bubble: "Create a task: Review quarterly report"
- Assistant message with bird avatar icon: "I'll create that task for you."
- Tool action card: green check + "Created task: Review quarterly report" + Undo button
- Suggestion chips: "Add a due date", "Set priority to high"

**Chat input footer:**
- Paperclip icon button
- Textarea placeholder "Ask Untask..."
- Arrow-up send button

**Key CSS to add (inline `<style>`):**
```css
.thinking-shimmer {
  background: linear-gradient(90deg, var(--muted-foreground) 0%, var(--foreground) 40%, var(--muted-foreground) 80%);
  background-size: 250% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  opacity: 0.4;
  animation: thinking-shimmer 2.8s ease-in-out infinite;
}
@keyframes thinking-shimmer {
  0%   { background-position: 100% 0; }
  100% { background-position: -100% 0; }
}
```

**Step 2: Add vanilla JS interaction**

```js
function activateChat() {
  // Hide empty state
  document.getElementById('chat-empty').style.display = 'none';
  // Show thinking shimmer
  var thinking = document.getElementById('chat-thinking');
  thinking.style.display = 'block';
  // After 800ms, hide thinking + show conversation
  setTimeout(function() {
    thinking.style.display = 'none';
    document.getElementById('chat-conversation').style.display = 'flex';
  }, 800);
}
```

Attach `onclick="activateChat()"` to each suggestion chip.

**Step 3: Verify**

Check: window frame matches AppPreview exactly, chat panel matches real app, clicking suggestion chip shows thinking then conversation, tool card has green check + undo, all typography matches.

**Step 4: Commit**

```
feat(website): add 1:1 chat preview section
```

---

### Task 4: Create TaskDetailPreview.astro

**Files:**
- Create: `website/src/components/TaskDetailPreview.astro`

**Reference components (copy styling 1:1 from):**
- `untask/src/renderer/components/layout/TitleBar.tsx` — header
- `untask/src/renderer/components/tasks/SectionGroup.tsx:83-144` — section wrapper
- `untask/src/renderer/components/tasks/TaskItem.tsx:181-511` — task row (checkbox, priority dot, title, badges, icons)
- `untask/src/renderer/components/tasks/TaskBody.tsx:516-581` — MetadataLine
- `untask/src/renderer/components/tasks/TaskBody.tsx:687-737` — expanded body wrapper

**Step 1: Create the component**

Structure:
1. Section label "Task Detail" + subtitle "Due dates, priorities, recurrence, subtasks — all inline."
2. Window frame with TitleBar ("Today" active)
3. SectionGroup "Today" with count "3" and + button
4. Three task rows inside:

**Task 1 (completed):**
- Solid circle with check, `bg-foreground/15` priority dot, "Ship landing page" with `line-through text-muted-foreground`, date badge "Feb 18", unfilled bookmark, chevron, grip dots

**Task 2 (expanded, with subtasks):**
- Dashed circle, amber `bg-amber-500` priority dot, "Prepare client presentation", date badge "Feb 20", filled bookmark, chevron (down since expanded), grip dots
- Expanded body (border-top border-border/30):
  - Text zone (px-3 py-3): paragraph "Deck needs to cover Q1 results and Q2 roadmap. Check with finance for updated numbers." then bullet list: "Revenue slide — pull from dashboard", "Roadmap timeline — ask product team", "Customer quotes — marketing folder"
  - MetadataLine: `font-mono text-[11px] text-muted-foreground` — `Feb 20` · amber dot + `Med` · `weekly` · `Active` · `Acme Corp` · paperclip + `1` · `2 subtasks` — separated by `·` in `text-border`
- **2 subtask rows** indented with extra left padding:
  - "Draft slide outline" — completed (solid circle, strikethrough, muted)
  - "Collect Q1 metrics" — active (dashed circle), no priority

**Task 3 (active):**
- Dashed circle, rose `bg-rose-500` priority dot, "Write API documentation", no date badge, unfilled bookmark, chevron, grip dots

5. Bottom bar: Settings + theme toggle + Chat pill

**Step 2: Verify**

Check: task rows match real TaskItem exactly, expanded body matches TaskBody, metadata toolbar has all segments with correct styling, subtasks show indented.

**Step 3: Commit**

```
feat(website): add 1:1 task detail preview section
```

---

### Task 5: Create NotesPreview.astro

**Files:**
- Create: `website/src/components/NotesPreview.astro`

**Reference components (copy styling 1:1 from):**
- `untask/src/renderer/components/layout/TitleBar.tsx` — header with "Notes" active
- `untask/src/renderer/components/notes/NoteEditor.tsx:189-276` — editor layout (header + body)

**Step 1: Create the component**

Structure:
1. Section label "Notes" + subtitle "Freeform writing with AI processing built in."
2. Window frame with TitleBar ("Notes" active)
3. NoteEditor layout:

**Header bar (flex items-center gap-2 px-3 py-2):**
- Back arrow button: ghost style, `size-14` ArrowLeft icon, `text-muted-foreground`
- Title input: "Weekly planning — Feb 17" in `text-[13px] font-medium text-foreground bg-transparent`
- Right side:
  - "process" button: sparkles icon (12px) + "process" text, `h-6 gap-1 px-1.5 text-[11px] text-muted-foreground` ghost
  - "archive" button: archive icon (12px) + "archive" text, same styling

**Editor body (min-h-0 flex-1 overflow-y-auto, with padding matching real BlockNote editor):**

Static HTML styled to match BlockNote output. Use the app's editor class patterns:
- Heading: `<h3>` "Priorities this week" — bold, sized to match BlockNote h3
- Bullet list with 3 items:
  - "Finalize Q1 report and send to stakeholders"
  - "Review hiring pipeline with Sarah"
  - "Ship v0.1.3 patch for the sync bug"
- Paragraph: "Need to block Wednesday afternoon for deep work on the architecture doc. No meetings."
- Checkbox list:
  - [x] "Book flight for March conference" — checked styling (strikethrough or muted matching BlockNote)
  - [ ] "Update team on roadmap changes" — unchecked

4. Bottom bar: Settings + theme toggle + Chat pill

**Step 2: Verify**

Check: header matches NoteEditor exactly, editor content looks like BlockNote output, sparkles/archive buttons match real app.

**Step 3: Commit**

```
feat(website): add 1:1 notes preview section
```

---

### Task 6: Create InboxPreview.astro

**Files:**
- Create: `website/src/components/InboxPreview.astro`

**Reference components (copy styling 1:1 from):**
- `untask/src/renderer/components/layout/TitleBar.tsx` — header with "Inbox" active
- `untask/src/renderer/components/views/InboxView.tsx` — page layout
- `untask/src/renderer/components/tasks/SectionGroup.tsx` — section wrapper
- `untask/src/renderer/components/tasks/TaskItem.tsx` — task rows (minimal state)

**Step 1: Create the component**

Structure:
1. Section label "Inbox" + subtitle "Capture first, organize later."
2. Window frame with TitleBar ("Inbox" active)
3. SectionGroup "Inbox" with chevron rotated, count "4", + button
4. Task list (border-t, px-1 py-1) with 4 items:

All tasks are inbox status — minimal UI: dashed circle checkbox, `bg-foreground/15` priority dot (none), title in `text-[13px] text-foreground`, unfilled bookmark, chevron, grip dots. No date badges, no subtask counts.

- "Call dentist to reschedule"
- "Look into new project management tool"
- "Birthday gift for Sarah"
- "Research flights to Tokyo" (last item, no bottom border)

5. Bottom bar: Settings + theme toggle + Chat pill

**Step 2: Verify**

Check: task rows match TaskItem in inbox state (no metadata), section group matches exactly, everything is minimal/clean.

**Step 3: Commit**

```
feat(website): add 1:1 inbox preview section
```

---

### Task 7: Wire up index.astro

**Files:**
- Modify: `website/src/pages/index.astro`

**Step 1: Update imports and page composition**

```astro
---
import Base from '../layouts/Base.astro';
import Hero from '../components/Hero.astro';
import AppPreview from '../components/AppPreview.astro';
import ChatPreview from '../components/ChatPreview.astro';
import TaskDetailPreview from '../components/TaskDetailPreview.astro';
import NotesPreview from '../components/NotesPreview.astro';
import InboxPreview from '../components/InboxPreview.astro';
import Download from '../components/Download.astro';
import TechStack from '../components/TechStack.astro';
import Footer from '../components/Footer.astro';
---

<Base>
  <main>
    <Hero />
    <AppPreview />
    <ChatPreview />
    <TaskDetailPreview />
    <NotesPreview />
    <InboxPreview />
    <Download />
    <TechStack />
    <Footer />
  </main>
</Base>
```

Remove Philosophy and Features imports.

**Step 2: Verify full page flow**

Run: `cd /Users/marcusbenhard/Development/untitled/website && pnpm dev`

Check the full scroll:
1. Hero — bird, name, tagline, Download anchors down, GitHub external
2. Today preview — existing interactive tasks + dock
3. Chat preview — overlay panel, click chip → thinking → conversation
4. Task Detail — expanded task with subtasks + metadata toolbar
5. Notes — full editor with rich content
6. Inbox — clean capture list
7. Download — full CTA with brew command
8. TechStack — spec sheet
9. Footer — links

**Step 3: Commit**

```
feat(website): wire up all preview sections, remove Philosophy/Features
```

---

### Task 8: Final review and polish

**Step 1: Cross-check all previews against real app**

Open the Untask app side-by-side with the website. Compare pixel-by-pixel:
- TitleBar: traffic lights position, tab styling, spacing
- TaskItem: checkbox size, priority dot size, font sizes, icon sizes, gap spacing
- Chat panel: border radius, shadow, backdrop blur, header height
- NoteEditor: header layout, button sizes, editor padding
- Typography: all `font-mono text-[11px]`, `text-[13px]`, `text-[12px]` match

**Step 2: Test theme toggle**

Verify all previews look correct in both dark and light mode. The theme toggle in the existing AppPreview controls the site theme — all new previews should inherit from CSS custom properties automatically.

**Step 3: Test responsive behavior**

Check at narrow widths (375px mobile). The chat panel uses `calc(100vw - 24px)` max — verify it doesn't overflow. All other previews should be readable at mobile widths.

**Step 4: Commit**

```
chore(website): final polish on preview sections
```
