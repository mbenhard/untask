use std::path::{Path, PathBuf};
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
    mpsc,
};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use notify::{Event, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Runtime};
use untask_core::config::{Config, DEFAULT_DOC_GLOB};

pub const PROJECT_REFRESH_EVENT: &str = "untask://project-refresh";

const DEBOUNCE: Duration = Duration::from_millis(150);
const STOP_POLL: Duration = Duration::from_millis(50);

#[derive(Debug, Clone, Serialize)]
pub struct ProjectRefreshEvent {
    pub project_path: String,
}

pub struct ProjectWatcher {
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

impl ProjectWatcher {
    pub fn spawn<R: Runtime>(app: AppHandle<R>, project_root: PathBuf) -> Result<Self, String> {
        let (tx, rx) = mpsc::channel();
        let callback_root = project_root.clone();
        let project_path = project_root.display().to_string();
        let mut watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
            if let Ok(event) = res
                && is_relevant_event(&callback_root, &event)
            {
                let _ = tx.send(());
            }
        })
        .map_err(|e| e.to_string())?;

        watcher
            .watch(&project_root, RecursiveMode::Recursive)
            .map_err(|e| e.to_string())?;

        let stop = Arc::new(AtomicBool::new(false));
        let thread_stop = Arc::clone(&stop);
        let thread = thread::spawn(move || {
            let _watcher = watcher;
            let mut debounce = DebounceState::default();

            while !thread_stop.load(Ordering::Relaxed) {
                match rx.recv_timeout(STOP_POLL) {
                    Ok(()) => debounce.note_event(),
                    Err(mpsc::RecvTimeoutError::Timeout) => {}
                    Err(mpsc::RecvTimeoutError::Disconnected) => break,
                }

                while rx.try_recv().is_ok() {
                    debounce.note_event();
                }

                if debounce.should_emit() {
                    let _ = app.emit(
                        PROJECT_REFRESH_EVENT,
                        ProjectRefreshEvent {
                            project_path: project_path.clone(),
                        },
                    );
                }
            }
        });

        Ok(Self {
            stop,
            thread: Some(thread),
        })
    }

    pub fn stop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

impl Drop for ProjectWatcher {
    fn drop(&mut self) {
        self.stop();
    }
}

#[derive(Default)]
struct DebounceState {
    last_event: Option<Instant>,
}

impl DebounceState {
    fn note_event(&mut self) {
        self.last_event = Some(Instant::now());
    }

    fn should_emit(&mut self) -> bool {
        if let Some(last) = self.last_event
            && last.elapsed() >= DEBOUNCE
        {
            self.last_event = None;
            return true;
        }

        false
    }
}

fn is_relevant_event(project_root: &Path, event: &Event) -> bool {
    event
        .paths
        .iter()
        .any(|path| is_relevant_path(project_root, path))
}

fn is_relevant_path(project_root: &Path, path: &Path) -> bool {
    let Some(relative_path) = path.strip_prefix(project_root).ok() else {
        return false;
    };

    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("");
    if file_name == ".lock" {
        return false;
    }

    let extension = path.extension().and_then(|ext| ext.to_str());
    if relative_path.starts_with(".untask") {
        return matches!(extension, Some("md") | Some("yml"));
    }

    if !matches!(extension, Some("md")) {
        return false;
    }

    let config = Config::load(project_root);
    unique_doc_patterns(&config)
        .into_iter()
        .any(|pattern| matches_doc_pattern(relative_path, pattern))
}

fn matches_doc_pattern(relative_path: &Path, pattern: &str) -> bool {
    glob::Pattern::new(pattern)
        .map(|pattern| pattern.matches_path(relative_path))
        .unwrap_or(false)
}

fn unique_doc_patterns(config: &Config) -> Vec<&str> {
    let mut patterns = vec![DEFAULT_DOC_GLOB];

    for pattern in &config.docs {
        if !patterns.contains(&pattern.as_str()) {
            patterns.push(pattern);
        }
    }

    patterns
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;
    use std::sync::mpsc;
    use std::time::Duration;

    use notify::{Event, EventKind, event::CreateKind};

    use super::*;

    fn event_with_paths(paths: Vec<PathBuf>) -> Event {
        Event {
            kind: EventKind::Create(CreateKind::File),
            paths,
            attrs: Default::default(),
        }
    }

    #[test]
    fn relevant_for_task_markdown_under_untask() {
        let tmp = tempfile::TempDir::new().unwrap();
        let path = tmp.path().join(".untask/tasks/001-review.md");

        assert!(is_relevant_path(tmp.path(), &path));
    }

    #[test]
    fn relevant_for_config_updates() {
        let tmp = tempfile::TempDir::new().unwrap();
        let path = tmp.path().join(".untask/config.yml");

        assert!(is_relevant_path(tmp.path(), &path));
    }

    #[test]
    fn ignores_lock_file() {
        let tmp = tempfile::TempDir::new().unwrap();
        let path = tmp.path().join(".untask/.lock");

        assert!(!is_relevant_path(tmp.path(), &path));
    }

    #[test]
    fn matches_default_docs_glob() {
        let tmp = tempfile::TempDir::new().unwrap();
        let path = tmp.path().join(".untask/docs/plan.md");

        assert!(is_relevant_path(tmp.path(), &path));
    }

    #[test]
    fn ignores_markdown_outside_default_and_configured_docs() {
        let tmp = tempfile::TempDir::new().unwrap();
        let path = tmp.path().join("notes/scratch.md");

        assert!(!is_relevant_path(tmp.path(), &path));
    }

    #[test]
    fn matches_configured_docs_outside_default_glob() {
        let tmp = tempfile::TempDir::new().unwrap();
        std::fs::create_dir_all(tmp.path().join(".untask")).unwrap();
        std::fs::write(
            tmp.path().join(".untask/config.yml"),
            "docs:\n  - \"notes/**/*.md\"\n",
        )
        .unwrap();
        let path = tmp.path().join("notes/plan.md");

        assert!(is_relevant_path(tmp.path(), &path));
    }

    #[test]
    fn config_changes_take_effect_without_restarting_watcher_logic() {
        let tmp = tempfile::TempDir::new().unwrap();
        std::fs::create_dir_all(tmp.path().join(".untask")).unwrap();
        let path = tmp.path().join("notes/plan.md");

        assert!(!is_relevant_path(tmp.path(), &path));

        std::fs::write(
            tmp.path().join(".untask/config.yml"),
            "docs:\n  - \"notes/**/*.md\"\n",
        )
        .unwrap();

        assert!(is_relevant_path(tmp.path(), &path));
    }

    #[test]
    fn event_is_relevant_when_any_path_matches() {
        let tmp = tempfile::TempDir::new().unwrap();
        let event = event_with_paths(vec![
            tmp.path().join("notes.txt"),
            tmp.path().join(".untask/docs/plan.md"),
        ]);

        assert!(is_relevant_event(tmp.path(), &event));
    }

    #[test]
    fn debounce_waits_for_quiet_window() {
        let (tx, rx) = mpsc::channel();
        let mut debounce = DebounceTestHelper::new(rx);

        tx.send(()).unwrap();

        assert!(!debounce.check());

        std::thread::sleep(Duration::from_millis(180));
        assert!(debounce.check());
    }

    #[test]
    fn debounce_resets_on_new_events() {
        let (tx, rx) = mpsc::channel();
        let mut debounce = DebounceTestHelper::new(rx);

        tx.send(()).unwrap();
        debounce.check();

        std::thread::sleep(Duration::from_millis(80));
        tx.send(()).unwrap();
        assert!(!debounce.check());

        std::thread::sleep(Duration::from_millis(180));
        assert!(debounce.check());
    }

    struct DebounceTestHelper {
        receiver: mpsc::Receiver<()>,
        debounce: DebounceState,
    }

    impl DebounceTestHelper {
        fn new(receiver: mpsc::Receiver<()>) -> Self {
            Self {
                receiver,
                debounce: DebounceState::default(),
            }
        }

        fn check(&mut self) -> bool {
            while self.receiver.try_recv().is_ok() {
                self.debounce.note_event();
            }

            self.debounce.should_emit()
        }
    }
}
