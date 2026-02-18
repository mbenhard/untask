# Changelog

All notable changes to Untask will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

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

[0.1.2]: https://github.com/mbenhard/untask/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/mbenhard/untask/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/mbenhard/untask/releases/tag/v0.1.0
