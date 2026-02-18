# Untask Landing Page Design

**Date:** 2026-02-18
**Status:** Approved
**Goal:** Open source showcase landing page for Untask. Industrial Swiss typography, monochrome, generous whitespace.

---

## Tech

- **Framework:** Astro (static output, zero JS shipped)
- **Styling:** Tailwind CSS v4, sharing design tokens with the Electron app
- **Fonts:** Geist + Geist Mono (same as app)
- **Location:** `/website` folder at repo root, separate from `/flusk`
- **Deploy:** Static `dist/` — Vercel, Netlify, or GitHub Pages

---

## Design System (shared with app)

### Colors

| Token | Dark | Light |
|-------|------|-------|
| `--background` | `#161616` | `#F7F7F7` |
| `--foreground` | `#F5F5F5` | `#171717` |
| `--muted-foreground` | `#8A8A8A` | `#737373` |
| `--border` | `#2A2A2A` | `#E3E3E3` |
| `--accent` | `#1E1E1E` | `#F1F1F1` |

### Typography

- Body: Geist, 14px, `text-foreground`
- Section headers: Geist Mono, 11px, uppercase, `tracking-[0.06em]`, `text-muted-foreground`
- Labels: Geist Mono, 11px, uppercase
- Hero title: Geist, ~48px, regular weight
- Hero subtitle: Geist, ~16px, `text-muted-foreground`

### Recurring motifs

- Ruled-line section dividers (`border-t` spanning content width)
- Uppercase mono labels for section headers
- `max-w-2xl` content column, centered
- Generous whitespace between all sections (`py-24` or more)

---

## Page Structure

Single page, single column, six sections. One scroll.

### 1. Hero

Full viewport height. Centered vertically and horizontally.

- Bird mascot (small, above text)
- "Untask" in Geist, ~48px, regular weight
- Subtitle: "A local-first personal task manager with an optional AI assistant." in `text-muted-foreground`, ~16px
- Two CTAs: solid button (Download for macOS), ghost/outline button (GitHub)
- Below CTAs: tiny mono label `MIT Licensed · macOS · v0.1.0`
- Narrow column (`max-w-lg`), dead center
- 80% of viewport is negative space

### 2. App Preview

CSS-only recreation of the Untask app window using the same design tokens.

- Fake macOS window chrome with traffic light circles (non-functional)
- Title bar with tab navigation: Today, Tasks, Inbox, Notes (11px, same styling as real app)
- Today view with 3 realistic tasks:
  - `○ Ship landing page` — today tag
  - `○ Review PR from Alex` — high priority
  - `◉ Update invoice for Kaya` — done
- Section headers styled like app's `SectionGroup`: `▸ Today 3` in 11px mono uppercase
- Chat peek button in bottom-right corner
- Window frame: `rounded-xl`, `border-border/70`, app's chat shadow (`shadow-[0_8px_20px_-14px_rgba(0,0,0,0.6)]`)
- Container: `max-w-2xl`

### 3. Philosophy (Why Untask)

2x2 grid of principles. Ruled line under section header.

| Principle | Description |
|-----------|-------------|
| LOCAL-FIRST | Everything stays on your device. Zero telemetry, zero tracking. |
| AI IS OPTIONAL | Use it as a pure task manager. Enable AI when you want it, bring your own key. |
| KEYBOARD-FIRST | Built for speed. Global shortcut to capture, keyboard nav everywhere. |
| OPEN SOURCE | MIT licensed. Read the code, fork it, make it yours. |

- Section header: `WHY UNTASK` in mono uppercase with ruled line
- Labels: Geist Mono, bold, uppercase, 11px
- Descriptions: Geist regular, 14px, `text-muted-foreground`
- No icons. Whitespace does the work. `gap-12` between grid items.

### 4. Features

Two groups mirroring the README. Styled like the app's `SectionGroup` component.

**Core — no AI required (10)**
- Configurable status lanes
- Drag-and-drop reordering
- Rich text notes
- Full-text search
- Task events audit trail with undo
- Clipboard quick-add via global shortcut
- Backup and restore
- Keyboard shortcuts
- Tray icon with today count
- Dark + light mode

**AI Assistant — bring your own key (6)**
- Multi-provider (OpenRouter, OpenAI, Anthropic, Ollama)
- Chat panel with threaded conversations
- Task creation and modification via chat
- Memory system (identity, profile, patterns)
- Proactive reminders and nudges
- Curated model list with capability badges

Each group header: chevron `▸` + label in 11px mono uppercase + count badge. Feature items at ~13px with subtle bullets or indentation.

### 5. Tech Stack

Spec-sheet layout. Two columns, no row borders.

| Label | Value |
|-------|-------|
| Runtime | Electron + React + TypeScript |
| Database | SQLite (better-sqlite3 + Drizzle) |
| AI | Vercel AI SDK, multi-provider |
| State | Zustand |
| Styling | Tailwind CSS |
| Editor | BlockNote |

Labels in Geist Mono uppercase `text-muted-foreground`. Values in Geist regular `text-foreground`.

### 6. Footer

- Ruled line divider
- "Untask is MIT licensed and open source."
- Three links: GitHub, Download for macOS, Releases (ghost-style or plain text)
- Version number at bottom in tiny mono

---

## Folder Structure

```
website/
├── public/
│   └── fonts/          # Geist + Geist Mono woff2
├── src/
│   ├── layouts/
│   │   └── Base.astro  # HTML shell, fonts, meta, dark mode
│   ├── components/
│   │   ├── Hero.astro
│   │   ├── AppPreview.astro
│   │   ├── Philosophy.astro
│   │   ├── Features.astro
│   │   ├── TechStack.astro
│   │   └── Footer.astro
│   ├── pages/
│   │   └── index.astro
│   └── styles/
│       └── global.css  # Tailwind + shared CSS vars
├── astro.config.mjs
├── tailwind.config.ts
├── package.json
└── tsconfig.json
```

---

## Dark Mode

Default to dark (matches app). Detect `prefers-color-scheme` and allow manual toggle via a small lamp icon in the footer or top-right — same `LampDesk` icon and radial reveal transition as the app.

---

## Not In Scope

- Blog / changelog pages (can add later with Astro content collections)
- Documentation (GitHub README is sufficient for now)
- Analytics / tracking (zero telemetry philosophy)
- Mobile responsiveness beyond basic readability (desktop-focused audience)
