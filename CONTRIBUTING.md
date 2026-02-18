# Contributing to Untask

Thanks for your interest in contributing. Untask is a local-first personal task manager built on Electron — local-first, privacy-respecting, and designed to feel like a durable extension of the user rather than a generic chat UI.

---

## Getting Started

```bash
# Clone the repo
git clone https://github.com/mbenhard/untask.git
cd untask

# Install dependencies
pnpm install

# Start in development mode
pnpm start

# Run all tests
pnpm test

# Type-check all three processes (main, preload, renderer)
pnpm typecheck
```

> Note: The first `pnpm install` also rebuilds `better-sqlite3` for Electron. If you see native module errors, run `pnpm rebuild:electron` manually.

---

## Development Workflow

1. **Branch from `main`**

   ```bash
   git checkout -b feat/your-feature-name
   ```

2. **Make your changes** — keep commits small and focused.

3. **Verify before committing**

   ```bash
   pnpm typecheck && pnpm test
   ```

4. **Open a PR against `main`** with a clear description of what changed and why.

---

## Code Style

- **TypeScript strict mode** — all three tsconfigs (`tsconfig.main.json`, `tsconfig.preload.json`, `tsconfig.renderer.json`) enforce strict checks. No `any` escapes unless genuinely necessary.
- **ESLint** — run `pnpm lint` to check. Fix all errors before opening a PR.
- **Tailwind CSS** — use design tokens (`text-foreground`, `bg-card`, `border`, etc.). Never hardcode colors or arbitrary spacing values.
- **UI components** — reuse existing components from `src/renderer/components/ui/`. Radix primitives are available via `radix-ui`. Prefer composition over new one-off styled elements.
- **IPC channels** — follow the domain-first naming convention: `task:*`, `chat:*`, `settings:*`, `app:*`. New channels must have typed payloads defined in `src/types/ipc.ts`.
- **Main process only** — DB queries, filesystem access, and Electron APIs belong in `src/main/`. The renderer must not import Node.js or Electron internals directly.

See [ARCHITECTURE.md](./docs/ARCHITECTURE.md) for a full overview of process boundaries and conventions.

---

## Commit Messages

Conventional commits preferred:

```
feat: add keyboard shortcut for quick-add
fix: correct due date parsing for "next friday"
docs: update architecture diagram
refactor: extract context builder into separate module
test: add coverage for recurrence engine
chore: bump electron to 40.x
```

---

## Reporting Issues

**Bugs** — include:
- macOS version and Untask version
- Steps to reproduce
- What you expected vs. what happened
- Any relevant logs from the DevTools console

**Feature requests** — describe the use case first, not just the solution. What are you trying to accomplish?

---

## Architecture Overview

For a detailed explanation of how the three Electron processes communicate, how the database is structured, and how the AI layer is assembled at runtime, see [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).
