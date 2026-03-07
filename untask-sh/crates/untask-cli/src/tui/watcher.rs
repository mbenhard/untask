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

#[cfg(test)]
mod tests {
    use std::path::PathBuf;
    use std::sync::mpsc;
    use std::time::{Duration, Instant};

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
        let mut state = DebounceHelper::new(rx);

        tx.send(()).unwrap();

        // Immediately: should NOT refresh
        assert!(!state.check());
        assert!(state.last_event.is_some());

        // After debounce period: SHOULD refresh
        std::thread::sleep(Duration::from_millis(250));
        assert!(state.check());
        assert!(state.last_event.is_none());
    }

    #[test]
    fn debounce_resets_on_new_events() {
        let (tx, rx) = mpsc::channel();
        let mut state = DebounceHelper::new(rx);

        tx.send(()).unwrap();
        state.check(); // registers first event

        std::thread::sleep(Duration::from_millis(100));
        tx.send(()).unwrap();
        assert!(!state.check()); // timer reset by second event

        std::thread::sleep(Duration::from_millis(250));
        assert!(state.check()); // now enough quiet time
    }

    #[test]
    fn no_events_means_no_refresh() {
        let (_tx, rx) = mpsc::channel();
        let mut state = DebounceHelper::new(rx);
        assert!(!state.check());
    }

    /// Test helper that mirrors FileWatcher's debounce logic.
    struct DebounceHelper {
        receiver: mpsc::Receiver<()>,
        last_event: Option<Instant>,
    }

    impl DebounceHelper {
        fn new(receiver: mpsc::Receiver<()>) -> Self {
            Self {
                receiver,
                last_event: None,
            }
        }

        fn check(&mut self) -> bool {
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
