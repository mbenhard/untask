# Task ID: 13

**Title:** TUI Scaffold with Ratatui

**Status:** pending

**Dependencies:** 10

**Priority:** medium

**Description:** Set up the terminal UI shell with Ratatui/Crossterm, main view structure, and keyboard navigation foundation.

**Details:**

Create the TUI foundation:

1. Add TUI dependencies to `crates/unship-cli/Cargo.toml`:
```toml
ratatui = "0.29"
crossterm = "0.28"
```

2. Create `crates/unship-cli/src/tui/mod.rs`:
```rust
pub mod app;
pub mod kanban;
pub mod list;
pub mod docs;
pub mod detail;

pub fn run() -> Result<()> {
    let mut terminal = setup_terminal()?;
    let app = App::new()?;
    let result = run_app(&mut terminal, app);
    restore_terminal()?;
    result
}
```

3. Create `crates/unship-cli/src/tui/app.rs`:
```rust
pub struct App {
    pub view: View,
    pub store: TaskStore,
    pub docs_store: DocsStore,
    pub tasks: Vec<Task>,
    pub should_quit: bool,
}

pub enum View {
    Kanban,
    List,
    Docs,
    TaskDetail(u32),
}

impl App {
    pub fn handle_key(&mut self, key: KeyEvent) -> Result<()>;
    pub fn refresh(&mut self) -> Result<()>;
}
```

4. Implement keyboard navigation:
   - `q` / Ctrl+C: quit
   - `1-4` or Tab: switch views
   - Arrow keys / hjkl: navigate within view
   - Enter: select/open detail
   - Escape: go back

5. Wire up main.rs: when no subcommand, call `tui::run()`.

**Test Strategy:**

Manual testing required for TUI:
1. Run `cargo run -p unship` (no args) - TUI should launch.
2. Verify quit with 'q' and Ctrl+C works cleanly.
3. Verify view switching with keyboard shortcuts.
4. Verify clean terminal restoration on exit.
5. Verify terminal state is restored even on panic (catch_unwind).
