# Changelog

All notable changes to Untask will be documented in this file.

## [0.1.11] - 2026-02-21

Notes redesign and interaction polish.

### Changes

**Improved**
- Redesigned notes UI with content-first hierarchy and pinning
- Note titles derived from content instead of separate title field
- Focus flow, toast feedback, and inline highlights

**Fixed**
- Quick Add no longer activates the main window
- Improved Homebrew Cask detection in update checker

## [0.1.10] - 2026-02-20

Standalone floating window for rapid task entry with slash commands and keyboard reordering.

### Highlights

- **Standalone quick add** — Floating window for task entry without opening the main app
- **Slash commands** — Type `/priority`, `/due` in quick add for richer task creation
- **Option+Arrow reordering** — Move tasks up and down with keyboard shortcuts
- **macOS Focus Mode** — Notification onboarding includes Focus Mode setup

### Changes

**Added**
- Standalone quick add window
- Redesigned quick add with slash commands and metadata row
- Option+Up/Down for task reordering
- macOS Focus Mode in notifications onboarding
- Interactive previews on website

**Improved**
- Font presets: Warm and Focus replace Classic/Plex
- Task components refactored for keyboard navigation

**Fixed**
- Duplicate task recursively copies subtasks
- Duplicate preserves effort, dueType, reminderOffset
- Focus management and subtask ordering
- Confirmation dialog for completing with active subtasks
- Hidden parent reference in nested subtask display
- Settings notice replaced with floating toast
- Startup flash eliminated
- Bundle ID for notification registration
- AI gate checks hard override before auto mode

## [0.1.9] - 2026-02-20

Ollama overhaul, notes in search, cursor tooltips, and a notification system.

### Highlights

- **Ollama overhaul** — Native API integration with auto model detection, slim mode, and thinking model support
- **Search notes** — Notes now appear alongside tasks in the search popup
- **Tooltips** — Cursor-following tooltips on buttons, badges, and counts
- **Notifications** — In-app notification system with onboarding flow
- **New shortcuts** — Cmd+Backspace to delete, context-sensitive Cmd+N

### Changes

**Added**
- Ollama native API via `ai-sdk-ollama` with model detection and warmup
- Notes in search popup
- Cursor-following tooltips
- In-app notification system with onboarding
- Cmd+Backspace to delete tasks
- Context-sensitive Cmd+N (note in Notes view, task elsewhere)
- Task body indicator dot
- Navigation pulse animation
- Chat loading states (Sending, Loading model, Thinking)
- New OpenRouter models
- Onboarding model picker

**Improved**
- Onboarding identity and AI prompt refined
- Due date picker time validation simplified
- Window minimum size increased to 620×600
- Settings section titles use uppercase mono style
- Simplified AI memory system

**Fixed**
- Keyboard navigation across task groups
- Task item layout shift on status change
- Model catalog layout and undo toast state
- Ollama warmup validation and model size warnings
- Empty chat bubble when stopping generation
- Update banner runs `brew update` before `brew upgrade`
- Auto-approve for chat actions

## [0.1.8] - 2026-02-19

Complete AI chat overhaul with modular tools and new settings UI.

### Highlights

- **AI chat refactor** — Modular tools architecture with error classification and improved streaming
- **Settings redesign** — API key manager, model catalog, and provider selector
- **Auto-titling** — Conversations automatically titled based on content

### Changes

**Improved**
- AI chat orchestration rewritten with modular tools (task, note, context)
- New settings UI: API key manager, model catalog, provider selector
- Auto-titling for conversations
- Chat store refactored into modular slices

## [0.1.7] - 2026-02-19

Apple Reminders two-way sync, a global undo system, and Quick Add improvements.

### Highlights

- **Apple Reminders sync** — Two-way sync with macOS Reminders via EventKit
- **Global undo** — Undo task actions with toast notifications and Cmd+Z
- **Quick Add without AI** — Quick Add overlay works even with AI disabled
- **Update notifications** — In-app update banner via Cloudflare Worker

### Changes

**Added**
- Apple Reminders two-way sync with debounced pulls and race prevention
- Global undo system with toast notifications
- Quick Add overlay without AI dependency
- In-app update banner

**Improved**
- Onboarding flow persistence and polish
- Quick Add overlay redesigned with unified styling
- Reminders sync reliability

**Fixed**
- Chat hidden when AI disabled; notification spam eliminated
- BlockNote body converted to markdown for Reminders
- Swift helper date parsing
- Undo stack pollution prevented

## [0.1.6] - 2026-02-18

Update banner now checks on every window activation.

### Changes

**Fixed**
- Update banner reliability when reopening without quitting

## [0.1.5] - 2026-02-18

Redesigned due date picker and note archive restore.

### Highlights

- **Due date picker** — Redesigned time input with cleaner layout and disabled state
- **Calendar polish** — Refined day cell sizing, spacing, and selected state
- **Note restore** — Archived notes can be restored back to active

### Changes

**Improved**
- Due date picker time input redesigned
- Calendar day cell sizing and spacing refined
- Archived notes can be restored with one click

## [0.1.4] - 2026-02-18

Fixes the update banner not appearing for users on v0.1.2.

### Changes

**Fixed**
- Update banner race condition: replaced renderer polling with push-based IPC

## [0.1.3] - 2026-02-18

Native reminder notifications, a revamped due date picker, and AI personalization.

### Highlights

- **Native reminders** — macOS system notifications for due tasks, even with AI disabled
- **Click-to-navigate** — Tapping a notification opens Untask and jumps to the task
- **Overdue catch-up** — Missed reminders fire on next launch
- **Remind me presets** — At due time, 15 min, 1 hour, or 1 day before
- **Due date shortcuts** — Today, Tomorrow, Next Week in the picker

### Changes

**Added**
- Native macOS reminder notifications independent of AI
- Click-to-navigate notification handling
- Overdue catch-up on app launch
- Remind me offset selector in due date picker
- Due date quick presets (Today, Tomorrow, Next Week)

**Improved**
- AI assistant uses your name from onboarding
- Upgraded to Claude Sonnet 4.6

**Fixed**
- External links open in default browser
- Chat timestamp alignment

## [0.1.2] - 2026-02-18

Multi-provider AI, file attachments, and macOS-native window behavior.

### Highlights

- **Multi-provider AI** — Switch between OpenRouter, OpenAI, Anthropic, and Ollama from Settings
- **File attachments** — Drag-and-drop images and files into notes with auto-resizing
- **Chat sidebar** — Browse and switch conversation threads in a dedicated sidebar
- **macOS window behavior** — Window shows on launch, close hides to tray, position remembered
- **Bulletproof API keys** — Encrypted Keychain storage with automatic fallback

### Changes

**Added**
- Multi-provider AI support with validated API key storage
- File attachments in notes with automatic image resizing
- Chat thread sidebar
- Bird mascot in chat
- Dock mode toggle
- Keyboard shortcuts for notes
- Custom `untask://` protocol handler

**Improved**
- Window shows on launch, close hides to tray
- Window position and size restored across restarts
- Single instance lock prevents duplicate windows
- Redesigned Settings UI
- Provider abstraction with typed configs
- Domain-organized IPC handlers

**Fixed**
- API key storage reliability with dual-slot strategy
- API key validation against authenticated endpoints
- Zod validation on all IPC handlers

## [0.1.1] - 2026-02-18

Fixes the native database module missing from the packaged app.

### Changes

**Fixed**
- Native `better-sqlite3` module included in packaged app
- Version corrected from 1.0.0 to 0.1.1

## [0.1.0] - 2026-02-18

Initial open-source release — local-first task management with an optional AI assistant.

### Highlights

- **Task management** — Configurable status lanes with drag-and-drop reordering
- **AI assistant** — Chat-based task creation with multi-provider support (bring your own key)
- **Rich notes** — BlockNote editor with full-text search across tasks and notes
- **Global shortcut** — Clipboard quick-add via Ctrl+Space
- **Dark mode default** — Monochrome UI with light mode parity

### Changes

**Added**
- Task management with configurable status lanes
- Drag-and-drop reordering
- Rich text notes (BlockNote editor)
- Full-text search across tasks and notes
- Clipboard quick-add via global shortcut
- Backup and restore (encrypted export supported)
- Dark mode default with light mode
- Multi-provider AI: OpenRouter, OpenAI, Anthropic, Ollama
- Chat-based task creation and modification
- Structured AI memory system (profile, patterns, observations)
- All AI mutations logged and undoable

[0.1.11]: https://github.com/mbenhard/untask/compare/v0.1.10...v0.1.11
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
