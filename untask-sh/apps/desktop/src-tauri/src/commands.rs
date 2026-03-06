use std::path::PathBuf;

use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use tauri::State;

use untask_core::docs::DocsStore;
use untask_core::search::SearchResultKind;
use untask_core::store::{ListFilter, TaskStore, TaskUpdate};
use untask_core::task::Task;
use untask_core::types::Priority;

use crate::state::{self, AppState, RecentProject};

// ── DTOs ────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct TaskDto {
    pub id: Option<u32>,
    pub title: String,
    pub status: String,
    pub priority: Option<Priority>,
    pub tags: Vec<String>,
    pub created: Option<NaiveDate>,
    pub updated: Option<DateTime<Utc>>,
    pub completed: Option<DateTime<Utc>>,
    pub body: String,
    pub subtask_done: u32,
    pub subtask_total: u32,
}

impl From<Task> for TaskDto {
    fn from(task: Task) -> Self {
        Self {
            id: task.id,
            title: task.title,
            status: task.status,
            priority: task.priority,
            tags: task.tags,
            created: task.created,
            updated: task.updated,
            completed: task.completed,
            body: task.body,
            subtask_done: task.subtask_progress.0,
            subtask_total: task.subtask_progress.1,
        }
    }
}

#[derive(Serialize)]
pub struct DocInfo {
    pub path: String,
    pub basename: String,
}

#[derive(Serialize)]
pub struct DocDetail {
    pub path: String,
    pub basename: String,
    pub content: String,
}

#[derive(Serialize)]
pub struct SearchHit {
    pub kind: String,
    pub path: String,
    pub title: String,
    pub snippet: String,
    pub line_number: u32,
}

#[derive(Serialize)]
pub struct CommitDto {
    pub hash: String,
    pub message: String,
    pub author: String,
    pub timestamp: DateTime<Utc>,
}

#[derive(Serialize)]
pub struct GitDto {
    pub branch: String,
    pub has_uncommitted_changes: bool,
    pub recent_commits: Vec<CommitDto>,
}

#[derive(Serialize)]
pub struct CleanupHintDto {
    pub kind: String,
    pub path: String,
    pub message: String,
}

#[derive(Serialize)]
pub struct NextDto {
    pub git: Option<GitDto>,
    pub open_tasks: Vec<TaskDto>,
    pub recently_completed: Vec<TaskDto>,
    pub cleanup_hints: Vec<CleanupHintDto>,
}

#[derive(Deserialize)]
pub struct TaskUpdateDto {
    pub title: Option<String>,
    pub status: Option<String>,
    pub priority: Option<Priority>,
    pub tags: Option<Vec<String>>,
    pub body: Option<String>,
}

// ── Helpers ─────────────────────────────────────────────────────────

fn require_project(state: &State<'_, AppState>) -> Result<PathBuf, String> {
    state
        .current_project
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or_else(|| "no project open".to_string())
}

#[derive(Serialize)]
pub struct ColumnDto {
    pub id: String,
    pub aliases: Vec<String>,
}

#[derive(Serialize)]
pub struct ConfigDto {
    pub columns: Vec<ColumnDto>,
}

// ── Config ──────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_config(state: State<'_, AppState>) -> Result<ConfigDto, String> {
    let root = require_project(&state)?;
    let config = untask_core::config::Config::load(&root);
    Ok(ConfigDto {
        columns: config
            .columns
            .into_iter()
            .map(|c| ColumnDto {
                id: c.id,
                aliases: c.aliases,
            })
            .collect(),
    })
}

// ── Project lifecycle ───────────────────────────────────────────────

#[tauri::command]
pub fn open_project(path: String, state: State<'_, AppState>) -> Result<(), String> {
    let path = PathBuf::from(&path);
    if !path.join(".untask").is_dir() {
        return Err(format!("not an untask project: {}", path.display()));
    }

    *state
        .current_project
        .lock()
        .map_err(|e| e.to_string())? = Some(path.clone());

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
pub fn init_project(path: String) -> Result<(), String> {
    untask_core::init::init(std::path::Path::new(&path)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_recent_projects() -> Vec<RecentProject> {
    state::load_recent_projects()
}

#[tauri::command]
pub fn get_last_project() -> Option<RecentProject> {
    match state::load_last_project() {
        Some(p) if p.path.join(".untask").is_dir() => Some(p),
        _ => None,
    }
}

// ── Task CRUD ───────────────────────────────────────────────────────

#[tauri::command]
pub fn list_tasks(
    status: Option<String>,
    tag: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<TaskDto>, String> {
    let root = require_project(&state)?;
    let store = TaskStore::new(root).map_err(|e| e.to_string())?;
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
    let store = TaskStore::new(root).map_err(|e| e.to_string())?;
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
    let store = TaskStore::new(root).map_err(|e| e.to_string())?;
    let task = store
        .add(&title, status.as_deref())
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
    let store = TaskStore::new(root).map_err(|e| e.to_string())?;
    let task = store
        .update(
            id,
            TaskUpdate {
                title: updates.title,
                status: updates.status,
                priority: updates.priority,
                tags: updates.tags,
                body: updates.body,
            },
        )
        .map_err(|e| e.to_string())?;
    Ok(TaskDto::from(task))
}

#[tauri::command]
pub fn delete_task(id: u32, state: State<'_, AppState>) -> Result<(), String> {
    let root = require_project(&state)?;
    let store = TaskStore::new(root).map_err(|e| e.to_string())?;
    store.delete(id).map_err(|e| e.to_string())
}

// ── Docs ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn list_docs(state: State<'_, AppState>) -> Result<Vec<DocInfo>, String> {
    let root = require_project(&state)?;
    let docs_store = DocsStore::new(root);
    let docs = docs_store.list().map_err(|e| e.to_string())?;
    Ok(docs
        .into_iter()
        .map(|d| DocInfo {
            path: d.path.display().to_string(),
            basename: d.basename,
        })
        .collect())
}

#[tauri::command]
pub fn read_doc(path: String, state: State<'_, AppState>) -> Result<DocDetail, String> {
    let root = require_project(&state)?;
    let docs_store = DocsStore::new(root);
    let doc = docs_store.get(&path).map_err(|e| e.to_string())?;
    Ok(DocDetail {
        path: doc.path.display().to_string(),
        basename: doc.basename,
        content: doc.content,
    })
}

#[tauri::command]
pub fn save_doc(path: String, content: String, state: State<'_, AppState>) -> Result<(), String> {
    if path.contains("..") {
        return Err("path must not contain '..'".to_string());
    }
    let root = require_project(&state)?;
    let full_path = root.join(&path);
    std::fs::write(&full_path, &content).map_err(|e| e.to_string())
}

// ── Search, Next, Repair ────────────────────────────────────────────

#[tauri::command]
pub fn search(query: String, state: State<'_, AppState>) -> Result<Vec<SearchHit>, String> {
    let root = require_project(&state)?;
    let results =
        untask_core::search::search(&root, &query, false).map_err(|e| e.to_string())?;
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
    let summary = untask_core::next::generate_next(&root).map_err(|e| e.to_string())?;
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
        open_tasks: summary
            .open_tasks
            .into_iter()
            .map(TaskDto::from)
            .collect(),
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
pub fn get_repair_summary(
    state: State<'_, AppState>,
) -> Result<untask_core::repair::RepairReport, String> {
    let root = require_project(&state)?;
    untask_core::repair::check(&root).map_err(|e| e.to_string())
}
