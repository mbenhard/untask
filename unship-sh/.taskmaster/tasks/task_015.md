# Task ID: 15

**Title:** TUI File Watching and Real-time Updates

**Status:** pending

**Dependencies:** 14

**Priority:** medium

**Description:** Add file watching for .unship/ and configured docs with debounced refresh to reflect external changes in the TUI.

**Details:**

Implement file watching:

1. Add dependency: `notify = "7.0"`

2. Create `crates/unship-cli/src/tui/watcher.rs`:
```rust
use notify::{Watcher, RecursiveMode, Event};
use std::sync::mpsc;
use std::time::Duration;

pub struct FileWatcher {
    _watcher: notify::RecommendedWatcher,
    receiver: mpsc::Receiver<()>,
}

impl FileWatcher {
    pub fn new(project_root: &Path, config: &Config) -> Result<Self> {
        let (tx, rx) = mpsc::channel();
        let mut watcher = notify::recommended_watcher(move |res| {
            // Debounce and filter events
            if should_trigger_refresh(res) {
                let _ = tx.send(());
            }
        })?;
        
        watcher.watch(&project_root.join(".unship"), RecursiveMode::Recursive)?;
        // Watch configured doc paths
        
        Ok(Self { _watcher: watcher, receiver: rx })
    }
    
    pub fn check_refresh(&self) -> bool {
        self.receiver.try_recv().is_ok()
    }
}
```

3. Debouncing strategy:
   - Coalesce events within 100-200ms window
   - Ignore `.lock` file changes
   - Ignore temp files during atomic writes

4. Integration with App:
   - Check for refresh events in main loop
   - Call `app.refresh()` when triggered
   - Refresh reloads tasks and docs from store

5. Quick status updates in TUI:
   - 'd' to mark done
   - 's' to cycle status
   - Changes trigger immediate local update + file write

**Test Strategy:**

Manual testing:
1. Open TUI, then use CLI to add a task - verify TUI updates.
2. Open TUI, then modify task file externally - verify TUI updates.
3. Verify debouncing: rapid saves don't cause UI flicker.
4. Verify .lock file changes don't trigger refresh.
5. Test status change from TUI writes file correctly.
6. Test file watcher handles directory not existing initially.
7. Test event storms (many rapid file changes) are handled gracefully.
