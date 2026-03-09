use tauri::State;

use crate::state::AppState;

use super::shared::{ConfigDto, columns_to_dto, require_project};

#[tauri::command]
pub fn get_config(state: State<'_, AppState>) -> Result<ConfigDto, String> {
    let root = require_project(&state)?;
    let config = untask_core::config::Config::load_strict(&root).map_err(|e| e.to_string())?;
    Ok(ConfigDto {
        columns: columns_to_dto(&config),
    })
}
