# Untask — Project Instructions for Coding Agents

## What This Is
Untask is a local-first personal task manager with an optional AI assistant, built as a macOS Electron app. It was previously called "Flusk" — some internal code/paths still use that name.

## Repository Layout

This is a **monorepo** with two independent projects:

```
untitled/                         # Local monorepo (no remote)
├── flusk/                        # Electron app (the product)
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

**Important**: The GitHub repo (`mbenhard/untask`) is separate — it contains only the `flusk/` contents at root level, with its own commit history.

## GitHub Repos

| Repo | Purpose | URL |
|------|---------|-----|
| `mbenhard/untask` | App source + releases | https://github.com/mbenhard/untask |
| `mbenhard/homebrew-untask` | Homebrew tap (cask) | https://github.com/mbenhard/homebrew-untask |

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
# Run the app (from flusk/)
npm run start              # electron-forge start

# If Electron binary is missing after install:
node node_modules/electron/install.js
npx electron-rebuild -f -w better-sqlite3

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

## Release Workflow

Releases are **not automated from local dev**. The flow is:

### 1. Prepare changes
Work in `flusk/` locally. Test with `npm run start`.

### 2. Sync to GitHub
```bash
# Clone the GitHub repo to a temp location
gh repo clone mbenhard/untask /tmp/untask-release

# Copy changed files from flusk/ to the clone
# (manually or with a diff tool — the directory structures match)

# Commit, push
cd /tmp/untask-release
git add -A && git commit -m "description"
git push origin main
```

### 3. Tag and release
```bash
# Bump version in package.json first, then:
git tag v0.x.x
git push origin v0.x.x
```

This triggers the **Release workflow** (`.github/workflows/release.yml`):
- Runs on `macos-latest`
- `pnpm install` → `pnpm typecheck` → `pnpm test` → `pnpm make`
- Uploads `.zip` artifact as a **draft** GitHub release
- You must **publish** the draft: `gh release edit v0.x.x --repo mbenhard/untask --draft=false`

### 4. Update Homebrew cask
```bash
# Download the release artifact and get SHA
gh release download v0.x.x --repo mbenhard/untask --pattern '*.zip' --dir /tmp
shasum -a 256 /tmp/Untask-darwin-arm64-0.x.x.zip

# Clone and update the tap
gh repo clone mbenhard/homebrew-untask /tmp/homebrew-untask
# Edit Casks/untask.rb: update version + sha256
# Commit and push
```

The cask file format:
```ruby
cask "untask" do
  version "0.x.x"
  sha256 "<sha256>"
  url "https://github.com/mbenhard/untask/releases/download/v#{version}/Untask-darwin-arm64-#{version}.zip"
  name "Untask"
  desc "Local-first personal task manager with optional AI assistant"
  homepage "https://github.com/mbenhard/untask"
  app "Untask.app"
  postflight do
    system_command "/usr/bin/xattr", args: ["-cr", "#{appdir}/Untask.app"], sudo: false
  end
end
```

## Known Build Gotchas

### Native modules in packaged app
`better-sqlite3` is a native Node module. The Vite plugin's default `ignore` function excludes all `node_modules` from the ASAR. We override it in `forge.config.ts` to include `better-sqlite3`, `bindings`, and `file-uri-to-path`. The `AutoUnpackNativesPlugin` then extracts the `.node` binary to `app.asar.unpacked/`.

**If adding new native modules**: add them to the `ignore` function in `forge.config.ts`.

### pnpm + Electron Forge
`.npmrc` must have:
```
node-linker=hoisted
symlink=false
```
- `node-linker=hoisted` — Forge's package manager detection requires it
- `symlink=false` — Electron Packager can't follow pnpm symlinks into ASAR

### Electron binary disappearing
After `pnpm install`, if `node_modules/electron/dist/` is empty:
```bash
node node_modules/electron/install.js
npx electron-rebuild -f -w better-sqlite3
```

## Database

- **Engine**: better-sqlite3 with WAL mode
- **ORM**: Drizzle
- **Location**: `~/Library/Application Support/Untask/untask.db`
- **Legacy**: `~/Library/Application Support/flusk/flusk.db` (auto-migrated on first run if untask.db doesn't exist)
- **Backups**: `~/Library/Application Support/Untask/backups/`
- **Schema**: `flusk/src/main/db/schema.ts`
- **Migrations**: `flusk/drizzle/` (SQL files, copied as extraResource)

Tables: `tasks`, `notes`, `conversations`, `chat_messages`, `task_events`, `ai_journal`, `ai_journal_archive`, `settings`, `memory_events`

## Architecture Rules

- **Main process** owns: DB, filesystem, tray, shortcuts, AI calls
- **Preload** exposes: minimal typed IPC APIs only
- **Renderer** never: accesses Node/Electron internals directly
- **IPC** is domain-first: `task:*`, `chat:*`, `settings:*` — never generic raw DB queries
- **Validation**: zod on write payloads before mutation
- **Audit**: task mutations logged to `task_events`

## AI Assistant Design

The app includes an AI chat assistant. Key design decisions:

- **Identity**: personality defined in `docs/assistant/SOUL.md` and `docs/assistant/CHARTER.md`
- **Providers**: supports OpenAI and Anthropic via Vercel AI SDK (see `src/main/ai/providers/`)
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

Astro static site in `website/`. Deploy by building and hosting `dist/`.

```bash
cd website
pnpm dev     # Dev server
pnpm build   # Build to dist/
```

Download links point to `https://github.com/mbenhard/untask/releases/latest` — no version hardcoding needed.
