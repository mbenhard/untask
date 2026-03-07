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
