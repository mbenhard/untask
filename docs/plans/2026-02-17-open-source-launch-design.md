# Untask — Open Source Launch Design

**Date:** 2026-02-17
**Status:** Draft
**Goal:** Transform Flusk (personal AI assistant) into Untask, an open source community tool that others can use as their own personal task manager + AI assistant.

---

## 1. Product Vision

Untask is a local-first personal task manager with an optional AI assistant. Users can use it as a pure task manager (no API key needed) or enable AI for chat, memory, proactive reminders, and task automation.

**Key principles:**
- AI is optional, not required. The app is useful without it.
- Zero telemetry, zero tracking. Everything stays on-device.
- Minimal OS permissions. Ask lazily, not eagerly.
- BYOK (Bring Your Own Key) for AI providers.

**Mascot:** Punpun-style bird.
**Launch platform:** macOS only. Windows/Linux added later based on demand.

---

## 2. Onboarding Flow

### Screen 1 — Welcome
- App name + bird mascot illustration
- One-liner: "Your personal task manager and AI assistant"
- `[Get Started]` button

### Screen 2 — Basics
- "What should I call you?" → name input
- "Enable AI assistant?" → toggle (defaults ON)
- If OFF → skip to Screen 5 (pure task manager)
- If ON → continue to Screen 3

### Screen 3 — AI Provider Setup
- Provider selector: OpenRouter / OpenAI / Anthropic / Ollama (local)
- API key input (password-masked) with "Where do I get a key?" link per provider
- Ollama: base URL only, no key needed
- `[Validate Key]` button — test API call, green check or error
- "Your key is stored securely on your device. Never sent anywhere else."

### Screen 4 — Identity Setup (guided)
- "Tell me a bit about yourself so I can be more helpful"
- "What do you do?" → freelancer / developer / student / creative / other
- "How should I communicate?" → direct & concise / friendly & casual / professional
- "What's your main focus?" → free text (e.g. "shipping my startup")
- Generates a personalized identity document from answers

### Screen 5 — Ready
- "You're all set." + bird mascot
- `[Open App]`

---

## 3. AI-Optional Architecture

### Core Mode (always available, no API key)
- Task management (create, edit, status lanes, drag-drop, due dates, recurrence)
- Notes (rich text editor via BlockNote)
- Full-text search across tasks and notes
- Configurable task status lanes
- Task events audit trail with undo
- Clipboard quick-add (global shortcut)
- Backup/restore
- Keyboard shortcuts
- Tray icon with today count

### AI Mode (opt-in, requires provider setup)
- Chat panel (appears when enabled, hidden when disabled)
- Multi-threaded conversations
- AI task creation/modification via chat
- Memory layers (identity, profile, patterns, journal)
- Proactive reminders and nudges
- Weekly digest / journal summaries
- Tool execution with autonomy gate (confirm/auto)

### Toggle behavior
- Global setting: `ai.enabled` (boolean)
- When OFF: chat panel hidden, proactive loop stopped, AI settings pages hidden
- When ON: full experience with chat panel
- Toggleable anytime in Settings → General
- Toggling OFF preserves all chat history and memory (restored if toggled back ON)

### Layout
- AI OFF: single-column, full-width task manager + notes
- AI ON: current overlay layout (tasks full-width + chat as sliding panel)
- Chat is already an overlay (`<aside>` positioned absolutely) — making it conditional is ~20 lines

---

## 4. Multi-Provider System

### Supported providers
| Provider | Key required | Notes |
|----------|-------------|-------|
| OpenRouter | Yes | Default recommendation. One key, 100+ models. |
| OpenAI | Yes | Direct API access |
| Anthropic | Yes | Direct API access |
| Ollama | No (base URL only) | Local models, free, private |

### Curated model list (default view)
| Model | Provider | Why |
|-------|----------|-----|
| GPT-4o mini | OpenRouter / OpenAI | Cheap, fast, strong tool support. Default. |
| GPT-4o | OpenRouter / OpenAI | Premium all-rounder |
| Claude Sonnet 4.5 | OpenRouter / Anthropic | Strong reasoning + tools |
| Claude Haiku 4.5 | OpenRouter / Anthropic | Fast + cheap |
| Gemini 2.5 Flash | OpenRouter / Google | Free tier friendly |
| Llama 3.3 70B | Ollama | Best local with tool support |
| Qwen 3 8B | Ollama | Lightweight, runs on 8GB RAM |

- "Show all models" toggle in settings unlocks full provider model lists
- Model picker shows: name, context window, cost tier, capability badges (tools, vision, reasoning)

### Capability gating
- Models without tool calling: chat works, tool-dependent features degrade gracefully
- Message: "This model doesn't support task actions. Switch to [model] to enable it."
- No hard blocks — chat always works

### Key storage
- Electron `safeStorage` API (macOS Keychain, Windows DPAPI, Linux libsecret)
- Keys never touch the renderer process
- IPC exposes actions (`chat:send`), not secrets (`getApiKey`)
- Migration: move existing plaintext SQLite keys → safeStorage on first launch

---

## 5. Identity System (Generalized)

### Current state (personal)
- Hardcoded seed identity: "You are Marcus's personal assistant in Flusk..."
- Soul/Charter docs in `docs/assistant/`

### New state (generic + personalized)
- Default generic identity: "You are the user's personal assistant in Untask..."
- Onboarding generates a personalized identity from user answers (Screen 4)
- Identity document is editable in Settings → AI → Identity
- Soul traits and communication style stored as structured settings, not hardcoded

### Identity layers (runtime prompt assembly)
1. **Base identity**: generic assistant role + boundaries
2. **Personality**: communication style from onboarding (direct/casual/professional)
3. **User context**: name, occupation, focus area from onboarding
4. **Learned profile**: facts/preferences accumulated over time (editable)
5. **Patterns**: recurring workflows detected by AI
6. **Journal**: time-based observations
7. **Live context**: current tasks, due dates, today focus

---

## 6. macOS Permissions (Minimal)

| Permission | When requested | Default |
|-----------|---------------|---------|
| Network | Automatic (API calls) | Always needed if AI enabled |
| Keychain (safeStorage) | Transparent, no prompt | On key save |
| Notifications | Lazy — only when user enables reminders | Not requested at launch |
| Login items | Lazy — only when user toggles "Launch at login" | Not requested at launch |
| Camera | Never | — |
| Microphone | Never | — |
| Location | Never | — |
| Contacts | Never | — |
| Accessibility | Never | — |
| Full disk access | Never | — |

**Principle:** Zero permissions on first launch. Ask only when the user triggers a feature that needs it.

**Build hardening:** Strip unused entitlements from the app bundle. Only include entitlements for features we actually use (network, keychain). This keeps the app lightweight for notarization if signing is added later.

---

## 7. Update System (Zero-Cost)

### Approach: Update notifier (not auto-updater)
- No Apple Developer Program ($99/year) required
- No code signing required

### How it works
1. On app launch, fetch latest release from GitHub Releases API
2. Compare version with current `app.getVersion()`
3. If newer version exists → show subtle in-app banner: "Untask v1.2.0 available"
4. Banner links to GitHub Releases page for manual download
5. Check interval: on launch + every 6 hours (configurable, can be disabled)

### First install experience (macOS Sequoia+)
1. Download DMG from GitHub Releases
2. Drag to Applications
3. First launch → "cannot be opened because developer cannot be verified"
4. System Settings → Privacy & Security → Click "Open Anyway"
5. Never asked again

### Mitigation
- Clear instructions with screenshots in README
- Custom Homebrew tap (`brew tap untask/untask`) with quarantine removal
- Terminal one-liner in docs: `xattr -cr /Applications/Untask.app`

### Future upgrade path
- If project gains traction / donations justify it → add Apple Developer signing ($99/year)
- Unlocks: seamless first launch, true auto-updates, Homebrew main cask listing
- Note: Homebrew is removing all unsigned casks from the main repo by September 2026. Custom tap works indefinitely, but main repo listing requires signing.

---

## 8. Security Hardening

### API key storage
- **Before:** plaintext in SQLite `settings` table
- **After:** Electron `safeStorage` (macOS Keychain)
- Migration on first launch of new version

### Backup safety
- Strip API keys from backup exports
- Require re-entry of API keys on restore
- Keep optional encryption for general backup data

### Production hardening
- Disable DevTools when `app.isPackaged === true`
- Existing fuses already good: no Node integration, sandbox enabled, context isolation, cookie encryption, ASAR integrity validation

### Repo hygiene
- `.env.example` with placeholder values (`.env` gitignored)
- No secrets in source code
- GitHub Actions secrets for any CI credentials

---

## 9. Fresh Repo Setup

### Why fresh repo
- Clean git history (no personal data in old commits)
- Professional first impression
- No risk of leaked API keys or personal references

### Repo structure
```
untask/
├── src/
│   ├── main/                   # Electron main process
│   ├── preload/                # IPC bridge
│   ├── renderer/               # React UI
│   └── types/                  # TypeScript definitions
├── drizzle/                    # Database migrations
├── assets/                     # Icons, tray images, mascot
├── docs/
│   └── ARCHITECTURE.md         # Process boundaries, IPC design
├── .github/
│   ├── workflows/
│   │   └── build.yml           # Build on PRs + release on tags
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md
│   │   └── feature_request.md
│   └── PULL_REQUEST_TEMPLATE.md
├── README.md
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── SECURITY.md
├── LICENSE                     # MIT
├── .env.example
└── package.json
```

### README sections
1. App name + bird mascot + screenshot
2. Features (task manager, AI chat, memory, proactive assistant, notes, configurable statuses)
3. Download + macOS Gatekeeper instructions
4. Development quickstart (`pnpm install && pnpm dev`)
5. Contributing link
6. License (MIT)

### GitHub Actions
- **On PR:** typecheck + lint
- **On tag `v*`:** build macOS DMG → create draft GitHub Release with artifact

---

## 10. Rename Checklist (Flusk → Untask)

Full list of locations requiring rename (from codebase audit):

- [ ] `package.json` — name, author, description, repository
- [ ] Window title (main process)
- [ ] Tray tooltip (`tray.ts` line 21)
- [ ] App bundle identifier (forge.config.ts)
- [ ] Database filename (`db/index.ts` line 17: `flusk.db` → `untask.db`)
- [ ] Database migration: detect `flusk.db` on startup, rename to `untask.db`
- [ ] Backup filenames (`backupService.ts`: `flusk-backup-*` → `untask-backup-*`)
- [ ] Preload API namespace (`preload/index.ts` line 291: `window.flusk` → `window.untask`)
- [ ] Renderer API helper (`renderer/lib/flusk.ts` → `renderer/lib/untask.ts`)
- [ ] All store imports referencing `getFlusk()` → `getUntask()`
- [ ] Type definitions (`types/preload.d.ts`: `FluskApi` → `UntaskApi`)
- [ ] Seed identity text (`memory.ts` line 49)
- [ ] Proactive loop messages (`proactiveLoop.ts` line 29: "Remind Marcus" → "Remind the user")
- [ ] Soul/Charter docs (`docs/assistant/SOUL.md`, `CHARTER.md` — de-personalize)
- [ ] All user-facing strings
- [ ] Asset filenames
- [ ] Sanitize absolute paths in all docs (remove `/Users/marcusbenhard/...`)

---

## 11. Codebase Audit Findings

Issues discovered during deep audit that the original design missed:

### Critical — Must fix before release

| Issue | Location | Fix |
|-------|----------|-----|
| Proactive loop uses "Marcus" | `proactiveLoop.ts:29` | Replace with "the user" or user's configured name |
| Default model is Kimi K2.5 (Chinese LLM) | `models.ts:25` | Set smart default based on first configured provider |
| Auto-title model hardcoded to OpenRouter | `chat.ts:43` (`openai/gpt-4o-mini`) | Use selected model or provider-aware fallback |
| No first-launch detection | No `bootstrap_completed` flag | Add setting, gate onboarding on it |
| DB rename loses data | `db/index.ts:17` | Detect `flusk.db`, rename to `untask.db` before opening |
| Settings defaults scattered across 8+ files | Multiple | Create centralized `defaultSettings.ts` |
| System prompt crashes on empty identity | `systemPrompt.ts:136-138` | Add graceful fallback for first-time users |
| Provider abstraction doesn't exist | `openrouter.ts` is only provider | Build provider interface layer |

### Medium — Should fix before release

| Issue | Location | Fix |
|-------|----------|-----|
| `SettingsAI.tsx` hardcodes OpenRouter | Renderer settings | Add provider selector dropdown |
| `@extractus/article-extractor` dependency | `package.json` | Verify if used; remove if not |
| `@blocknote/*` is heavy | `package.json` | Verify license; consider lazy loading |
| Backup exports include API keys in plaintext | `backupService.ts` | Strip keys before export |
| Clipboard quick-add has no permission check | `clipboard.ts` | Request lazily, handle denial |

### Already clean (no changes needed)

| Area | Status |
|------|--------|
| Renderer components | No personal data, provider-agnostic stores |
| Chat panel | Already an overlay — making conditional is ~20 lines |
| CSS/theming | All CSS variables, dark/light mode works |
| IPC architecture | Well-typed, domain-scoped, sandboxed |
| Keyboard shortcuts | All generic, configurable |
| Accessibility | ARIA attrs, focus management, motion preferences |
| Type system | Provider-agnostic, generic model abstractions |

---

## 12. Features Not Previously Documented

These existing features work today but weren't mentioned in the design:

| Feature | Mode | Notes |
|---------|------|-------|
| Notes system | Core (no AI needed) | Rich text editor via BlockNote |
| Configurable task status lanes | Core | Users can add/remove/reorder status columns |
| Task events audit trail | Core | All task mutations logged, supports undo |
| Weekly digest / journal | AI mode | Auto-generated memory summaries |
| Clipboard quick-add | Core | Global shortcut to capture tasks from clipboard |
| Full-text search | Core | FTS across tasks and notes |

These should be mentioned in the README as features.

---

## 13. Implementation Phases (Revised)

### Phase 0: Audit & Cleanup (before any new features)
1. Remove all "Marcus" / personal references from code and docs
2. Create centralized `defaultSettings.ts` with all defaults
3. Add `bootstrap_completed` flag to settings schema
4. Fix system prompt empty-state handling (graceful fallback)
5. Verify/remove unused dependencies (`@extractus/article-extractor`)
6. Audit and lazy-load heavy dependencies (`@blocknote/*`)

### Phase 1: Foundation (make it work for others)
7. Build provider abstraction layer (interface over OpenRouter/OpenAI/Anthropic/Ollama)
8. Make default model context-aware (based on configured provider)
9. Fix auto-title model to use selected provider, not hardcoded OpenRouter
10. Migrate API key storage to `safeStorage`
11. Add `ai.enabled` toggle — hide chat panel, stop proactive loop when OFF
12. Add onboarding flow (5 screens: welcome → basics → provider → identity → ready)
13. Curated model list with capability badges + "show all" toggle

### Phase 2: Polish (make it professional)
14. Update notifier (GitHub Releases API check + in-app banner)
15. Strip API keys from backup exports
16. Disable DevTools in production builds
17. Make clipboard quick-add permission-lazy
18. Multi-provider settings UI in `SettingsAI.tsx`

### Phase 3: Repo & Docs (make it public)
19. Rename Flusk → Untask (full checklist from Section 10)
20. DB migration logic (`flusk.db` → `untask.db`)
21. Create fresh repo with clean git history
22. Write README (features, screenshot, install, Gatekeeper instructions, dev setup)
23. Write CONTRIBUTING.md, ARCHITECTURE.md
24. Add LICENSE (MIT), CODE_OF_CONDUCT.md, SECURITY.md
25. Add GitHub issue/PR templates
26. Set up GitHub Actions (typecheck + lint on PR, build DMG on tag)

### Phase 4: Launch
27. First tagged release (v0.1.0) on GitHub Releases
28. Custom Homebrew tap with quarantine removal
29. Share on communities (Reddit r/electronjs, r/selfhosted, HN, Twitter/X)

---

## 14. What We're NOT Doing (YAGNI)

- Plugin/extension system (add later if community requests it)
- Windows/Linux builds at launch (add based on demand)
- Apple Developer code signing (add if donations/traction justify it)
- Telemetry or analytics (never)
- User accounts or cloud sync (local-first forever)
- Paid tier or premium features (fully open source)
- Desktop-first redesign (keep current minimal aesthetic)
