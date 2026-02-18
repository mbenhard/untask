# Untask

**A local-first personal task manager with an optional AI assistant**

![Platform: macOS](https://img.shields.io/badge/platform-macOS-lightgrey)
![License: MIT](https://img.shields.io/badge/license-MIT-blue)
![GitHub Release](https://img.shields.io/github/v/release/mbenhard/untask)

---

## Features

### Core — no AI required

- Task management with configurable status lanes
- Drag-and-drop task reordering
- Rich text notes (BlockNote editor)
- Full-text search across tasks and notes
- Task events audit trail with undo
- Clipboard quick-add via global shortcut
- Backup and restore
- Keyboard shortcuts
- Tray icon with today count
- Dark mode (default) + light mode

### AI Assistant — opt-in, bring your own key

- Multi-provider support (OpenRouter, OpenAI, Anthropic, Ollama)
- Chat panel with multi-threaded conversations
- AI task creation and modification via chat
- Memory system (identity, profile, patterns)
- Proactive reminders and nudges
- Curated model list with capability badges

---

## Download

Download the latest release from [GitHub Releases](https://github.com/mbenhard/untask/releases).

### macOS Gatekeeper

Because Untask is not notarized through the Mac App Store, macOS will block the first launch. To open it:

1. Download the `.dmg` from GitHub Releases
2. Open the DMG and drag Untask to your Applications folder
3. On first launch, macOS will say: *"cannot be opened because the developer cannot be verified"*
4. Open **System Settings → Privacy & Security** and click **Open Anyway**
5. Alternatively, run this command in Terminal:
   ```sh
   xattr -cr /Applications/Untask.app
   ```

---

## Development

```bash
git clone https://github.com/mbenhard/untask.git
cd untask
pnpm install
pnpm start
```

---

## Tech Stack

- **Electron + React + TypeScript** — desktop shell and UI
- **SQLite** (better-sqlite3 + Drizzle ORM) — local database
- **Vercel AI SDK** — multi-provider AI support
- **Zustand** — state management
- **Tailwind CSS** — styling

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## License

MIT
