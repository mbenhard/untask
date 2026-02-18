# Untask — Project Instructions for Coding Agents

## What This Is
Untask is a local-first personal task manager with an optional AI assistant, built as a macOS Electron app.

## Repository Layout

This is a **monorepo** with two independent projects:

```
untitled/                         # Local monorepo
├── untask/                       # Electron app (git subtree → mbenhard/untask)
│   ├── src/main/                 # Main process (Node/Electron)
│   ├── src/preload/              # Preload bridge
│   ├── src/renderer/             # React UI
│   ├── src/types/                # Shared types
│   ├── forge.config.ts           # Electron Forge config
│   ├── vite.main.config.ts       # Vite config for main process
│   ├── vite.renderer.config.ts   # Vite config for renderer
│   └── package.json              # App package (pnpm)
├── website/                      # Astro landing page (untask.app)
│   ├── src/components/           # Astro components
│   ├── src/pages/                # Routes
│   └── package.json
├── docs/
│   ├── assistant/                # SOUL.md, CHARTER.md — AI personality
│   └── plans/                    # Design docs
└── CLAUDE.md                     # This file
```

The `untask/` directory is a **git subtree** linked to `mbenhard/untask` on GitHub. Changes committed locally can be pushed directly to GitHub without manual copying.

## GitHub Repos

| Repo | Purpose |
|------|---------|
| `mbenhard/untask` | App source + releases |
| `mbenhard/homebrew-untask` | Homebrew tap (cask) |

GitHub CLI is authenticated as `mbenhard`.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Electron 40 + Electron Forge |
| Bundler | Vite (via @electron-forge/plugin-vite) |
| Database | better-sqlite3 + Drizzle ORM |
| UI | React 19 + Tailwind v4 + Radix UI |
| AI | Vercel AI SDK (@ai-sdk/openai, @ai-sdk/anthropic) |
| Editor | BlockNote |
| State | Zustand v5 |
| Package manager | pnpm |

## Development Commands

```bash
# Run the app (from untask/)
cd untask && npm run start

# Type checking & tests
pnpm typecheck             # All three tsconfigs
pnpm test                  # Vitest

# Build for distribution
pnpm package               # Creates out/Untask-darwin-arm64/
pnpm make                  # Creates distributable .zip/.dmg

# Database
npm run db:generate        # Drizzle schema → SQL migrations
npm run db:migrate         # Apply migrations (rebuilds native modules)
```

## Git Subtree Workflow

The `untask/` directory is a subtree of `mbenhard/untask`. The remote is named `untask`.

```bash
# Push local changes to GitHub
git subtree push --prefix=untask untask main

# Pull remote changes into local
git subtree pull --prefix=untask untask main --squash
```

Workflow: develop in `untask/`, commit to the local monorepo, then subtree push when ready to sync to GitHub.

## Release Workflow

### 1. Develop and test
Work in `untask/` locally. Test with `cd untask && npm run start`.

### 2. Push to GitHub
```bash
# Commit locally first, then:
git subtree push --prefix=untask untask main
```

### 3. Tag and release

Local monorepo tags don't map to the subtree remote. Create tags on GitHub directly:

```bash
# After subtree push lands on main, create a draft release with tag:
gh release create v0.x.x --repo mbenhard/untask --draft --target main --title "v0.x.x"
```

This triggers the **Release workflow** (`.github/workflows/release.yml`):
- Runs on `macos-latest`
- `pnpm install` → `pnpm typecheck` → `pnpm test` → `pnpm make`
- Uploads `.zip` artifact to the draft release
- Publish when ready: `gh release edit v0.x.x --repo mbenhard/untask --draft=false`

### 4. Update Homebrew cask
```bash
gh release download v0.x.x --repo mbenhard/untask --pattern '*.zip' --dir /tmp
shasum -a 256 /tmp/Untask-darwin-arm64-0.x.x.zip

# Update version + sha256 in mbenhard/homebrew-untask Casks/untask.rb
```

## Database

- **Engine**: better-sqlite3 with WAL mode
- **ORM**: Drizzle
- **Location**: `~/Library/Application Support/Untask/untask.db`
- **Schema**: `untask/src/main/db/schema.ts`
- **Migrations**: `untask/drizzle/` (SQL files, copied as extraResource)

Tables: `tasks`, `notes`, `conversations`, `chat_messages`, `task_events`, `ai_journal`, `ai_journal_archive`, `settings`, `memory_events`

## Architecture Rules

- **Main process** owns: DB, filesystem, tray, shortcuts, AI calls
- **Preload** exposes: minimal typed IPC APIs only
- **Renderer** never: accesses Node/Electron internals directly
- **IPC** is domain-first: `task:*`, `chat:*`, `settings:*` — never generic raw DB queries
- **Validation**: zod on write payloads before mutation
- **Audit**: task mutations logged to `task_events`

## AI Assistant Design

- **Identity**: personality defined in `docs/assistant/SOUL.md` and `docs/assistant/CHARTER.md`
- **Providers**: supports OpenAI and Anthropic via Vercel AI SDK (see `untask/src/main/ai/providers/`)
- **Context injection**: full task/note context injected into system prompt (no RAG — data is small)
- **Privacy**: chat messages stored locally in SQLite, never sent to external services beyond the LLM API
- **Memory layers**: profile, patterns, journal — all editable and auditable

## UI Guidelines

- Monochrome, minimal, keyboard-first
- 8px spacing grid
- Inter typography (+ Geist Mono for code)
- Dark mode default with light mode parity
- Subtle motion only (200ms transitions, no bouncy animations)
- Use Radix UI primitives, not raw HTML for interactive elements

## Website

Astro static site in `website/`.

```bash
cd website
pnpm dev     # Dev server
pnpm build   # Build to dist/
```

Download links point to `https://github.com/mbenhard/untask/releases/latest` — no version hardcoding needed.
