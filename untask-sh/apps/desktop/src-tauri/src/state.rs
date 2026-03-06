use std::path::PathBuf;
use std::sync::Mutex;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

pub struct AppState {
    pub current_project: Mutex<Option<PathBuf>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecentProject {
    pub path: PathBuf,
    pub name: String,
    pub last_opened: DateTime<Utc>,
}

fn data_dir() -> Option<PathBuf> {
    dirs::data_dir().map(|d| d.join("Untask"))
}

pub fn load_recent_projects() -> Vec<RecentProject> {
    let dir = match data_dir() {
        Some(d) => d,
        None => return vec![],
    };
    let path = dir.join("recent_projects.json");
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save_recent_projects(projects: &[RecentProject]) -> Result<(), String> {
    let dir = data_dir().ok_or("cannot determine data directory")?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("recent_projects.json");
    let json = serde_json::to_string_pretty(projects).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}

pub fn load_last_project() -> Option<RecentProject> {
    let dir = data_dir()?;
    let path = dir.join("last_project.json");
    let s = std::fs::read_to_string(&path).ok()?;
    serde_json::from_str(&s).ok()
}

pub fn save_last_project(project: &RecentProject) -> Result<(), String> {
    let dir = data_dir().ok_or("cannot determine data directory")?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("last_project.json");
    let json = serde_json::to_string_pretty(project).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}

pub fn add_to_recent(project: RecentProject) -> Result<(), String> {
    let mut projects = load_recent_projects();
    projects.retain(|p| p.path != project.path);
    projects.insert(0, project);
    projects.truncate(10);
    save_recent_projects(&projects)
}
