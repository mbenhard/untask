# TUI File Watching and Real-time Updates - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add file watching for `.untask/` and configured doc paths with debounced refresh so the TUI reflects external changes in real time.

**Architecture:** A `FileWatcher` struct wraps the `notify` crate's `RecommendedWatcher`, sending refresh signals through an `mpsc` channel. The main TUI event loop checks for pending refresh signals each iteration (alongside keyboard polling). Debouncing is handled in the consumer: events are coalesced by tracking the last event timestamp and only triggering refresh after 200ms of quiet.

**Tech Stack:** `notify = "8.2"` (cross-platform filesystem notification), `std::sync::mpsc`, `std::time::Instant`

---

### Task 1: Add notify dependency and create FileWatcher struct

**Files:**
- Modify: `crates/untask-cli/Cargo.toml`
- Create: `crates/untask-cli/src/tui/watcher.rs`
- Modify: `crates/untask-cli/src/tui/mod.rs` (add `mod watcher;`)

**Step 1: Add notify dependency**

In `crates/untask-cli/Cargo.toml`, add under `[dependencies]`:
```toml
notify = "8.2"
```

**Step 2: Create watcher.rs with FileWatcher struct**

Create `crates/untask-cli/src/tui/watcher.rs`:

```rust
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::time::{Duration, Instant};

use notify::{Event, RecursiveMode, Watcher};

use untask_core::config::Config;

const DEBOUNCE: Duration = Duration::from_millis(200);

pub struct FileWatcher {
    _watcher: notify::RecommendedWatcher,
    receiver: mpsc::Receiver<()>,
    last_event: Option<Instant>,
}

impl FileWatcher {
    pub fn new(project_root: &Path, config: &Config) -> Option<Self> {
        let (tx, rx) = mpsc::channel();

        let sender = tx.clone();
        let mut watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
            if let Ok(event) = res {
                if Self::is_relevant(&event) {
                    let _ = sender.send(());
                }
            }
        })
        .ok()?;

        // Watch .untask/ recursively (covers tasks + default docs)
        let untask_dir = project_root.join(".untask");
        if untask_dir.is_dir() {
            let _ = watcher.watch(&untask_dir, RecursiveMode::Recursive);
        }

        // Watch additional doc root directories outside .untask/
        for path in Self::extra_doc_roots(project_root, config) {
            if path.is_dir() {
                let _ = watcher.watch(&path, RecursiveMode::Recursive);
            }
        }

        Some(Self {
            _watcher: watcher,
            receiver: rx,
            last_event: None,
        })
    }

    /// Check if a refresh should be triggered (debounced).
    ///
    /// Drains pending signals and returns true only after 200ms of quiet
    /// following the most recent filesystem event.
    pub fn should_refresh(&mut self) -> bool {
        // Drain all pending signals
        let mut got_event = false;
        while self.receiver.try_recv().is_ok() {
            got_event = true;
        }

        if got_event {
            self.last_event = Some(Instant::now());
        }

        if let Some(last) = self.last_event {
            if last.elapsed() >= DEBOUNCE {
                self.last_event = None;
                return true;
            }
        }

        false
    }

    /// Filter: only care about .md file changes; ignore .lock and temp files.
    fn is_relevant(event: &Event) -> bool {
        event.paths.iter().any(|path| {
            let ext = path.extension().and_then(|e| e.to_str());
            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");

            // Accept .md and .yml files (tasks, docs, config)
            matches!(ext, Some("md") | Some("yml"))
                // Reject lock file
                && name != ".lock"
        })
    }

    /// Extract doc glob root directories that are outside .untask/.
    fn extra_doc_roots(project_root: &Path, config: &Config) -> Vec<PathBuf> {
        config
            .docs
            .iter()
            .filter_map(|pattern| {
                // Extract static prefix before any glob characters
                let prefix: String = pattern
                    .chars()
                    .take_while(|c| !matches!(c, '*' | '?' | '['))
                    .collect();

                let prefix = prefix.trim_end_matches('/');
                if prefix.is_empty() {
                    return None;
                }

                let path = project_root.join(prefix);

                // Skip if already under .untask/
                let untask_dir = project_root.join(".untask");
                if path.starts_with(&untask_dir) {
                    return None;
                }

                // Walk up to find an existing directory
                let mut candidate = path.as_path();
                while !candidate.is_dir() {
                    candidate = candidate.parent()?;
                }

                // Don't watch the project root itself (too broad)
                if candidate == project_root {
                    return None;
                }

                Some(candidate.to_path_buf())
            })
            .collect()
    }
}
```

**Step 3: Add module declaration**

In `crates/untask-cli/src/tui/mod.rs`, add after existing module declarations:
```rust
mod watcher;
```

**Step 4: Verify it compiles**

Run: `cargo check -p untask 2>&1`
Expected: compiles without errors (warnings about unused code are fine)

**Step 5: Commit**

```bash
git add crates/untask-cli/Cargo.toml crates/untask-cli/src/tui/watcher.rs crates/untask-cli/src/tui/mod.rs Cargo.lock
git commit -m "feat(tui): add file watcher module with notify crate"
```

---

### Task 2: Add tests for debouncing and filtering logic

**Files:**
- Modify: `crates/untask-cli/src/tui/watcher.rs` (add `#[cfg(test)]` module)

**Step 1: Write tests for is_relevant filtering**

Add at the bottom of `watcher.rs`:

```rust
#[cfg(test)]
mod tests {
    use std::path::PathBuf;
    use std::sync::mpsc;
    use std::time::Duration;

    use notify::{Event, EventKind, event::CreateKind};

    use super::*;

    fn event_with_paths(paths: Vec<&str>) -> Event {
        Event {
            kind: EventKind::Create(CreateKind::File),
            paths: paths.into_iter().map(PathBuf::from).collect(),
            attrs: Default::default(),
        }
    }

    #[test]
    fn relevant_for_md_files() {
        let event = event_with_paths(vec!["/project/.untask/tasks/001-foo.md"]);
        assert!(FileWatcher::is_relevant(&event));
    }

    #[test]
    fn relevant_for_yml_files() {
        let event = event_with_paths(vec!["/project/.untask/config.yml"]);
        assert!(FileWatcher::is_relevant(&event));
    }

    #[test]
    fn ignores_lock_file() {
        let event = event_with_paths(vec!["/project/.untask/.lock"]);
        assert!(!FileWatcher::is_relevant(&event));
    }

    #[test]
    fn ignores_temp_files() {
        let event = event_with_paths(vec!["/project/.untask/tasks/.tmpXa1b2c"]);
        assert!(!FileWatcher::is_relevant(&event));
    }

    #[test]
    fn ignores_non_md_non_yml() {
        let event = event_with_paths(vec!["/project/.untask/tasks/notes.txt"]);
        assert!(!FileWatcher::is_relevant(&event));
    }

    #[test]
    fn debounce_waits_before_refresh() {
        let (tx, rx) = mpsc::channel();
        let mut watcher_state = DebounceHelper { receiver: rx, last_event: None };

        // Send a signal
        tx.send(()).unwrap();

        // Immediately: should NOT refresh (within debounce window)
        assert!(!watcher_state.should_refresh_check());
        // last_event should now be set
        assert!(watcher_state.last_event.is_some());

        // After debounce period: SHOULD refresh
        std::thread::sleep(Duration::from_millis(250));
        assert!(watcher_state.should_refresh_check());
        assert!(watcher_state.last_event.is_none());
    }

    #[test]
    fn debounce_resets_on_new_events() {
        let (tx, rx) = mpsc::channel();
        let mut watcher_state = DebounceHelper { receiver: rx, last_event: None };

        tx.send(()).unwrap();
        watcher_state.should_refresh_check(); // registers the event

        // Wait less than debounce, send another event
        std::thread::sleep(Duration::from_millis(100));
        tx.send(()).unwrap();
        assert!(!watcher_state.should_refresh_check()); // timer reset

        // Wait full debounce from second event
        std::thread::sleep(Duration::from_millis(250));
        assert!(watcher_state.should_refresh_check());
    }

    #[test]
    fn no_events_means_no_refresh() {
        let (_tx, rx) = mpsc::channel();
        let mut watcher_state = DebounceHelper { receiver: rx, last_event: None };
        assert!(!watcher_state.should_refresh_check());
    }

    /// Helper that mirrors FileWatcher's debounce logic for testability.
    struct DebounceHelper {
        receiver: mpsc::Receiver<()>,
        last_event: Option<Instant>,
    }

    impl DebounceHelper {
        fn should_refresh_check(&mut self) -> bool {
            let mut got_event = false;
            while self.receiver.try_recv().is_ok() {
                got_event = true;
            }
            if got_event {
                self.last_event = Some(Instant::now());
            }
            if let Some(last) = self.last_event {
                if last.elapsed() >= DEBOUNCE {
                    self.last_event = None;
                    return true;
                }
            }
            false
        }
    }
}
```

**Step 2: Run the tests**

Run: `cargo test -p untask watcher -- --nocapture 2>&1`
Expected: all 7 tests pass

**Step 3: Commit**

```bash
git add crates/untask-cli/src/tui/watcher.rs
git commit -m "test(tui): add file watcher debounce and filter tests"
```

---

### Task 3: Integrate watcher into TUI event loop

**Files:**
- Modify: `crates/untask-cli/src/tui/mod.rs` (update `run` and `run_loop`)

**Step 1: Update run() to create FileWatcher**

In `mod.rs`, update imports and the `run` function:

```rust
// Add import at top:
use watcher::FileWatcher;

// Update run():
pub fn run(store: TaskStore, project_root: PathBuf) -> untask_core::error::Result<()> {
    let config = store.config().clone();
    let mut watcher = FileWatcher::new(&project_root, &config);

    with_terminal(ratatui::init, ratatui::restore, |terminal| {
        let mut app = App::new(store, project_root)?;
        run_loop(terminal, &mut app, &mut watcher)
    })
}
```

**Step 2: Update run_loop() to check watcher**

```rust
fn run_loop(
    terminal: &mut ratatui::DefaultTerminal,
    app: &mut App,
    watcher: &mut Option<FileWatcher>,
) -> untask_core::error::Result<()> {
    while !app.should_quit {
        terminal.draw(|frame| app.draw(frame))?;

        if event::poll(Duration::from_millis(100))?
            && let Event::Key(key) = event::read()?
            && key.kind == KeyEventKind::Press
        {
            app.handle_key(key);
        }

        // Check for filesystem changes (debounced)
        if let Some(ref mut w) = watcher {
            if w.should_refresh() {
                app.refresh_or_message();
            }
        }
    }

    Ok(())
}
```

Note: `Config` needs `Clone` if it doesn't already have it. Check `config.rs` — it already derives `Clone`.

**Step 3: Verify it compiles and existing tests pass**

Run: `cargo check -p untask 2>&1 && cargo test -p untask 2>&1`
Expected: compiles, all tests pass

**Step 4: Commit**

```bash
git add crates/untask-cli/src/tui/mod.rs
git commit -m "feat(tui): integrate file watcher into event loop with debounced refresh"
```

---

### Task 4: Final verification and cleanup

**Step 1: Run full test suite**

Run: `cargo test --workspace 2>&1`
Expected: all tests pass

**Step 2: Run clippy**

Run: `cargo clippy --workspace 2>&1`
Expected: no new warnings

**Step 3: Manual smoke test (if possible)**

If the project can be run:
1. `cargo run -- tui` in one terminal
2. In another terminal, create a task: `cargo run -- add "Test watch"`
3. The TUI should auto-refresh within ~300ms showing the new task
4. Edit a task file externally — TUI should update
5. Rapid saves should not cause UI flicker (debouncing)

**Step 4: Final commit if any cleanup needed**

---

## Key Design Decisions

1. **Watcher in CLI crate, not core:** Only the TUI needs file watching. Core stays pure.
2. **`Option<FileWatcher>`:** Graceful degradation — if watcher fails to initialize, TUI still works (just no auto-refresh).
3. **Consumer-side debouncing:** Simpler than `notify-debouncer-*` crates. The 100ms poll loop naturally limits check frequency, and we wait 200ms of quiet before refreshing.
4. **Filter in callback:** Reduces channel noise. Only `.md` and `.yml` changes trigger signals.
5. **No new keybindings needed:** `d` (mark done) and `s` (cycle status) already exist in the current TUI.
