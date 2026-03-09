use tauri::State;

use crate::state::AppState;
use unship_core::store::{ListFilter, TaskStore, TaskUpdate};

use super::shared::{TaskDto, TaskUpdateDto, require_project};

#[tauri::command]
pub fn list_tasks(
    status: Option<String>,
    tag: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<TaskDto>, String> {
    let root = require_project(&state)?;
    let store = TaskStore::new_strict(root).map_err(|e| e.to_string())?;
    let filter = if status.is_some() || tag.is_some() {
        Some(ListFilter { status, tag })
    } else {
        None
    };
    let tasks = store.list(filter).map_err(|e| e.to_string())?;
    Ok(tasks.into_iter().map(TaskDto::from).collect())
}

#[tauri::command]
pub fn get_task(id: u32, state: State<'_, AppState>) -> Result<TaskDto, String> {
    let root = require_project(&state)?;
    let store = TaskStore::new_strict(root).map_err(|e| e.to_string())?;
    let task = store.get(id).map_err(|e| e.to_string())?;
    Ok(TaskDto::from(task))
}

#[tauri::command]
pub fn add_task(
    title: String,
    status: Option<String>,
    state: State<'_, AppState>,
) -> Result<TaskDto, String> {
    let root = require_project(&state)?;
    let store = TaskStore::new_strict(root).map_err(|e| e.to_string())?;
    let task = store
        .add(&title, status.as_deref(), None)
        .map_err(|e| e.to_string())?;
    Ok(TaskDto::from(task))
}

#[tauri::command]
pub fn update_task(
    id: u32,
    updates: TaskUpdateDto,
    state: State<'_, AppState>,
) -> Result<TaskDto, String> {
    let root = require_project(&state)?;
    let store = TaskStore::new_strict(root).map_err(|e| e.to_string())?;
    let task = store
        .update(
            id,
            TaskUpdate {
                title: updates.title,
                status: updates.status,
                tags: updates.tags,
                body: updates.body,
                position: updates.position,
                prd: updates.prd,
                owner: updates.owner,
                ..TaskUpdate::default()
            },
        )
        .map_err(|e| e.to_string())?;
    Ok(TaskDto::from(task))
}

#[tauri::command]
pub fn delete_task(id: u32, state: State<'_, AppState>) -> Result<(), String> {
    let root = require_project(&state)?;
    let store = TaskStore::new_strict(root).map_err(|e| e.to_string())?;
    store.delete(id).map_err(|e| e.to_string())
}
