use tauri::State;

use crate::state::AppState;
use untask_core::store::TaskStore;

use super::shared::{TagInfo, require_project};

#[tauri::command]
pub fn list_all_tags(state: State<'_, AppState>) -> Result<Vec<TagInfo>, String> {
    let root = require_project(&state)?;
    let store = TaskStore::new_strict(root).map_err(|e| e.to_string())?;
    let tasks = store.list(None).map_err(|e| e.to_string())?;

    let mut counts: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    for task in &tasks {
        for tag in &task.tags {
            *counts.entry(tag.clone()).or_insert(0) += 1;
        }
    }

    let mut tags: Vec<TagInfo> = counts
        .into_iter()
        .map(|(name, count)| TagInfo { name, count })
        .collect();
    tags.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.name.cmp(&b.name)));
    Ok(tags)
}
