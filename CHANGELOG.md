# Changelog

All notable changes to Untask will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.10] - 2026-02-20

### Added

- **Standalone quick add window** — New floating window for rapid task entry
- **Redesigned quick add UI** — Slash commands & metadata row for richer task creation
- **Option+Arrow keyboard shortcuts** — Reorder tasks with Option+Up/Down
- **macOS Focus Mode integration** — Notifications onboarding now includes Focus Mode setup
- **Website interactive previews** — Auto-playing demos on marketing site

### Improved

- **Font presets** — Replaced Classic/Plex with Warm and Focus options
- **Task component refactor** — Better keyboard navigation support

### Fixed

- Duplicate task now recursively copies all subtasks
- Duplicate task preserves effort, dueType, and reminderOffset
- Focus management and subtask ordering
- Confirmation dialog for completing tasks with active subtasks
- Hide parent reference in nested subtask display
- Settings notice banner replaced with floating toast
- Eliminated startup flash and empty task list flicker
- Fixed bundle ID for macOS notification registration
- Assets.car tracking for CI packaging
- AI gate evaluation now checks hard override before auto mode

## [0.1.9] - 2026-02-20

### Added

- **Ollama overhaul** — Native API integration via `ai-sdk-ollama` with automatic model detection, slim mode for small models, thinking model support, pre-stream warmup, and speed optimizations
- **Search notes** — Notes now appear in the search popup alongside tasks
- **Tooltips** — Cursor-following tooltips on icon buttons, due date badges, and subtask counts
- **Notification system** — In-app notifications with onboarding flow
- **Keyboard shortcuts** — `Cmd+Backspace` to delete tasks; `Cmd+N` is now context-sensitive (creates a note in Notes view, task elsewhere)
- **Task body indicator** — Visual dot showing which tasks have body content
- **Navigation pulse** — Background pulse animation when navigating to a task
- **Chat loading states** — Phase-aware indicators: Sending, Loading model, Thinking
- **New AI models** — Additional OpenRouter models and updated tooling schema
- **Onboarding model picker** — Model selection added to the provider setup step

### Improved

- Onboarding identity and AI system prompt refined
- Due date picker simplified with better time validation
- Window minimum size increased (620x600) for better layout
- Settings section titles use uppercase mono style
- Simplified AI memory system (removed background knowledge extraction)

### Fixed

- Keyboard navigation across task groups
- Task item layout shift on status change
- Model catalog view layout and undo toast state
- Ollama warmup validation and model size warnings
- Empty chat bubble showing when stopping generation
- Update banner now runs `brew update` before `brew upgrade`
- Auto-approve for chat actions

## [0.1.8] - 2026-02-19

### Changed

- **AI Chat refactor** — Major overhaul of chat orchestration with modular tools architecture (task, note, context helpers), error classification system, and improved stream handling
- New settings UI: API key manager, model catalog, and provider selector
- Added auto-titling for conversations
- Chat store refactored into modular slices

### Website

- Added Reminders sync callout to landing page
- Updated preview sections

## [0.1.7] - 2026-02-19

### Added

- **Apple Reminders sync** — Two-way sync with the macOS Reminders app via EventKit, with import, pull debounce, and race prevention
- **Global undo system** — Undo task actions with toast notifications (Cmd+Z)
- **Quick Add when AI is disabled** — Quick Add overlay works without AI enabled
- **Update notifications** — In-app update banner via Cloudflare Worker

### Improved

- Onboarding flow data persistence and polish
- Quick Add overlay redesigned with unified popup styling
- Reminders sync reliability (debounced pulls, race condition prevention)

### Fixed

- Chat hidden when AI is disabled; notification spam on AI toggle eliminated
- BlockNote body correctly converted to markdown for Reminders notes
- Swift helper date parsing and unsigned distribution build
- Undo stack pollution prevented

## [0.1.6] - 2026-02-18

Throttled update checks to 15-minute intervals; trigger on app activation.

## [0.1.5] - 2026-02-18

Redesigned due date picker UI and calendar styling; added note restore.

## [0.1.4] - 2026-02-18

Fixed update banner: push notification from main process instead of renderer polling.

## [0.1.3] - 2026-02-18

Standalone ReminderScheduler (no longer AI-gated); AI personalization with user's name; external links open in system browser.

## [0.1.2] - 2026-02-18

### Added

- **Multi-provider AI support** — Switch between OpenRouter, OpenAI, Anthropic, and Ollama from Settings with validated API key storage
- **File attachments in notes** — Drag-and-drop images and files into the note editor with automatic image resizing
- **Chat thread sidebar** — Browse and switch between conversation threads in a dedicated sidebar
- **Bird mascot** — Animated companion in the chat interface
- **Dock mode** — Toggle between tray-only and dock app modes
- **Keyboard shortcuts for notes** — Arrow keys to navigate notes list, Enter to open, improved focus management
- **Custom URL protocol** — `untask://` protocol handler for deep linking
- **SettingsCard component** — Reusable card component for the settings UI
- **File context menus** — Right-click context menus in the block editor

### Changed

- **Window shows on launch** — App window appears when clicking the dock icon or launching the app
- **Close button hides, doesn't quit** — Cmd+W and the close button hide the window; quit via Cmd+Q or tray menu
- **Window position restored** — Remembers size and position across restarts
- **Single instance lock** — Prevents duplicate app instances; re-focuses existing window
- **Redesigned Settings** — Expanded shortcuts UI, better visual design for general and AI settings
- **Enhanced block editor** — File handling support with context menus
- **Improved task body** — Better formatting and rendering in task detail view
- **Simplified chat input** — Cleaner input area design
- **Extended CSS system** — Refined styles across the app
- **Provider abstraction** — Clean factory pattern for AI providers with typed configs
- **Refactored IPC** — Domain-organized handlers with better error handling
- **Runtime AI toggle** — Start/stop the proactive AI loop from settings without restart

### Fixed

- **API key storage reliability** — Dual-slot strategy: encrypted via macOS Keychain when available, with plaintext fallback that always works (even for unsigned builds)
- **API key validation** — OpenRouter, OpenAI, and Anthropic keys validated against authenticated endpoints
- **Zod validation on IPC** — All API key handlers validate input with Zod schemas

### Removed

- `@extractus/article-extractor` dependency (unused)
- ThreadDropdown component (replaced by ThreadListView sidebar)

### Security

- Electron security fuses configured for production hardening
- API keys stripped from backup exports
- Background update checker for new versions

## [0.1.1] - 2026-02-18

### Fixed

- Native `better-sqlite3` module included in packaged app (was excluded by Vite plugin's default ignore)
- pnpm `symlink=false` in `.npmrc` to fix native module packaging
- `.npmrc` `node-linker=hoisted` for Electron Forge compatibility
- CI pipeline: full `pnpm install` (not `--ignore-scripts`) to download Electron binary
- Added missing `@ai-sdk/anthropic` dependency

## [0.1.0] - 2026-02-18

### Added

- Initial open-source release
- Local-first task management with SQLite database
- AI chat assistant (OpenRouter provider)
- Note-taking with BlockNote editor
- Tray app with global keyboard shortcut (Ctrl+Space)
- Proactive AI assistant with memory and journaling
- macOS app with Electron Forge packaging
- Homebrew cask distribution

[0.1.10]: https://github.com/mbenhard/untask/compare/v0.1.9...v0.1.10
[0.1.9]: https://github.com/mbenhard/untask/compare/v0.1.8...v0.1.9
[0.1.8]: https://github.com/mbenhard/untask/compare/v0.1.7...v0.1.8
[0.1.7]: https://github.com/mbenhard/untask/compare/v0.1.6...v0.1.7
[0.1.6]: https://github.com/mbenhard/untask/compare/v0.1.5...v0.1.6
[0.1.5]: https://github.com/mbenhard/untask/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/mbenhard/untask/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/mbenhard/untask/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/mbenhard/untask/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/mbenhard/untask/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/mbenhard/untask/releases/tag/v0.1.0
