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
use unship_core::config::Config;
use unship_core::docs::{infer_writable_doc_root, matches_doc_pattern};

pub const PROJECT_REFRESH_EVENT: &str = "unship://project-refresh";

const DEBOUNCE: Duration = Duration::from_millis(150);
const STOP_POLL: Duration = Duration::from_millis(50);

#[derive(Debug, Clone, Serialize)]
pub struct ProjectRefreshEvent {
    pub project_path: String,
    pub changed_paths: Vec<String>,
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
            if let Ok(event) = res {
                let changed_paths = relevant_event_paths(&callback_root, &event);
                if !changed_paths.is_empty() {
                    let _ = tx.send(changed_paths);
                }
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
                    Ok(paths) => debounce.note_event(paths),
                    Err(mpsc::RecvTimeoutError::Timeout) => {}
                    Err(mpsc::RecvTimeoutError::Disconnected) => break,
                }

                while let Ok(paths) = rx.try_recv() {
                    debounce.note_event(paths);
                }

                if let Some(changed_paths) = debounce.should_emit() {
                    let _ = app.emit(
                        PROJECT_REFRESH_EVENT,
                        ProjectRefreshEvent {
                            project_path: project_path.clone(),
                            changed_paths,
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
    changed_paths: std::collections::BTreeSet<String>,
}

impl DebounceState {
    fn note_event(&mut self, changed_paths: Vec<String>) {
        self.last_event = Some(Instant::now());
        self.changed_paths.extend(changed_paths);
    }

    fn should_emit(&mut self) -> Option<Vec<String>> {
        if let Some(last) = self.last_event
            && last.elapsed() >= DEBOUNCE
        {
            self.last_event = None;
            let changed_paths = self.changed_paths.iter().cloned().collect::<Vec<_>>();
            self.changed_paths.clear();
            return Some(changed_paths);
        }

        None
    }
}

#[cfg(test)]
fn is_relevant_event(project_root: &Path, event: &Event) -> bool {
    !relevant_event_paths(project_root, event).is_empty()
}

fn relevant_event_paths(project_root: &Path, event: &Event) -> Vec<String> {
    event
        .paths
        .iter()
        .filter_map(|path| relative_relevant_path(project_root, path))
        .collect()
}

#[cfg(test)]
fn is_relevant_path(project_root: &Path, path: &Path) -> bool {
    relative_relevant_path(project_root, path).is_some()
}

fn relative_relevant_path(project_root: &Path, path: &Path) -> Option<String> {
    let relative_path = path.strip_prefix(project_root).ok()?;

    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("");
    if file_name == ".lock" {
        return None;
    }

    let extension = path.extension().and_then(|ext| ext.to_str());
    if relative_path.starts_with(".unship") {
        return matches!(extension, Some("md") | Some("yml"))
            .then(|| relative_path.display().to_string());
    }

    let config = Config::load(project_root);
    if extension.is_none()
        && config
            .docs
            .iter()
            .filter_map(|pattern| infer_writable_doc_root(pattern))
            .any(|root| relative_path.starts_with(root))
    {
        return Some(relative_path.display().to_string());
    }

    if !matches!(extension, Some("md")) {
        return None;
    }

    config
        .docs
        .iter()
        .any(|pattern| matches_doc_pattern(relative_path, pattern))
        .then(|| relative_path.display().to_string())
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
    fn relevant_for_task_markdown_under_unship() {
        let tmp = tempfile::TempDir::new().unwrap();
        let path = tmp.path().join(".unship/tasks/001-review.md");

        assert!(is_relevant_path(tmp.path(), &path));
    }

    #[test]
    fn relevant_for_config_updates() {
        let tmp = tempfile::TempDir::new().unwrap();
        let path = tmp.path().join(".unship/config.yml");

        assert!(is_relevant_path(tmp.path(), &path));
    }

    #[test]
    fn ignores_lock_file() {
        let tmp = tempfile::TempDir::new().unwrap();
        let path = tmp.path().join(".unship/.lock");

        assert!(!is_relevant_path(tmp.path(), &path));
    }

    #[test]
    fn matches_default_docs_glob() {
        let tmp = tempfile::TempDir::new().unwrap();
        let path = tmp.path().join(".unship/docs/plan.md");

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
        std::fs::create_dir_all(tmp.path().join(".unship")).unwrap();
        std::fs::write(
            tmp.path().join(".unship/config.yml"),
            "docs:\n  - \"notes/**/*.md\"\n",
        )
        .unwrap();
        let path = tmp.path().join("notes/plan.md");

        assert!(is_relevant_path(tmp.path(), &path));
    }

    #[test]
    fn relevant_for_directory_inside_writable_docs_root() {
        let tmp = tempfile::TempDir::new().unwrap();
        let path = tmp.path().join("docs/plans");

        assert!(is_relevant_path(tmp.path(), &path));
    }

    #[test]
    fn ignores_directory_outside_writable_docs_root() {
        let tmp = tempfile::TempDir::new().unwrap();
        let path = tmp.path().join("notes/plans");

        assert!(!is_relevant_path(tmp.path(), &path));
    }

    #[test]
    fn config_changes_take_effect_without_restarting_watcher_logic() {
        let tmp = tempfile::TempDir::new().unwrap();
        std::fs::create_dir_all(tmp.path().join(".unship")).unwrap();
        let path = tmp.path().join("notes/plan.md");

        assert!(!is_relevant_path(tmp.path(), &path));

        std::fs::write(
            tmp.path().join(".unship/config.yml"),
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
            tmp.path().join(".unship/docs/plan.md"),
        ]);

        assert!(is_relevant_event(tmp.path(), &event));
    }

    #[test]
    fn debounce_waits_for_quiet_window() {
        let (tx, rx) = mpsc::channel();
        let mut debounce = DebounceTestHelper::new(rx);

        tx.send(vec!["docs/guide.md".into()]).unwrap();

        assert!(!debounce.check());

        std::thread::sleep(Duration::from_millis(180));
        assert!(debounce.check());
    }

    #[test]
    fn debounce_resets_on_new_events() {
        let (tx, rx) = mpsc::channel();
        let mut debounce = DebounceTestHelper::new(rx);

        tx.send(vec!["docs/guide.md".into()]).unwrap();
        debounce.check();

        std::thread::sleep(Duration::from_millis(80));
        tx.send(vec!["docs/roadmap.md".into()]).unwrap();
        assert!(!debounce.check());

        std::thread::sleep(Duration::from_millis(180));
        assert!(debounce.check());
    }

    struct DebounceTestHelper {
        receiver: mpsc::Receiver<Vec<String>>,
        debounce: DebounceState,
    }

    impl DebounceTestHelper {
        fn new(receiver: mpsc::Receiver<Vec<String>>) -> Self {
            Self {
                receiver,
                debounce: DebounceState::default(),
            }
        }

        fn check(&mut self) -> bool {
            while let Ok(paths) = self.receiver.try_recv() {
                self.debounce.note_event(paths);
            }

            self.debounce.should_emit().is_some()
        }
    }
}
