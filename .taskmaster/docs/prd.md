# Flusk - Design Document

AI-powered task management desktop app for solo freelancers. One frictionless surface for capture, planning, and execution. Monochrome, minimal, keyboard-first. Built with Electron.

## Problem

Solo freelancers juggle 5-8 client projects with no clear system. Tasks are vague, priorities are unclear, personal and work mix together. Existing tools are either too heavy (Notion, Linear, Asana) or too light (Apple Reminders, Craft Tasks). None have a conversational AI that can manage tasks for you.

## Solution

A compact floating desktop app that combines a clean task manager with an AI assistant. The AI can create, edit, delete, and organize tasks through natural conversation. The app lives in the menu bar, summoned with a global shortcut. Capture, planning, and execution happen in one command surface instead of separate modes or apps.

## Core Workflow

Three zones:

- **Inbox**: Raw capture. Unprocessed items with no project or date. Where quick-captured items land.
- **Projects**: Tasks that have subtasks (auto-detected). Grouped by parent task. Each shows progress.
- **Today**: The sacred list. Default target is 3-5 focus items, but flexible when workload demands more or fewer.

Two rituals:

- **Morning (5 min)**: Open Flusk, ask AI "plan my day" or manually pick today's items.
- **Weekly (15 min)**: Process inbox, review projects, archive completed work.

## Data Model

### Everything is a task

No separate "project" entity. A task with subtasks is a project. A task without subtasks is standalone. One level of nesting only.

### Tables

**`tasks`**

| Field | Type | Purpose |
|-------|------|---------|
| `id` | string (uuid) | Primary key |
| `parentId` | string or null | If set, this is a subtask. One level only. |
| `title` | string | Task name |
| `body` | string or null | Markdown content (context, notes, details) |
| `status` | enum | `inbox`, `active`, `in_progress`, `done` |
| `priority` | enum | `none`, `low`, `medium`, `high` |
| `today` | boolean | Flagged for today's focus list |
| `client` | string or null | Auto-tagged by AI (e.g., "Kaya Hotel") |
| `dueDate` | date or null | Optional deadline |
| `dueType` | enum or null | `hard` or `soft` (flexible) deadline semantics |
| `effort` | enum | `unknown`, `tiny`, `small`, `medium`, `deep` (optional hint, never required) |
| `invoiceStatus` | enum or null | `none`, `draft`, `sent`, `paid`, `overdue` |
| `valueAtRisk` | number or null | Approximate money tied to finishing this task |
| `lastClientTouchAt` | datetime or null | Last meaningful client contact |
| `order` | number | Sort position within its context |
| `createdAt` | datetime | Auto |
| `completedAt` | datetime or null | When marked done |

**`scratchpad`**

| Field | Type | Purpose |
|-------|------|---------|
| `id` | string | Always one row |
| `content` | string | Markdown content |
| `updatedAt` | datetime | Auto |

**`chat_messages`**

| Field | Type | Purpose |
|-------|------|---------|
| `id` | string | Primary key |
| `role` | enum | `user`, `assistant` |
| `content` | string | Message text |
| `toolCalls` | json or null | AI actions taken (task created, etc.) |
| `createdAt` | datetime | Auto |

**`task_events`**

| Field | Type | Purpose |
|-------|------|---------|
| `id` | string (uuid) | Primary key |
| `taskId` | string | Task affected |
| `action` | enum | `create`, `update`, `move`, `complete`, `delete` |
| `before` | json or null | Snapshot before mutation |
| `after` | json or null | Snapshot after mutation |
| `source` | enum | `user` or `ai` |
| `createdAt` | datetime | Auto |

**`ai_journal`**

| Field | Type | Purpose |
|-------|------|---------|
| `id` | string (uuid) | Primary key |
| `content` | string | AI's observation or note |
| `category` | enum | `pattern`, `progress`, `preference`, `summary` |
| `createdAt` | datetime | Auto |

**`settings`**

| Field | Type | Purpose |
|-------|------|---------|
| `key` | string | Setting name |
| `value` | string | Setting value (JSON stringified) |

### Completed work

- Completed tasks persist forever, hidden from active views.
- Searchable via search or AI ("What did I do for Kaya Hotel last year?").
- No archive/unarchive flow. Done items just move to a "Done" section.
- All mutations are logged in `task_events` for global undo and audit.

## Tech Stack

| Layer | Choice |
|-------|--------|
| Shell | Electron + Electron Forge (Vite plugin) |
| Renderer | React 19 + TypeScript |
| Styling | Tailwind v4 + shadcn/ui |
| Database | better-sqlite3 + Drizzle ORM |
| AI | Vercel AI SDK + OpenRouter (OpenAI-compatible) |
| State | Zustand |
| Animations | Framer Motion |
| Icons | Lucide React |
| Font | Inter |

### AI Models (via OpenRouter)

Three models to test, selectable in settings:

| Model | Input cost | Output cost |
|-------|-----------|-------------|
| minimax/minimax-m2.5 | $0.30/M | $1.20/M |
| moonshotai/kimi-k2.5 | $0.45/M | $2.80/M |
| z-ai/glm-5 | TBD | TBD |

Default: minimax-m2.5 (cheapest).

### OpenRouter Integration

Vercel AI SDK with `@ai-sdk/openai` provider using custom base URL:

```typescript
import { createOpenAI } from '@ai-sdk/openai';

const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
});

const model = openrouter('minimax/minimax-m2.5');
```

## UI Layout

### Window

- Size: 680w x 720h. Resizable (min 480x520, max 900x900).
- Frameless. Custom traffic lights top-left. Draggable top bar.
- 12px rounded corners. Subtle drop shadow.
- Centered on screen when first summoned. Remembers position after drag.

### Structure

```
+-------------------------------------+
|  * * *    Today  Projects  Inbox    |  <- view tabs
+---------------------------------------------------------------------------+
|                                     |
|  Good morning, Marcus               |  <- AI greeting (contextual)
|  You have 4 tasks today             |
|                                     |
|  +-----------------------------+    |
|  | o  Finish homepage for Kaya |    |  <- today's focus items
|  | o  Review Figma for Hotel X |    |
|  | o  Send invoice to Client Y |    |
|  | *  Fix nav bug (in progress)|    |
|  +-----------------------------+    |
|                                     |
|                                     |
+---------------------------------------------------------------------------+
|  Ask anything...            Cmd+K   |  <- chat input (always visible)
+-------------------------------------+
```

### Chat input behavior

The chat input is always at the bottom, on every view. Type into it and the view transitions into chat mode: the task list slides up, conversation fills the space. Press Escape to return to the task view.

### Views

**Today**:
- Tasks flagged for today. Clean list.
- Each task: checkbox, title, project tag (client name), priority (subtle left border shade).
- Click task to expand inline markdown body (like Notion page-in-page).
- Drag to reorder.
- Empty state: "Nothing planned. Ask AI to suggest your day."

**Projects**:
- List of parent tasks (those with subtasks). Each shows task count and progress.
- Click project to see subtasks + project markdown body at top.
- Inline `+ Add task` at bottom of each project.

**Inbox**:
- Unsorted tasks with no parent and no today flag.
- Where quick-captured items land.
- Process: assign to project, set priority, flag for today, or delete.

**Chat mode**:
- Activates when typing in the bottom input.
- Task list slides up, conversation fills space.
- AI responses stream in. Inline task cards appear when AI takes actions.
- Escape returns to previous view.
- Every AI mutation appears as an action card with status, rationale, and undo.
- Chat retention default: 30 days (configurable: session-only / 30 days / forever). Manual clear anytime.

**Scratchpad**:
- Accessed via icon next to chat input or Cmd+N.
- Slides up as panel. Plain markdown editor. One persistent document.
- "Send to AI" button to dump content into chat for parsing.

## AI Integration

### System prompt

Built from a dynamic context pack on every message. The pack includes only the most relevant slices:

- Current date and time
- Relevant active tasks with subtasks, clients, priorities, and due dates
- Today's focus list
- Inbox count
- Overdue items
- Recently completed items (last 7 days)
- Memory snippets selected by recency and relevance
- Target prompt budget: ~1-2K tokens in normal use

### AI tools

| Tool | What it does |
|------|-------------|
| `create_task` | Create task or subtask, auto-tags client |
| `update_task` | Change title, priority, status, due date, today flag |
| `complete_task` | Mark done, set completedAt |
| `delete_task` | Remove a task |
| `move_task` | Reparent (standalone to subtask, or vice versa) |
| `set_today` | Flag/unflag items for today's list |
| `suggest_daily_plan` | Analyze priorities, deadlines (hard/soft), overdue work, and context; propose a focus list without requiring time estimates |
| `parse_notes` | Extract tasks from raw text (scratchpad, pasted content) |
| `undo_last_action` | Revert the last AI mutation using `task_events` |

### AI autonomy modes (hybrid)

Configurable in settings:

- `manual`: AI drafts actions, user confirms all writes.
- `safe` (default): AI executes low-risk actions automatically, asks confirmation for critical actions.
- `autopilot`: AI executes most actions automatically, still requires confirmation for irreversible or financial-risk actions.

Always require confirmation (all modes):

- Delete task
- Bulk changes touching more than 5 tasks
- Invoice state changes to `paid` or `overdue`
- Rewriting past completed tasks

### Example interactions

- "Plan my day" -> AI reviews everything, suggests 3-5 items, user confirms.
- "I had a call with Hotel Marais, they need a landing page by March 1 and new menu photos" -> AI creates parent task with subtasks, tags client, sets due date (`hard` or `soft` based on phrasing).
- "What's overdue?" -> AI lists overdue items, suggests priorities.
- "Move invoice task to Kaya Hotel" -> AI reparents the task.

### Client auto-tagging

AI detects client names from task titles and conversation context. Tags are stored on the task and normalized across aliases (e.g., "Kaya", "Kaya Hotel"). Manual override is available but optional.

### AI Sandbox (Journal + Live Thought)

**AI Journal** (persistent memory):
- AI writes entries after meaningful interactions: observations, patterns, client preferences, progress notes.
- Stored in `ai_journal` table with categories: `pattern`, `progress`, `preference`, `summary`.
- Recent journal entries (last 30 days) are injected into the system prompt, making the AI smarter over time.
- Browsable by the user via a "Journal" button in settings (read-only, it's the AI's space).
- Examples: "Invoice tasks are often delayed near week end, suggest a Friday reminder," "Hotel Marais project started Feb 10, due March 1," "Completed 12 tasks this week, up from 8 last week."

**Live Thought** (single line, top of Today view):
- The AI's most relevant observation right now. One contextual line that changes throughout the day.
- Generated when the Today view loads, based on: time of day, overdue items, empty today list, stale inbox, patterns from journal, progress on active projects.
- Optional action button when relevant (e.g., "[Plan my day]", "[Process inbox]").
- Dismissable for the session.
- Examples: "3 overdue items and nothing planned for today yet." / "Solid day - 4 done. Hotel X invoice still pending." / "You haven't touched Kaya Hotel in 5 days."

**AI Personality**:
- Understands flow of time: morning vs afternoon vs evening context.
- Tracks progress across days and weeks.
- Learns preferences and patterns from memory layers.
- Proactive but not annoying. Pushes productivity through gentle accountability.
- Speaks concisely. No corporate fluff.

### AI Memory System (inspired by OpenClaw's SOUL.md pattern)

Three memory layers, all human-readable markdown, all editable by the user in settings:

**Soul** (personality and behavior):
- Defines how the AI behaves, its tone, its role.
- Written by the user, editable anytime.
- Default: "You are a direct, helpful productivity assistant for a solo freelancer. Push me to be productive but don't be annoying. Be concise. No corporate fluff."
- Stored in `settings` table as `ai_soul` key.

**User Profile** (knowledge about the user):
- What the AI has learned about the user over time.
- AI-written, user-editable (can correct or delete entries).
- Examples: "Freelancer doing WordPress + Figma + web apps. Has 5-8 active clients. Procrastinates on invoicing. Works best in mornings. Prefers direct communication."
- Stored in `settings` table as `ai_user_profile` key.
- AI updates this via the `update_user_profile` tool after learning new information.

**Patterns** (learned workflows and templates):
- Recurring project structures, client preferences, work habits.
- AI-learned, user-editable.
- Examples: "Website projects follow: discovery, design, develop, deploy, invoice." / "Hotel Marais prefers French communication." / "Marcus usually sends invoices on Fridays."
- Stored in `settings` table as `ai_patterns` key.
- AI updates this via the `update_patterns` tool when it detects recurring structures.

**Journal** (time-based observations):
- Daily observations, progress notes, session summaries.
- Stored in `ai_journal` table (as previously designed).
- Recent entries (last 30 days) included in system prompt.

All four layers are retrieval-backed. The AI reads only the most relevant parts of soul/profile/patterns/journal for each message, then responds.

**Additional AI tools**:

| Tool | What it does |
|------|-------------|
| `write_journal` | Write an observation to the journal |
| `read_journal` | Read past observations for context |
| `generate_live_thought` | Produce the contextual line for Today view |
| `update_user_profile` | Add or update knowledge about the user |
| `update_patterns` | Save a learned workflow or preference |
| `improve_task` | Suggest a clearer, more actionable title for vague tasks |

## Visual Design

### Philosophy

Swiss minimal. Monochrome. Craft meets ChatGPT. No color accents in MVP.

### Dark mode (default)

- Background: `#1A1A1A`
- Surface: `#262626` with 1px `#333333` border
- Text primary: `#F5F5F5`
- Text secondary: `#8A8A8A`
- Interactive: `#E5E5E5`
- Hover: `#2E2E2E`
- Checkbox fill: `#F5F5F5`

### Light mode

- Background: `#F5F5F5`
- Surface: `#FFFFFF` with 1px `#E5E5E5` border
- Text primary: `#171717`
- Text secondary: `#737373`
- Interactive: `#262626`
- Hover: `#EFEFEF`
- Checkbox fill: `#171717`

### Theme behavior

Follows macOS appearance setting by default. Manual override in settings. Optional accent color picker planned for post-MVP.

### Typography

- Font: Inter. 14px base. 13px secondary.
- Titles: 15px semibold. Quiet hierarchy through size and color only.
- No all-caps. No bold overuse.

### Spacing

- 8px grid. Everything aligns to multiples of 8.
- Generous whitespace. Tasks breathe.
- Task row height: 44px.

### Animations

- View transitions: 200ms slide.
- Checkbox: smooth fill on complete.
- Task creation: fade-in from top.
- Hover: subtle background tint.
- No bouncy/spring animations. Clean easing only.

### Chat messages

- No bubbles. Left-aligned like ChatGPT.
- User messages: slight indent or right-aligned.
- AI messages: left-aligned with inline task cards for actions.

## Window Behavior

### System integration

- Menu bar app. Template icon (monochrome). No Dock icon.
- Launches at login (configurable).
- Single instance.
- SQLite database in `~/Library/Application Support/Flusk/`.

### Summoning

- `Cmd+Shift+Space`: toggle show/hide (global, works from any app).
- Click outside window: hides (Spotlight/Raycast behavior).
- Escape: chat -> task view -> hide window (layered dismiss).
- Menu bar icon click: toggle window.

### Quick add

- `Cmd+Shift+A`: summons window with input focused, ready for fast task capture.
- Type "buy domain for client X" -> creates task, window hides.

### Clipboard-aware capture

- When quick add is triggered, Flusk reads the clipboard.
- If clipboard contains a URL, text snippet, or other content, it's pre-filled in the input.
- AI auto-suggests a task title based on clipboard content (e.g., Figma URL -> "Review Figma design - [project name]?").
- User hits Enter to confirm or edits before saving.

### Menu bar badge

- Tray icon shows a small number badge with remaining today items.
- Updates in real-time as tasks are completed.
- Disappears when today's list hits 0.
- Glanceable accountability without opening the app.

### Backup and restore

- Local auto-backup of the SQLite database once per day.
- Keep the most recent 30 snapshots.
- Manual "Export backup" and "Restore from backup" in settings.
- Optional passphrase encryption for exported backup files.

### Weekly digest

- Every Monday morning (configurable day/time), the AI auto-generates a weekly summary.
- Shows as the live thought on that day, expandable to full digest.
- Contents: tasks completed, tasks carried over, overdue items, project progress, client activity, patterns observed.
- Stored as a `summary` entry in the ai_journal table.

## Keyboard Shortcuts

All shortcuts are configurable in settings.

### Global (from any app)

| Shortcut | Action |
|----------|--------|
| `Cmd+Shift+Space` | Toggle Flusk window |
| `Cmd+Shift+A` | Quick add task |

### In-app

| Shortcut | Action |
|----------|--------|
| `1` / `2` / `3` | Switch to Today / Projects / Inbox |
| `Cmd+N` | Open scratchpad |
| `Cmd+K` | Focus chat input |
| `Enter` | Open selected task |
| `Esc` | Back (chat -> view -> hide) |
| `Cmd+Enter` | Send chat message |
| `Cmd+Z` | Undo last action (or last AI action card) |
| `T` | Toggle today flag on selected task |
| `Up` / `Down` | Navigate task list |

## MVP Scope

### In (v1.0)

- Today / Projects / Inbox views
- Task CRUD with subtasks (one level)
- Markdown body on tasks
- Client auto-tagging via AI
- AI chat with tool calling (create, update, delete, plan day, parse notes)
- Global scratchpad
- Search (active + completed tasks)
- Dark mode + light mode (follows system)
- Menu bar app with global shortcuts
- Settings (model selector, shortcut customization)
- 3 OpenRouter models
- AI memory system (Soul + User Profile + Patterns + Journal)
- Live thought on Today view
- Clipboard-aware quick capture
- Menu bar badge (remaining today count)
- AI `improve_task` tool (suggests clearer titles for vague tasks)
- Hybrid autonomy modes (manual / safe / autopilot)
- Action cards with per-action undo for AI mutations
- Flexible deadlines (`hard`/`soft`)
- Freelancer signals (`invoiceStatus`, `valueAtRisk`, `lastClientTouchAt`)
- Simple backup and restore (daily snapshots + export/import)
- Weekly digest (auto-generated summary)
- Learned project templates (via Patterns memory)

### Out (post-MVP)

- Accent color customization
- iPhone/iPad companion
- Notifications and reminders
- Calendar integration
- Time tracking
- Import from other tools
- Multi-device sync
- Widgets
- Stale project autopsy mode
- Finish line mode
