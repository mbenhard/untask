use tauri::State;

use crate::state::AppState;
use unship_core::search::SearchResultKind;
use unship_core::store::TaskStore;

use super::shared::{
    CleanupHintDto, CommitDto, GitDto, NextDto, SearchHit, TaskDto, require_project,
};

#[tauri::command]
pub fn search(query: String, state: State<'_, AppState>) -> Result<Vec<SearchHit>, String> {
    let root = require_project(&state)?;
    let results = unship_core::search::search(&root, &query, false).map_err(|e| e.to_string())?;
    Ok(results
        .into_iter()
        .map(|r| SearchHit {
            kind: match r.kind {
                SearchResultKind::Task => "task".to_string(),
                SearchResultKind::Doc => "doc".to_string(),
            },
            path: r.path.display().to_string(),
            title: r.title,
            snippet: r.snippet,
            line_number: r.line_number,
        })
        .collect())
}

#[tauri::command]
pub fn get_next(state: State<'_, AppState>) -> Result<NextDto, String> {
    let root = require_project(&state)?;
    let summary = unship_core::next::generate_next(&root).map_err(|e| e.to_string())?;
    Ok(NextDto {
        git: summary.git.map(|g| GitDto {
            branch: g.branch,
            has_uncommitted_changes: g.has_uncommitted_changes,
            recent_commits: g
                .recent_commits
                .into_iter()
                .map(|c| CommitDto {
                    hash: c.hash,
                    message: c.message,
                    author: c.author,
                    timestamp: c.timestamp,
                })
                .collect(),
        }),
        open_tasks: summary.open_tasks.into_iter().map(TaskDto::from).collect(),
        recently_completed: summary
            .recently_completed
            .into_iter()
            .map(TaskDto::from)
            .collect(),
        cleanup_hints: summary
            .cleanup_hints
            .into_iter()
            .map(|h| CleanupHintDto {
                kind: format!("{:?}", h.kind),
                path: h.path.display().to_string(),
                message: h.message,
            })
            .collect(),
    })
}

#[tauri::command]
pub fn get_prd_task_counts(
    prd_path: String,
    state: State<'_, AppState>,
) -> Result<(u32, u32), String> {
    let root = require_project(&state)?;
    let store = TaskStore::new_strict(root).map_err(|e| e.to_string())?;
    store.count_by_prd(&prd_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_repair_summary(
    state: State<'_, AppState>,
) -> Result<unship_core::repair::RepairReport, String> {
    let root = require_project(&state)?;
    unship_core::repair::check(&root).map_err(|e| e.to_string())
}
