use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, Ordering},
};
use std::thread::{self, JoinHandle};
use std::time::{Duration, UNIX_EPOCH};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Runtime};
use untask_core::config::{Config, DEFAULT_DOC_GLOB};

pub struct AppState {
    pub current_project: Mutex<Option<PathBuf>>,
    pub watcher: Mutex<Option<ProjectWatcher>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecentProject {
    pub path: PathBuf,
    pub name: String,
    pub last_opened: DateTime<Utc>,
}

pub const PROJECT_REFRESH_EVENT: &str = "untask://project-refresh";

#[derive(Debug, Clone, Serialize)]
pub struct ProjectRefreshEvent {
    pub project_path: String,
}

pub struct ProjectWatcher {
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

impl ProjectWatcher {
    fn spawn<R: Runtime>(app: AppHandle<R>, project_root: PathBuf) -> Self {
        let stop = Arc::new(AtomicBool::new(false));
        let thread_stop = Arc::clone(&stop);

        let thread = thread::spawn(move || {
            let mut previous = capture_project_snapshot(&project_root).ok();

            while !thread_stop.load(Ordering::Relaxed) {
                thread::sleep(Duration::from_millis(700));

                if thread_stop.load(Ordering::Relaxed) {
                    break;
                }

                let next = match capture_project_snapshot(&project_root) {
                    Ok(snapshot) => snapshot,
                    Err(_) => continue,
                };

                if previous.as_ref() != Some(&next) {
                    previous = Some(next);
                    let _ = app.emit(
                        PROJECT_REFRESH_EVENT,
                        ProjectRefreshEvent {
                            project_path: project_root.display().to_string(),
                        },
                    );
                }
            }
        });

        Self {
            stop,
            thread: Some(thread),
        }
    }

    fn stop(&mut self) {
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

#[derive(Debug, Clone, PartialEq, Eq)]
struct ProjectSnapshot {
    files: Vec<FileFingerprint>,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
struct FileFingerprint {
    relative_path: PathBuf,
    modified_ms: u128,
    size: u64,
}

fn app_data_dir(base_dir: Option<&Path>) -> Option<PathBuf> {
    base_dir
        .map(PathBuf::from)
        .or_else(|| dirs::data_dir().map(|d| d.join("Untask")))
}

fn recent_projects_path(base_dir: Option<&Path>) -> Option<PathBuf> {
    Some(app_data_dir(base_dir)?.join("recent_projects.json"))
}

fn last_project_path(base_dir: Option<&Path>) -> Option<PathBuf> {
    Some(app_data_dir(base_dir)?.join("last_project.json"))
}

fn load_recent_projects_in(base_dir: Option<&Path>) -> Vec<RecentProject> {
    let path = match recent_projects_path(base_dir) {
        Some(path) => path,
        None => return vec![],
    };

    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_recent_projects_in(
    base_dir: Option<&Path>,
    projects: &[RecentProject],
) -> Result<(), String> {
    let dir = app_data_dir(base_dir).ok_or("cannot determine data directory")?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("recent_projects.json");
    let json = serde_json::to_string_pretty(projects).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}

fn load_last_project_in(base_dir: Option<&Path>) -> Option<RecentProject> {
    let path = last_project_path(base_dir)?;
    let s = std::fs::read_to_string(&path).ok()?;
    serde_json::from_str(&s).ok()
}

fn save_last_project_in(base_dir: Option<&Path>, project: &RecentProject) -> Result<(), String> {
    let dir = app_data_dir(base_dir).ok_or("cannot determine data directory")?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("last_project.json");
    let json = serde_json::to_string_pretty(project).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
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

fn collect_recursive_files(root: &Path, files: &mut BTreeSet<PathBuf>) -> Result<(), String> {
    if !root.exists() {
        return Ok(());
    }

    let entries = std::fs::read_dir(root).map_err(|e| e.to_string())?;
    for entry in entries {
        let path = entry.map_err(|e| e.to_string())?.path();
        if path.is_dir() {
            collect_recursive_files(&path, files)?;
            continue;
        }

        if path.is_file() {
            files.insert(path);
        }
    }

    Ok(())
}

fn watched_files(project_root: &Path) -> Result<Vec<PathBuf>, String> {
    let mut files = BTreeSet::new();
    collect_recursive_files(&project_root.join(".untask"), &mut files)?;

    let config = Config::load(project_root);
    for pattern in unique_doc_patterns(&config) {
        let joined = project_root.join(pattern);
        let joined = joined.to_string_lossy().to_string();
        let matches = glob::glob(&joined).map_err(|e| e.to_string())?;

        for path in matches {
            let path = path.map_err(|e| e.into_error().to_string())?;
            if path.is_file() {
                files.insert(path);
            }
        }
    }

    Ok(files.into_iter().collect())
}

fn capture_project_snapshot(project_root: &Path) -> Result<ProjectSnapshot, String> {
    let files = watched_files(project_root)?
        .into_iter()
        .map(|path| {
            let metadata = std::fs::metadata(&path).map_err(|e| e.to_string())?;
            let modified = metadata
                .modified()
                .map_err(|e| e.to_string())?
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis();

            Ok(FileFingerprint {
                relative_path: path
                    .strip_prefix(project_root)
                    .unwrap_or(&path)
                    .to_path_buf(),
                modified_ms: modified,
                size: metadata.len(),
            })
        })
        .collect::<Result<Vec<_>, String>>()?;

    Ok(ProjectSnapshot { files })
}

pub fn replace_project_watcher<R: Runtime>(
    app: &AppHandle<R>,
    state: &AppState,
    project_root: &Path,
) -> Result<(), String> {
    let mut guard = state.watcher.lock().map_err(|e| e.to_string())?;
    if let Some(mut watcher) = guard.take() {
        watcher.stop();
    }
    *guard = Some(ProjectWatcher::spawn(
        app.clone(),
        project_root.to_path_buf(),
    ));
    Ok(())
}

pub fn clear_project_watcher(state: &AppState) -> Result<(), String> {
    let mut guard = state.watcher.lock().map_err(|e| e.to_string())?;
    if let Some(mut watcher) = guard.take() {
        watcher.stop();
    }
    Ok(())
}

pub fn load_recent_projects() -> Vec<RecentProject> {
    load_recent_projects_in(None)
}

pub fn save_recent_projects(projects: &[RecentProject]) -> Result<(), String> {
    save_recent_projects_in(None, projects)
}

pub fn load_last_project() -> Option<RecentProject> {
    load_last_project_in(None)
}

pub fn save_last_project(project: &RecentProject) -> Result<(), String> {
    save_last_project_in(None, project)
}

pub fn add_to_recent(project: RecentProject) -> Result<(), String> {
    let mut projects = load_recent_projects();
    projects.retain(|p| p.path != project.path);
    projects.insert(0, project);
    projects.truncate(10);
    save_recent_projects(&projects)
}

#[cfg(test)]
mod tests {
    use chrono::TimeZone;

    use super::*;

    fn project(path: &Path, name: &str, timestamp: i64) -> RecentProject {
        RecentProject {
            path: path.to_path_buf(),
            name: name.to_string(),
            last_opened: Utc.timestamp_opt(timestamp, 0).unwrap(),
        }
    }

    #[test]
    fn recent_projects_round_trip_through_disk() {
        let tmp = tempfile::TempDir::new().unwrap();
        let projects = vec![project(Path::new("/tmp/example"), "example", 1_700_000_000)];

        save_recent_projects_in(Some(tmp.path()), &projects).unwrap();

        assert_eq!(load_recent_projects_in(Some(tmp.path())).len(), 1);
        assert_eq!(
            load_recent_projects_in(Some(tmp.path()))[0].path,
            PathBuf::from("/tmp/example")
        );
    }

    #[test]
    fn last_project_round_trip_through_disk() {
        let tmp = tempfile::TempDir::new().unwrap();
        let last = project(Path::new("/tmp/last"), "last", 1_700_000_001);

        save_last_project_in(Some(tmp.path()), &last).unwrap();

        let loaded = load_last_project_in(Some(tmp.path())).unwrap();
        assert_eq!(loaded.name, "last");
        assert_eq!(loaded.path, PathBuf::from("/tmp/last"));
    }

    #[test]
    fn snapshot_includes_configured_docs_outside_default_glob() {
        let tmp = tempfile::TempDir::new().unwrap();
        let docs_dir = tmp.path().join("docs");
        std::fs::create_dir_all(tmp.path().join(".untask")).unwrap();
        std::fs::create_dir_all(&docs_dir).unwrap();
        std::fs::write(
            tmp.path().join(".untask/config.yml"),
            "docs:\n  - \"docs/**/*.md\"\n",
        )
        .unwrap();
        std::fs::write(docs_dir.join("plan.md"), "# Plan").unwrap();

        let snapshot = capture_project_snapshot(tmp.path()).unwrap();

        assert!(
            snapshot
                .files
                .iter()
                .any(|entry| entry.relative_path == PathBuf::from("docs/plan.md"))
        );
    }
}
