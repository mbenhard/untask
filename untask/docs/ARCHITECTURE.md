# Architecture

Untask is an Electron application with three isolated processes. Each process has a clear ownership boundary. Crossing those boundaries incorrectly is the most common source of bugs and security issues, so this document explains what lives where and why.

---

## Process Model

```
┌──────────────────────────────────────────────────────────────┐
│  Main Process (Node.js)                                      │
│  ─ SQLite database (better-sqlite3 + Drizzle ORM)           │
│  ─ Filesystem access (backups, settings)                     │
│  ─ AI providers (OpenRouter, OpenAI, Anthropic, Ollama)      │
│  ─ Proactive assistant loop                                  │
│  ─ System tray + global shortcuts                            │
│  ─ Window lifecycle                                          │
└───────────────────────┬──────────────────────────────────────┘
                        │ contextBridge (typed IPC only)
┌───────────────────────▼──────────────────────────────────────┐
│  Preload Script                                              │
│  ─ Exposes window.untask API to renderer                     │
│  ─ No business logic — thin bridge only                      │
│  ─ All payloads are typed (src/types/ipc.ts)                 │
└───────────────────────┬──────────────────────────────────────┘
                        │ window.untask.*
┌───────────────────────▼──────────────────────────────────────┐
│  Renderer Process (React)                                    │
│  ─ UI components, Zustand stores, routing                    │
│  ─ No direct Node.js or Electron API access                  │
│  ─ All data flows through IPC calls                          │
└──────────────────────────────────────────────────────────────┘
```

### Main process

Owns everything with system-level access:
- `src/main/db/` — SQLite via Drizzle ORM. All queries are synchronous.
- `src/main/ai/` — AI provider abstraction, context assembly, tool execution, memory.
- `src/main/assistant/` — Proactive loop: timer-based nudges, reminders, drift detection.
- `src/main/services/` — Business logic: tasks, chat, notes, search, backup, memory.
- `src/main/window/` — Window creation, bounds persistence, dismiss/summon behavior.
- `src/main/shortcuts.ts` — Global keyboard shortcuts.
- `src/main/tray.ts` — System tray icon and today task count.

### Preload script

Lives at `src/preload/index.ts`. Uses Electron's `contextBridge` to expose a single typed object (`window.untask`) to the renderer. This object contains nothing but `ipcRenderer.invoke()` wrappers and a small number of `ipcRenderer.on()` listeners.

**Rules:**
- No logic. No state. No imports from `src/main/`.
- Every exposed method maps 1:1 to an IPC channel defined in `src/types/ipc.ts`.
- API keys never cross the bridge — they are stored via `safeStorage` in the main process only.

### Renderer process

Lives in `src/renderer/`. This is a standard React application that cannot import Node.js or Electron internals. It reads and writes data exclusively through `window.untask.*`.

---

## IPC Design

Channels follow a domain-first naming convention:

| Domain | Examples |
|--------|----------|
| `task:*` | `task:list`, `task:create`, `task:update`, `task:delete`, `task:reorder` |
| `chat:*` | `chat:send`, `chat:cancel`, `chat:list-threads`, `chat:stream-event` |
| `settings:*` | `settings:get`, `settings:set`, `settings:get-memory-state` |
| `app:*` | `app:request-hide`, `app:get-launch-at-login`, `app:check-for-updates` |
| `backup:*` | `backup:create`, `backup:export`, `backup:import` |
| `notes:*` | `notes:list`, `notes:get`, `notes:save` |
| `search:*` | `search:query` |

All channel names are declared as constants in `src/types/ipc.ts` (via `IPC_CHANNELS`). All request and response payloads are typed there as well.

Write payloads validated with Zod on the main process side before any mutation.

---

## Database

SQLite via `better-sqlite3` and Drizzle ORM. The database file lives in the Electron user data directory (`app.getPath('userData')`).

All queries run synchronously on the main process — no async SQLite. This eliminates a class of race conditions and simplifies the service layer.

### Tables

| Table | Purpose |
|-------|---------|
| `tasks` | All tasks with status, priority, due date, recurrence, hierarchy |
| `notes` | Rich-text notes (BlockNote JSON stored as text) |
| `conversations` | Chat thread metadata (title, timestamps, archived state) |
| `chat_messages` | Per-message storage with role, content, tool call metadata |
| `task_events` | Append-only audit log of all task mutations (source: user or ai) |
| `ai_journal` | Time-stamped AI observations (patterns, progress, preferences) |
| `ai_journal_archive` | Archived journal entries rotated out of active context |
| `settings` | Key-value store for all user preferences and configuration |
| `memory_events` | Audit trail for memory layer changes (reversible) |

### Migrations

Drizzle Kit manages migrations. Schema changes go through `pnpm db:generate` (generates SQL) then `pnpm db:migrate` (applies to the local dev database). The app runs migrations automatically on startup.

---

## AI Architecture

The AI layer is opt-in. If no API key is configured, all AI features are disabled and the app functions as a plain task manager.

### Provider abstraction

`src/main/ai/providers/` contains adapters for:
- **OpenRouter** — recommended default; gives access to many models with one key
- **OpenAI** — direct API
- **Anthropic** — direct API
- **Ollama** — local models, no API key required

All providers implement a common interface and are driven by the Vercel AI SDK (`ai` package) for unified streaming.

### Context assembly

Before every chat response, `src/main/ai/contextBuilder.ts` assembles the full runtime context:

1. **Soul** — stable personality and communication style (loaded from `docs/assistant/SOUL.md`)
2. **Charter** — role definition, operating rules, boundaries (`docs/assistant/CHARTER.md`)
3. **User profile** — durable facts, preferences, and learned patterns (from `settings` + `memory_events`)
4. **Journal** — recent time-stamped observations from `ai_journal`
5. **Live context** — current tasks, today focus, due risk, recent activity (queried fresh each turn)

The full context is injected as a system prompt. There is no retrieval step (no RAG) — the content is small enough to fit comfortably in the context window.

### Memory system

`src/main/ai/memory.ts` and `src/main/services/memoryService.ts` manage memory updates.

- Memory is organized into layers: `soul`, `profile`, `patterns`, `identity`
- Every write is appended to `memory_events` (auditable, reversible)
- High-confidence facts are promoted from conversation observations to the profile
- The user can review, edit, or revert any memory entry from the settings panel

### Tool execution

`src/main/ai/tools.ts` defines the tools available to the assistant during a conversation. Tools map to service functions in `src/main/services/`. All AI-initiated task mutations are tagged `source: 'ai'` in `task_events`, enabling targeted undo.

### Proactive loop

`src/main/assistant/proactiveLoop.ts` runs a periodic check. It evaluates current task state against known patterns and schedules nudges, reminders, or summary messages when thresholds are crossed. The renderer receives these via the `chat:focus-message` IPC event.

### Autonomy mode

The assistant supports two autonomy levels:
- **Supervised** — AI proposes actions, user confirms before execution
- **Auto** — AI executes lower-risk actions immediately; destructive or high-financial actions always require confirmation regardless of mode

---

## Directory Structure

```
src/
├── main/                    # Electron main process (Node.js)
│   ├── ai/                  # AI layer
│   │   ├── providers/       # OpenRouter, OpenAI, Anthropic, Ollama adapters
│   │   ├── chat.ts          # Chat orchestration and streaming
│   │   ├── contextBuilder.ts # Runtime context assembly
│   │   ├── knowledgeExtractor.ts # Post-turn pattern extraction
│   │   ├── memory.ts        # Memory read/write operations
│   │   ├── models.ts        # Model catalog and capability metadata
│   │   ├── systemPrompt.ts  # System prompt construction
│   │   └── tools.ts         # Tool definitions for AI use
│   ├── assistant/
│   │   └── proactiveLoop.ts # Timer-based proactive behavior
│   ├── db/
│   │   ├── schema.ts        # Drizzle table definitions
│   │   ├── migrate.ts       # Migration runner
│   │   └── index.ts         # DB connection singleton
│   ├── services/            # Business logic
│   │   ├── taskService.ts   # Task CRUD + recurrence
│   │   ├── chatService.ts   # Conversation and message persistence
│   │   ├── memoryService.ts # Memory layer management
│   │   ├── journalService.ts # AI journal read/write
│   │   ├── notesService.ts  # Notes CRUD
│   │   ├── searchService.ts # Full-text search
│   │   ├── settingsService.ts # Key-value settings
│   │   ├── keyStorage.ts    # API key storage via safeStorage
│   │   ├── backupService.ts # Export/import backup
│   │   ├── dueDateParser.ts # Natural language date parsing
│   │   ├── recurrenceEngine.ts # Recurring task generation
│   │   └── updateChecker.ts # GitHub release polling
│   ├── window/              # Window management
│   │   ├── bounds.ts        # Persist and restore window position/size
│   │   ├── dismissMode.ts   # Hide-to-tray vs close behavior
│   │   ├── summonController.ts # Global shortcut summon logic
│   │   └── trayIcon.ts      # Tray icon state and menu
│   ├── clipboard.ts         # Clipboard quick-add handling
│   ├── defaultSettings.ts   # Initial settings values
│   ├── ipc.ts               # IPC handler registration
│   ├── shortcuts.ts         # Global keyboard shortcuts
│   ├── tray.ts              # Tray initialization
│   └── index.ts             # Main process entry point
│
├── preload/
│   └── index.ts             # contextBridge IPC bridge (window.untask)
│
├── renderer/                # React application
│   ├── components/
│   │   ├── ui/              # Base UI primitives (Radix + Tailwind)
│   │   ├── chat/            # Chat panel and message components
│   │   ├── tasks/           # Task list, task item, task detail
│   │   ├── notes/           # Notes list and BlockNote editor
│   │   ├── search/          # Search overlay
│   │   ├── settings/        # Settings panel views
│   │   ├── onboarding/      # First-run flow
│   │   ├── editor/          # Rich text editor wrapper
│   │   ├── layout/          # Shell, sidebar, panels
│   │   ├── providers/       # React context providers
│   │   └── views/           # Top-level view components
│   ├── stores/              # Zustand state
│   │   ├── appStore.ts      # Global UI state (active view, panels)
│   │   ├── chatStore.ts     # Chat threads and messages
│   │   ├── taskStore.ts     # Task list and mutations
│   │   ├── notesStore.ts    # Notes list
│   │   ├── searchStore.ts   # Search query and results
│   │   └── taskStatusConfigStore.ts # Configurable status lanes
│   ├── lib/                 # Renderer utilities
│   │   ├── utils.ts         # cn() and misc helpers
│   │   ├── typography.ts    # Text formatting utilities
│   │   ├── animations.ts    # Framer Motion variants
│   │   └── untask.ts         # App-level constants
│   ├── hooks/               # Custom React hooks
│   ├── styles/              # Global CSS and Tailwind entry
│   ├── App.tsx              # Root component and routing
│   └── main.tsx             # Renderer entry point
│
└── types/                   # Shared TypeScript types
    ├── ipc.ts               # IPC channel names and payload types
    ├── models.ts            # Domain model types (Task, Note, etc.)
    ├── chat.ts              # Chat-specific types
    ├── assistant.ts         # Assistant and proactive loop types
    └── preload.d.ts         # window.untask type declaration
```

---

## Key Design Decisions

**Why synchronous SQLite?** Electron's main process is single-threaded for DB access anyway. Sync queries are simpler to reason about and eliminate a whole category of async race conditions in service code.

**Why no RAG?** The total content injected into context (tasks, memory, journal, profile) stays well within modern model context windows. Retrieval adds complexity and latency for no benefit at this scale.

**Why full context injection on every turn?** The assistant needs a complete, consistent view of the user's state to give coherent responses. Partial context produces worse behavior than full context.

**Why append-only `task_events` and `memory_events`?** Audit trail and undo. Every AI-initiated or user-initiated mutation is recoverable. This is especially important for AI actions that the user didn't explicitly request.

**Why domain-first IPC channels?** Grouping by domain makes it easy to find all handlers for a given feature, enforce payload validation consistently per domain, and avoid channel name collisions as the surface area grows.
