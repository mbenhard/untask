use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::time::{Duration, Instant};

use notify::{Event, RecursiveMode, Watcher};

use untask_core::config::Config;

const DEBOUNCE: Duration = Duration::from_millis(200);

#[derive(Debug, Clone, PartialEq, Eq)]
struct WatchTarget {
    path: PathBuf,
    mode: RecursiveMode,
}

impl WatchTarget {
    fn new(path: PathBuf, mode: RecursiveMode) -> Self {
        Self { path, mode }
    }
}

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
            if let Ok(event) = res
                && Self::is_relevant(&event)
            {
                let _ = sender.send(());
            }
        })
        .ok()?;

        for target in Self::watch_targets(project_root, config) {
            let _ = watcher.watch(&target.path, target.mode);
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

        if let Some(last) = self.last_event
            && last.elapsed() >= DEBOUNCE
        {
            self.last_event = None;
            return true;
        }

        false
    }

    fn watch_targets(project_root: &Path, config: &Config) -> Vec<WatchTarget> {
        let mut targets = Vec::new();

        let untask_dir = project_root.join(".untask");
        if untask_dir.is_dir() {
            Self::push_watch_target(
                &mut targets,
                WatchTarget::new(untask_dir, RecursiveMode::Recursive),
            );
        }

        for target in Self::extra_doc_watch_targets(project_root, config) {
            Self::push_watch_target(&mut targets, target);
        }

        targets
    }

    fn push_watch_target(targets: &mut Vec<WatchTarget>, target: WatchTarget) {
        if let Some(existing) = targets
            .iter_mut()
            .find(|existing| existing.path == target.path)
        {
            if matches!(target.mode, RecursiveMode::Recursive) {
                existing.mode = RecursiveMode::Recursive;
            }
            return;
        }

        targets.push(target);
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

    /// Extract watch targets for doc globs that are outside `.untask/`.
    fn extra_doc_watch_targets(project_root: &Path, config: &Config) -> Vec<WatchTarget> {
        config
            .docs
            .iter()
            .filter_map(|pattern| Self::watch_target_for_pattern(project_root, pattern))
            .collect()
    }

    fn watch_target_for_pattern(project_root: &Path, pattern: &str) -> Option<WatchTarget> {
        let untask_dir = project_root.join(".untask");
        let prefix: String = pattern
            .chars()
            .take_while(|c| !matches!(c, '*' | '?' | '['))
            .collect();
        let prefix = prefix.trim_end_matches('/');

        if prefix.is_empty() {
            return Some(WatchTarget::new(
                project_root.to_path_buf(),
                RecursiveMode::NonRecursive,
            ));
        }

        let path = project_root.join(prefix);
        if path.starts_with(&untask_dir) {
            return None;
        }

        if path.is_file() {
            return Some(WatchTarget::new(path, RecursiveMode::NonRecursive));
        }

        let mut candidate = path.as_path();
        while !candidate.is_dir() {
            candidate = candidate.parent()?;
        }

        let mode = if candidate == project_root {
            RecursiveMode::NonRecursive
        } else {
            RecursiveMode::Recursive
        };

        Some(WatchTarget::new(candidate.to_path_buf(), mode))
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
    fn existing_root_level_doc_is_watched_directly() {
        let tmp = tempfile::TempDir::new().unwrap();
        std::fs::write(tmp.path().join("README.md"), "# Readme\n").unwrap();

        let target = FileWatcher::watch_target_for_pattern(tmp.path(), "README.md").unwrap();

        assert_eq!(target.path, tmp.path().join("README.md"));
        assert_eq!(target.mode, RecursiveMode::NonRecursive);
    }

    #[test]
    fn missing_external_doc_dir_falls_back_to_project_root() {
        let tmp = tempfile::TempDir::new().unwrap();

        let target = FileWatcher::watch_target_for_pattern(tmp.path(), "notes/**/*.md").unwrap();

        assert_eq!(target.path, tmp.path());
        assert_eq!(target.mode, RecursiveMode::NonRecursive);
    }

    #[test]
    fn existing_external_doc_dir_is_watched_recursively() {
        let tmp = tempfile::TempDir::new().unwrap();
        std::fs::create_dir_all(tmp.path().join("notes/nested")).unwrap();

        let target = FileWatcher::watch_target_for_pattern(tmp.path(), "notes/**/*.md").unwrap();

        assert_eq!(target.path, tmp.path().join("notes"));
        assert_eq!(target.mode, RecursiveMode::Recursive);
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
            if let Some(last) = self.last_event
                && last.elapsed() >= DEBOUNCE
            {
                self.last_event = None;
                return true;
            }
            false
        }
    }
}
