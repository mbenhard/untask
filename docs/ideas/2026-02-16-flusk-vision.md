# Flusk Vision: From Task Manager to Ambient Operator

> What's missing between "good task manager with AI" and "extension of Marcus's working mind."

## The Gap

Flusk today is a **chat-bound task clerk** — it waits for you to open a window, type a sentence, and tell it what to do. The Soul doc says "extension of Marcus's working mind," but the AI only exists when the window is open. Between messages, it's dead.

The transformation: make the AI a **background process that uses the app as its interface**, not a feature inside the app.

---

## Part 1: What's Missing

### 1.1 Proactive Notification Layer

The Live Thought is a static line you see *when you open the app*. But a real assistant doesn't wait for you to check in — it reaches out when something matters.

**What's needed:** Tasteful macOS notifications when state changes matter:
- Invoice crosses 14 days overdue on a $5K task
- Client tagged with high `valueAtRisk` hasn't been touched in 7+ days
- Deadline is tomorrow and task hasn't moved to `in_progress`
- Today list is empty at 9am on a workday

Not noisy. Not every status change. Only when risk, money, or commitments are at stake.

**This is the single highest-impact gap.** The difference between a tool you check and an assistant that watches your back.

### 1.2 Time Capacity Awareness

Tasks have due dates and effort levels, but there's **no model of available hours.** The AI suggests "plan my day" but has no idea if you have 2 hours free or 8.

**What's needed:** Even a simple "hours available today" input that the AI reasons against. The AI should know: "You said this is a `deep` task, and you only marked 3 hours today — this won't fit. Do it tomorrow or clear something else."

Doesn't need full calendar integration — just a daily capacity number that prevents the AI from overloading the today list.

### 1.3 Recurring Tasks

Freelancers run on recurring patterns: weekly client check-ins, monthly invoicing cycles, bi-weekly reviews. There's **no recurrence system at all.**

**What's needed:** Task recurrence (on complete → create next instance) or at minimum, AI-triggered recurring reminders from learned Patterns. The Patterns memory knows "Marcus invoices on Fridays" but can't act on it.

### 1.4 Client Entity (Lightweight)

`client` is a text field on tasks. But freelancers think in terms of client relationships.

**What's needed:** A lightweight client aggregate — not a new table, just a computed view:
```
{ name, totalValueAtRisk, lastTouch, activeTaskCount, overdueInvoices }
```
Aggregated from existing task data. The AI could then say: "Your Hotel Marais exposure is $12K across 3 tasks and you haven't talked to them in 11 days."

### 1.5 Financial Dashboard

`invoiceStatus` and `valueAtRisk` exist on every task but there's **nowhere to see the aggregate picture.** A freelancer's #1 anxiety: "Am I getting paid?"

**What's needed:** A simple cashflow view. Sum of `valueAtRisk` grouped by `invoiceStatus`:
```
$X draft / $Y sent / $Z overdue / $W paid this month
```
One glanceable bar. The AI already has the data — it just needs a surface.

### 1.6 Guided Rituals

The design doc describes two rituals — morning daily plan and weekly review. Neither has a **guided flow.** "Plan my day" is freeform chat. The weekly review is hoping the user remembers.

**What's needed:** Structured ritual modes:
- **Morning:** "Here are your 8 active tasks ranked by urgency. Pick your today list. Here's what I'd suggest." Step-by-step.
- **Weekly:** "You have 4 inbox items. 2 projects made no progress. 1 invoice is 7 days overdue. Let's process each." Guided walkthrough.

### 1.7 Capture Beyond the Keyboard Shortcut

Quick add (`Cmd+Shift+A`) is great when you're at your Mac. But ideas happen everywhere.

**Missing macOS integration points:**
- **Share Sheet** — select text in Safari, share to Flusk → becomes inbox task
- **Services menu** — right-click text in any app → "Send to Flusk"
- **Apple Shortcuts** — "Hey Siri, add a task to Flusk" via Shortcuts.app
- **URL scheme** — `flusk://add?title=...` for Raycast/Alfred/Keyboard Maestro integration

These are cheap to implement and dramatically expand the capture surface.

### 1.8 Blocked-By Tracking

Freelancers are constantly blocked by external things: waiting for client assets, hosting provisioning, contract signatures. The `waiting` status exists but doesn't capture **what or who.**

**What's needed:** A `blockedBy` text field or note on waiting tasks. "Waiting for: assets from Hotel Marais (sent request Feb 10)." The AI could then proactively follow up: "It's been 6 days. Want to nudge them?"

### 1.9 Project Templates from Patterns

The Patterns memory knows "website projects follow: discovery → design → dev → deploy → invoice." But there's no way to **use** that knowledge.

**What's needed:** Template instantiation. "Start a new website project for Client X" → AI scaffolds 5 subtasks automatically from the learned pattern. The data exists — the action doesn't.

### 1.10 macOS Platform Gaps

| Missing | Why it matters |
|---------|---------------|
| Notifications | Deadline warnings, overdue invoices, stale clients |
| Focus Mode awareness | Adapt AI behavior in Work vs Personal focus |
| Widgets | Glanceable today list on Desktop/Notification Center |
| Spotlight integration | Search tasks without opening the app |
| Drag & drop from Finder | Drop a file onto a task to attach context |
| Native share sheet | Capture from Safari, Notes, Mail |

---

## Part 2: Command Palette

The app is "keyboard-first" but there's no command palette. `Cmd+K` opens chat, which means every quick action goes through AI latency. The palette should handle everything that's currently either click-through UI or requires AI chat, but should be instant and local.

### Navigation

| Command | Behavior |
|---------|----------|
| `Go to Today` | Switch to Today view |
| `Go to Projects` | Switch to Projects view |
| `Go to Inbox` | Switch to Inbox view |
| `Go to Settings` | Open settings |
| `Open Scratchpad` | Toggle scratchpad panel |
| `Open Chat` | Open chat overlay |
| `Go to [project name]` | Jump to a specific project (fuzzy search parent tasks) |

### Task Actions (contextual — on selected/focused task)

| Command | Behavior |
|---------|----------|
| `Set status: Active` | Inline status change |
| `Set status: In Progress` | |
| `Set status: Waiting` | |
| `Set status: Done` | |
| `Set status: Inbox` | |
| `Set priority: High / Medium / Low / None` | Cycle or pick |
| `Toggle Today` | Flag/unflag for today |
| `Set due date` | Opens inline date picker in palette |
| `Set due date: Tomorrow` | One-shot |
| `Set due date: Next Monday` | One-shot |
| `Clear due date` | Remove deadline |
| `Set effort: Tiny / Small / Medium / Deep` | |
| `Set client: [name]` | Fuzzy search existing client tags |
| `Move to project: [name]` | Reparent under a parent task |
| `Make standalone` | Remove parent (ungroup from project) |
| `Delete task` | With confirmation |
| `Duplicate task` | Copy with fresh ID |

### Task Creation

| Command | Behavior |
|---------|----------|
| `New task` | Inline title input right in the palette |
| `New task in [project]` | Create subtask under a specific project |
| `New project` | Create a parent task, optionally add subtasks |

### Invoice & Freelancer

| Command | Behavior |
|---------|----------|
| `Set invoice: Draft / Sent / Paid / Overdue` | On selected task |
| `Set value at risk: [amount]` | Inline number input |
| `Mark client touch: Now` | Sets `lastClientTouchAt` to now |
| `Show overdue invoices` | Filter view to overdue invoice tasks |

### Filtering & Search

| Command | Behavior |
|---------|----------|
| `Search tasks` | Full-text search across all tasks |
| `Filter by client: [name]` | Temporary view filter |
| `Filter by status: [status]` | |
| `Filter by priority: High` | |
| `Show overdue` | Filter to past-due tasks |
| `Show waiting` | All tasks in waiting status |
| `Show done this week` | Recent completions |
| `Clear filters` | Reset |

### AI Triggers

| Command | Behavior |
|---------|----------|
| `Plan my day` | Sends to AI, opens chat |
| `Process inbox` | AI walks through inbox items |
| `Improve this task` | Runs `improve_task` on selected task |
| `Weekly review` | Triggers guided weekly ritual |
| `Parse clipboard` | Sends clipboard content to AI for task extraction |
| `Summarize project: [name]` | AI summary of project status |

### App Controls

| Command | Behavior |
|---------|----------|
| `Toggle theme` | Dark/light switch |
| `Set autonomy: Manual / Safe / Autopilot` | |
| `Switch model: [model name]` | Change AI model |
| `Export backup` | Trigger backup |
| `Clear chat history` | With confirmation |
| `Undo last action` | Global undo from task_events |

### Interaction Design Principles

**Context-aware.** If a task is selected/focused, task actions appear at the top. If nothing is selected, navigation and creation dominate. The palette adapts to what you're doing.

**Fuzzy search everything.** Type "kaya high" → matches "Set priority: High" when a Kaya Hotel task is focused, or "Filter by client: Kaya Hotel". Don't force exact command names.

**Recent commands.** Show the last 3-5 commands at the top before the user types. Power users develop muscle memory: `Cmd+K` → `Enter` repeats last action.

**Chained execution.** After completing an action, the palette stays open for 500ms. Chain: `Set priority: High` → `Toggle Today` → `Set due: Tomorrow` → `Esc`. Three actions, never left the keyboard.

**No AI latency for mechanical actions.** Status changes, priority, today flag, due dates — all local, instant. Reserve loading states for AI triggers only.

**Shortcut hints.** Show existing keyboard shortcuts next to commands (`Toggle Today → T`). The palette teaches shortcuts organically.

### What NOT to Put in the Palette

- Task body editing (needs the inline editor)
- Memory/journal browsing (needs scrollable UI)
- Drag reordering (physical gesture)
- Chat conversation (that's the chat overlay)

**Rule:** if it's a single discrete action with a known outcome, it belongs in the palette. If it's exploratory or multi-step, it belongs in a view or AI chat.

---

## Part 3: Transforming the AI

### 3.1 From Reactive to Continuous

Currently the AI runs when you send a message. Between messages, it doesn't exist.

**Transform: a background pulse.** A lightweight loop (every 30-60 min during work hours) that scans state without user input:

- Deadline crossed → queue a notification
- Client untouched for N days with high `valueAtRisk` → surface a nudge
- Today list empty at 9am → push "plan your day?"
- Invoice stuck in `sent` for 14+ days → escalate visibility
- Inbox growing past threshold → suggest processing

No chat needed. No window needed. The AI notices things on its own and reaches you through the tray or a notification.

### 3.2 From Chat to Multi-Surface Output

Currently the AI speaks through one channel — chat messages in a side panel.

**Transform: three output surfaces with different weights.**

| Surface | When | Example |
|---------|------|---------|
| **Tray whisper** | Low-urgency ambient | "3 inbox items waiting" as tooltip |
| **Notification** | Time-sensitive or high-value risk | "Hotel Marais invoice 14 days overdue ($5K)" |
| **Chat** | Complex reasoning, planning, multi-step | "Here's my suggested plan for today..." |

The AI decides which surface based on urgency and complexity. A stale client warning doesn't need a full chat conversation — a one-line notification with an action button ("Snooze / Open task") is enough.

### 3.3 From CRUD to Workflow Orchestration

Currently the AI can create, update, delete, complete individual tasks. Mechanical operations.

**Transform: compound workflow tools.**

| New Tool | What it does |
|----------|-------------|
| `scaffold_project` | Takes client + project type, generates full subtask structure from learned Patterns. "New website for Hotel X" → 5 subtasks auto-created. |
| `rebalance_today` | Looks at today list, effort levels, time remaining, suggests swaps. "This deep task won't fit — swap for these two tiny ones?" |
| `follow_up_sequence` | When a task enters `waiting`, AI schedules check-ins. Day 3: remind. Day 7: suggest nudge. Day 14: escalate. |
| `close_out_project` | When all subtasks done, AI proposes: archive, send final invoice, write journal summary, update client touch. One confirmation closes everything. |
| `morning_brief` | Structured 60-second brief: what's hot, what shifted overnight, what the AI recommends, what it already handled on autopilot. |
| `weekly_close` | Guided ritual: process inbox → review each project → flag overdue → update invoices → set next week's priorities. Step by step. |

The difference: instead of "do this one thing," the AI orchestrates sequences that match how freelancers actually work.

### 3.4 From Memory Storage to Memory Reasoning

Currently memory layers (Profile, Patterns, Journal) are injected into the system prompt as context. The AI reads them passively.

**Transform: active reasoning over memory.**

**Pattern detection.** After 3 similar projects, the AI proposes a Pattern entry: "I've noticed your hotel projects always follow the same 5 steps. Should I save this as a template?" The tool exists but no trigger logic does.

**Contradiction detection.** If Profile says "works best in mornings" but Journal shows most completions happen after 3pm for two weeks, the AI flags: "Your profile says mornings are best, but you've been shipping more in afternoons. Update?"

**Temporal memory.** The AI should know what last Monday looked like vs this Monday. "Last week you completed 12 tasks. You're at 3 by Wednesday — slower than usual. Blocked on something?" This requires computing over Journal entries, not just including them as text.

**Cross-referencing.** Connect client patterns with task patterns. "Every time you work with Hotel Marais, the review phase takes twice as long. Flag extra buffer next time?"

### 3.5 From Single-Turn to Ongoing Commitments

Currently every chat message is a fresh request-response. The AI has no concept of "I told you I'd do something."

**Transform: let the AI make and track commitments.**

- "Remind me to invoice Hotel Marais on Friday." → The AI **actually does it** on Friday, not just writes a journal entry.
- "Check back on this in 3 days." → AI schedules a follow-up nudge.
- After suggesting a daily plan, AI checks in at end of day: "You planned 5, completed 3. Carry the other 2 forward?"

**Implementation:** A `scheduled_actions` table — things the AI promised to do at a future time. Not tasks (those are the user's). These are the AI's own commitments.

```
scheduled_actions {
  id: uuid
  type: 'reminder' | 'follow_up' | 'check_in' | 'escalation'
  triggerAt: datetime
  payload: json (task reference, message, action to take)
  status: 'pending' | 'fired' | 'dismissed'
  createdAt: datetime
}
```

The background pulse (3.1) checks this table every cycle and fires due actions.

### 3.6 From Text-Only to Structured Intelligence

Currently the AI outputs chat messages with inline action cards.

**Transform: structured output modes beyond prose.**

**Dashboard data.** Instead of writing "you have 3 overdue items," the AI populates a structured widget:
```json
{ "overdue": 3, "todayProgress": "4/7", "topRisk": "Hotel Marais invoice" }
```
The UI renders this as a glanceable card, not a chat message.

**Decision prompts.** Instead of "what do you want to do?", the AI presents structured choices:
```json
["Move to today", "Snooze 3 days", "Delegate to client"]
```
Rendered as buttons. Faster than typing a response.

**Progress arcs.** For projects, the AI generates a progress model:
```json
{
  "phase": "development",
  "completion": 0.6,
  "blockers": ["waiting for assets"],
  "estimatedDone": "Feb 28"
}
```
Shown as a progress bar on the project card, not buried in chat.

### 3.7 From Generic LLM to Calibrated Operator

Currently the AI uses whatever model is selected with a generic system prompt.

**Transform: calibrate the AI's judgment over time.**

**Confidence tracking.** When the AI suggests a plan and the user rejects most of it, that's signal. Track acceptance rate per tool, per action type. If `improve_task` suggestions are ignored 80% of the time, reduce aggressiveness.

**Priority calibration.** The AI ranks tasks by urgency/impact. When the user consistently picks different items for today, the AI should learn the user's real priority function — not the theoretical one.

**Tone calibration.** The Soul says "push gently but consistently." But what's gentle for Marcus? If he always dismisses nudges about invoicing, the AI should escalate format (notification instead of live thought), not repeat the same message louder.

---

## Part 4: The Core Shift

### In One Sentence

Stop treating the AI as a feature inside the app and start treating it as a **background process that uses the app as its interface.**

### The Architecture

```
Background AI Process (main process loop)
├── State Scanner (30-60 min cycle)
│   ├── Check deadlines, staleness, invoice aging
│   ├── Check scheduled_actions table
│   └── Generate proactive outputs
├── Output Router
│   ├── Tray whisper (low urgency)
│   ├── Notification (high urgency / money risk)
│   └── Chat message (complex / needs response)
├── Commitment Tracker
│   ├── Reminders
│   ├── Follow-ups
│   └── End-of-day check-ins
└── Calibration Engine
    ├── Acceptance rate tracking
    ├── Priority function learning
    └── Tone adjustment
```

The app is the AI's hands. The tray is its voice. Notifications are its tap on the shoulder. Chat is for when you want to sit down and think together. The AI doesn't live in the chat panel — it lives in the main process, running on a loop, watching state, keeping commitments, and surfacing the right thing at the right moment through the right channel.

### Priority Order for Implementation

1. **Background pulse + notifications** (highest impact, enables everything else)
2. **Scheduled actions table + commitment tracking** (the AI can keep promises)
3. **Command palette** (makes the app truly keyboard-first)
4. **Compound workflow tools** (scaffold, rebalance, close-out)
5. **Guided rituals** (morning brief, weekly review)
6. **Structured output modes** (dashboard data, decision prompts)
7. **Memory reasoning** (pattern detection, contradiction detection)
8. **Calibration engine** (acceptance tracking, priority learning)
9. **macOS platform integration** (share sheet, shortcuts, widgets)
10. **Financial dashboard** (cashflow view)
