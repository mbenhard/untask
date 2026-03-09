use std::path::PathBuf;

use chrono::Utc;
use tauri::State;

use crate::state::{self, AppState, RecentProject};

use super::shared::ensure_project_dir;

#[tauri::command]
pub fn open_project(
    path: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let path = PathBuf::from(&path);
    ensure_project_dir(&path)?;

    *state.current_project.lock().map_err(|e| e.to_string())? = Some(path.clone());

    state::replace_project_watcher(&app, state.inner(), &path)?;

    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.display().to_string());

    let project = RecentProject {
        path,
        name,
        last_opened: Utc::now(),
    };
    state::save_last_project(&project)?;
    state::add_to_recent(project)?;

    Ok(())
}

#[tauri::command]
pub fn close_project(state: State<'_, AppState>) -> Result<(), String> {
    *state.current_project.lock().map_err(|e| e.to_string())? = None;
    state::clear_project_watcher(state.inner())
}

#[tauri::command]
pub fn init_project(path: String) -> Result<(), String> {
    unship_core::init::init(std::path::Path::new(&path), None).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_recent_projects() -> Vec<RecentProject> {
    state::load_recent_projects()
}

#[tauri::command]
pub fn get_last_project() -> Option<RecentProject> {
    match state::load_last_project() {
        Some(p) if p.path.join(".unship").is_dir() => Some(p),
        _ => None,
    }
}
