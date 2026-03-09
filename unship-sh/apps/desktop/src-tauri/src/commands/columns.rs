use tauri::State;

use crate::state::AppState;

use super::shared::{ColumnDto, columns_to_dto, require_project};

#[tauri::command]
pub fn column_add(
    name: String,
    after: Option<String>,
    done: Option<bool>,
    state: State<'_, AppState>,
) -> Result<Vec<ColumnDto>, String> {
    let root = require_project(&state)?;
    let result =
        unship_core::columns::add_column(&root, &name, after.as_deref(), done.unwrap_or(false))
            .map_err(|e| e.to_string())?;
    Ok(columns_to_dto(&result.config))
}

#[tauri::command]
pub fn column_rename(
    old: String,
    new: String,
    state: State<'_, AppState>,
) -> Result<Vec<ColumnDto>, String> {
    let root = require_project(&state)?;
    let result =
        unship_core::columns::rename_column(&root, &old, &new).map_err(|e| e.to_string())?;
    Ok(columns_to_dto(&result.config))
}

#[tauri::command]
pub fn column_move(
    name: String,
    after: Option<String>,
    before: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<ColumnDto>, String> {
    let root = require_project(&state)?;
    let result =
        unship_core::columns::move_column(&root, &name, after.as_deref(), before.as_deref())
            .map_err(|e| e.to_string())?;
    Ok(columns_to_dto(&result.config))
}

#[tauri::command]
pub fn column_delete(
    name: String,
    move_to: Option<String>,
    delete_tasks: bool,
    state: State<'_, AppState>,
) -> Result<Vec<ColumnDto>, String> {
    let root = require_project(&state)?;
    let result =
        unship_core::columns::delete_column(&root, &name, move_to.as_deref(), delete_tasks)
            .map_err(|e| e.to_string())?;
    Ok(columns_to_dto(&result.config))
}
