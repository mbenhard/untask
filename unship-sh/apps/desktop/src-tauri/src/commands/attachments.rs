use tauri::State;

use crate::state::AppState;
use unship_core::store::TaskStore;

use super::shared::{
    AttachmentTextPreviewDto, TaskDto, attachment_data_url_for_store, attachment_path_for_store,
    attachment_text_preview_for_store, open_attachment_for_store, require_project,
};

#[tauri::command]
pub fn attach_file(
    id: u32,
    file_path: String,
    state: State<'_, AppState>,
) -> Result<TaskDto, String> {
    let root = require_project(&state)?;
    let store = TaskStore::new_strict(root).map_err(|e| e.to_string())?;
    let source = std::path::PathBuf::from(&file_path);
    let updated = store.attach_file(id, &source).map_err(|e| e.to_string())?;
    Ok(TaskDto::from(updated))
}

#[tauri::command]
pub fn attach_file_bytes(
    id: u32,
    data: Vec<u8>,
    filename: String,
    mime_type: String,
    state: State<'_, AppState>,
) -> Result<TaskDto, String> {
    let root = require_project(&state)?;
    let store = TaskStore::new_strict(root).map_err(|e| e.to_string())?;
    let updated = store
        .attach_file_bytes(id, &data, &filename, &mime_type)
        .map_err(|e| e.to_string())?;
    Ok(TaskDto::from(updated))
}

#[tauri::command]
pub fn delete_attachment(
    id: u32,
    filename: String,
    state: State<'_, AppState>,
) -> Result<TaskDto, String> {
    let root = require_project(&state)?;
    let store = TaskStore::new_strict(root).map_err(|e| e.to_string())?;
    let updated = store
        .delete_attachment(id, &filename)
        .map_err(|e| e.to_string())?;
    Ok(TaskDto::from(updated))
}

#[tauri::command]
pub fn get_attachment_path(
    id: u32,
    filename: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let root = require_project(&state)?;
    let store = TaskStore::new_strict(root).map_err(|e| e.to_string())?;
    attachment_path_for_store(&store, id, &filename)
}

#[tauri::command]
pub fn get_attachment_data_url(
    id: u32,
    filename: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let root = require_project(&state)?;
    let store = TaskStore::new_strict(root).map_err(|e| e.to_string())?;
    attachment_data_url_for_store(&store, id, &filename)
}

#[tauri::command]
pub fn read_attachment_text(
    id: u32,
    filename: String,
    state: State<'_, AppState>,
) -> Result<AttachmentTextPreviewDto, String> {
    let root = require_project(&state)?;
    let store = TaskStore::new_strict(root).map_err(|e| e.to_string())?;
    attachment_text_preview_for_store(&store, id, &filename)
}

#[tauri::command]
pub fn open_attachment(
    id: u32,
    filename: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let root = require_project(&state)?;
    let store = TaskStore::new_strict(root).map_err(|e| e.to_string())?;
    open_attachment_for_store(&store, id, &filename)
}
