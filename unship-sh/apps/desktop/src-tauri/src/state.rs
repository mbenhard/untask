use std::path::{Path, PathBuf};
use std::sync::Mutex;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Runtime};

use crate::watcher::ProjectWatcher;

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

fn app_data_dir(base_dir: Option<&Path>) -> Option<PathBuf> {
    base_dir
        .map(PathBuf::from)
        .or_else(|| dirs::data_dir().map(|d| d.join("Unship")))
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
    )?);
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
}
