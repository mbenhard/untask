# Launch Posts

Ready-to-post drafts for the Untask open-source launch. Edit before posting — these are starting points, not final copy.

---

## 1. Reddit — r/electronjs

**Title:**
Untask — open-source local-first task manager with optional AI assistant (Electron + React + SQLite)

**Body:**

I built Untask as a personal task manager that I actually wanted to use. After a few months it felt solid enough to open-source.

**What it is:**

A macOS desktop app built on Electron, React, and SQLite. No cloud sync, no accounts, no telemetry. All data lives in a local SQLite database in your user data directory.

**Core features (no AI required):**

- Configurable status lanes (rename, add, reorder)
- Drag-and-drop task reordering
- Rich text notes via BlockNote editor
- Full-text search across tasks and notes
- Task event audit trail with undo
- Clipboard quick-add via global shortcut
- Tray icon with today task count
- Backup and restore
- Dark mode default, light mode parity

**AI assistant (opt-in, bring your own key):**

If you add an API key, a chat panel opens up with a persistent AI assistant. It has access to your tasks and can create, modify, and prioritize them via tool calls. Memory is structured (profile, patterns, observations) and every AI mutation is logged separately so you can see and undo what it did. Providers supported: OpenRouter, OpenAI, Anthropic, Ollama.

No key, no AI. The app is fully usable without it.

**Tech stack:**

- Electron 34 + React 19 + TypeScript
- SQLite via better-sqlite3 + Drizzle ORM
- Vercel AI SDK for multi-provider AI streaming
- Zustand for state management
- Tailwind CSS + Radix UI primitives

**What I tried to get right architecturally:**

The main process owns all DB and AI access. The preload script is a thin typed bridge. The renderer never touches Node internals. IPC channels are domain-prefixed (`task:*`, `chat:*`, `settings:*`). Writes are validated with Zod before mutation.

**Honest limitations:**

- macOS only right now (Electron forge config is macOS-first; Windows/Linux support is a future thing)
- Pre-1.0, so expect rough edges
- Not on the Mac App Store; Gatekeeper will block the first launch (instructions in README)

**Repo:** [https://github.com/mbenhard/untask](https://github.com/mbenhard/untask)

[Screenshot placeholder]

Happy to answer questions about the Electron architecture, the AI memory design, or anything else.

---

## 2. Reddit — r/selfhosted

**Title:**
Untask — local-first task manager with AI assistant, no cloud, no accounts, everything on-device

**Body:**

Untask is an open-source macOS task manager designed around a simple principle: your data stays on your machine.

**What "local-first" actually means here:**

- SQLite database in your Electron user data directory — no external writes, ever
- No account required to install or run
- No telemetry of any kind — no analytics, no crash reporting, no usage pings
- Works fully offline
- Backup is a manual export to a JSON file you own

**The AI is opt-in and uses your own key:**

If you want the AI assistant, you provide your own API key. Supported providers:

- OpenRouter (one key, many models)
- OpenAI
- Anthropic
- Ollama (fully local, no API key, no internet)

API keys are stored via Electron's `safeStorage` (OS keychain-backed encryption). They never leave your machine in plain text and are not included in backups.

If you don't provide a key, the AI features are completely disabled. The app works fine as a plain task manager.

**What the AI can do (when enabled):**

- Persistent assistant with memory (profile, patterns, observations)
- Chat-based task creation and modification
- Proactive nudges based on task state
- All AI mutations are tagged and auditable — you can see exactly what the AI changed and undo it

**Limitations to be upfront about:**

- macOS only at this point
- Pre-1.0 — feature complete for my daily use but not battle-tested broadly
- Not notarized through the Mac App Store; Gatekeeper workaround is documented in the README

**Source:** [https://github.com/mbenhard/untask](https://github.com/mbenhard/untask)

MIT license.

---

## 3. Hacker News — Show HN

**Title:**
Show HN: Untask — Local-first task manager with optional AI assistant

**Body:**

Untask is a macOS desktop app I've been building as a personal productivity tool. I'm open-sourcing it today.

The core is a task manager backed by a local SQLite database. No cloud, no accounts, no telemetry. The AI assistant is opt-in and requires you to bring your own key (OpenRouter, OpenAI, Anthropic, or Ollama for fully local inference).

The problem I was solving: I wanted an AI-assisted task manager where I could trust the data model. Most tools either lock your data in a cloud service or bolt AI on top in a way that feels opaque. I wanted to see exactly what the AI was doing and be able to undo it.

Key technical decisions worth discussing:

- Electron main process owns all SQLite access (synchronous queries via better-sqlite3). No async SQLite — it simplifies the service layer and eliminates a class of race conditions.
- Every AI-initiated task mutation is logged to a separate `task_events` table tagged `source: 'ai'`, enabling targeted undo.
- AI memory is structured into layers (profile, patterns, observations) and stored as append-only events. No opaque hidden state.
- Context injection rather than RAG — the full task list and memory fit comfortably in the model's context window, so there's no retrieval step.
- IPC channels are domain-prefixed (`task:*`, `chat:*`, `settings:*`) with Zod validation on all write payloads.

Tech: Electron 34 + React 19 + TypeScript + SQLite (better-sqlite3 + Drizzle ORM) + Vercel AI SDK.

macOS only for now. Pre-1.0.

Repo: https://github.com/mbenhard/untask

---

## 4. Twitter / X

**Short tweet:**

Just open-sourced Untask — a local-first task manager with an optional AI assistant. No cloud, no accounts, no telemetry. BYOK for AI (OpenRouter / OpenAI / Anthropic / Ollama). macOS, MIT license.

https://github.com/mbenhard/untask

---

## Notes on Posting

- Replace `https://github.com/mbenhard/untask` with the actual repo URL before posting.
- Add a real screenshot to the r/electronjs post — the placeholder won't land well without one.
- For HN: post as "Show HN" between 9am–12pm ET on a weekday for best visibility. Keep the body short; the technical detail can come out in comments.
- For Reddit: post to r/electronjs and r/selfhosted separately, not cross-posted — the audiences and emphasis differ.
- Don't post everything the same day. Stagger by a day or two to avoid looking like a coordinated marketing push.
