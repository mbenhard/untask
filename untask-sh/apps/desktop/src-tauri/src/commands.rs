use std::path::{Path, PathBuf};

use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Deserializer, Serialize};
use tauri::State;

use untask_core::docs::{DocNode, DocType, DocsStore};
use untask_core::search::SearchResultKind;
use untask_core::store::{AttachmentTextPreview, ListFilter, TaskStore, TaskUpdate};
use untask_core::task::Task;
use untask_core::types::Priority;

use crate::state::{self, AppState, RecentProject};

/// Deserialize a double-option so that a missing field → None (don't update)
/// and an explicit null → Some(None) (clear the value).
fn deserialize_double_option<'de, T, D>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    T: Deserialize<'de>,
    D: Deserializer<'de>,
{
    Ok(Some(Option::deserialize(deserializer)?))
}

// ── DTOs ────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct AttachmentRefDto {
    pub filename: String,
    pub mime_type: String,
    pub size: u64,
    pub created: DateTime<Utc>,
}

#[derive(Serialize)]
pub struct AttachmentTextPreviewDto {
    pub filename: String,
    pub mime_type: String,
    pub content: String,
    pub truncated: bool,
}

impl From<AttachmentTextPreview> for AttachmentTextPreviewDto {
    fn from(preview: AttachmentTextPreview) -> Self {
        Self {
            filename: preview.filename,
            mime_type: preview.mime_type,
            content: preview.content,
            truncated: preview.truncated,
        }
    }
}

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
    pub position: Option<f64>,
    pub prd: Option<String>,
    pub confidence: Option<String>,
    pub owner: Option<String>,
    pub attachments: Vec<AttachmentRefDto>,
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
            position: task.position,
            prd: task.prd,
            confidence: task.confidence,
            owner: task.owner,
            attachments: task
                .attachments
                .iter()
                .map(|a| AttachmentRefDto {
                    filename: a.filename.clone(),
                    mime_type: a.mime_type.clone(),
                    size: a.size,
                    created: a.created,
                })
                .collect(),
        }
    }
}

#[derive(Serialize)]
pub struct DocInfo {
    pub path: String,
    pub basename: String,
    pub doc_type: DocType,
}

#[derive(Serialize)]
pub struct DocDetail {
    pub path: String,
    pub basename: String,
    pub content: String,
    pub doc_type: DocType,
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
    #[serde(default, deserialize_with = "deserialize_double_option")]
    pub priority: Option<Option<Priority>>,
    pub tags: Option<Vec<String>>,
    pub body: Option<String>,
    pub position: Option<f64>,
    #[serde(default, deserialize_with = "deserialize_double_option")]
    pub prd: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_double_option")]
    pub owner: Option<Option<String>>,
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

fn ensure_project_dir(path: &Path) -> Result<(), String> {
    if path.join(".untask").is_dir() {
        Ok(())
    } else {
        Err(format!("not an untask project: {}", path.display()))
    }
}

fn relative_project_path(project_root: &Path, path: &Path) -> String {
    path.strip_prefix(project_root)
        .unwrap_or(path)
        .display()
        .to_string()
}

fn resolve_doc_path(project_root: &Path, reference: &str) -> Result<PathBuf, String> {
    let docs_store = DocsStore::new(project_root.to_path_buf());
    let doc = docs_store.get(reference).map_err(|e| e.to_string())?;
    Ok(doc.path)
}

fn write_doc(project_root: &Path, reference: &str, content: &str) -> Result<(), String> {
    let full_path = resolve_doc_path(project_root, reference)?;
    std::fs::write(full_path, content).map_err(|e| e.to_string())
}

fn attachment_path_for_store(store: &TaskStore, id: u32, filename: &str) -> Result<String, String> {
    let path = store
        .attachment_path(id, filename)
        .map_err(|e| e.to_string())?;
    Ok(path.display().to_string())
}

fn attachment_text_preview_for_store(
    store: &TaskStore,
    id: u32,
    filename: &str,
) -> Result<AttachmentTextPreviewDto, String> {
    let preview = store
        .read_attachment_text(id, filename)
        .map_err(|e| e.to_string())?;
    Ok(AttachmentTextPreviewDto::from(preview))
}

#[derive(Serialize)]
pub struct ColumnDto {
    pub id: String,
    pub aliases: Vec<String>,
    pub done: bool,
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
        columns: columns_to_dto(&config),
    })
}

// ── Column management ────────────────────────────────────────────────

fn columns_to_dto(config: &untask_core::config::Config) -> Vec<ColumnDto> {
    config
        .columns
        .iter()
        .map(|c| ColumnDto {
            id: c.id.clone(),
            aliases: c.aliases.clone(),
            done: c.done,
        })
        .collect()
}

#[tauri::command]
pub fn column_add(
    name: String,
    after: Option<String>,
    done: Option<bool>,
    state: State<'_, AppState>,
) -> Result<Vec<ColumnDto>, String> {
    let root = require_project(&state)?;
    let mut config = untask_core::config::Config::load(&root);
    config
        .column_add(&name, after.as_deref(), done.unwrap_or(false))
        .map_err(|e| e.to_string())?;
    config.save(&root).map_err(|e| e.to_string())?;
    Ok(columns_to_dto(&config))
}

#[tauri::command]
pub fn column_rename(
    old: String,
    new: String,
    state: State<'_, AppState>,
) -> Result<Vec<ColumnDto>, String> {
    let root = require_project(&state)?;
    let mut config = untask_core::config::Config::load(&root);
    let (old_id, new_id) = config
        .column_rename(&old, &new)
        .map_err(|e| e.to_string())?;
    config.save(&root).map_err(|e| e.to_string())?;

    let mut store = TaskStore::new(root).map_err(|e| e.to_string())?;
    store.reload_config();
    store
        .migrate_tasks_status(&old_id, &new_id)
        .map_err(|e| e.to_string())?;
    Ok(columns_to_dto(&config))
}

#[tauri::command]
pub fn column_move(
    name: String,
    after: Option<String>,
    before: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<ColumnDto>, String> {
    let root = require_project(&state)?;
    let mut config = untask_core::config::Config::load(&root);
    config
        .column_move(&name, after.as_deref(), before.as_deref())
        .map_err(|e| e.to_string())?;
    config.save(&root).map_err(|e| e.to_string())?;
    Ok(columns_to_dto(&config))
}

#[tauri::command]
pub fn column_delete(
    name: String,
    move_to: Option<String>,
    delete_tasks: bool,
    state: State<'_, AppState>,
) -> Result<Vec<ColumnDto>, String> {
    let root = require_project(&state)?;
    let mut config = untask_core::config::Config::load(&root);
    let col_id = config
        .normalize_status(&name)
        .ok_or_else(|| format!("column not found: {name}"))?;

    let store = TaskStore::new(root.clone()).map_err(|e| e.to_string())?;
    let task_count = store
        .count_tasks_in_column(&col_id)
        .map_err(|e| e.to_string())?;

    if task_count > 0 && move_to.is_none() && !delete_tasks {
        return Err(format!(
            "column '{}' has {} task(s). Specify move_to or delete_tasks",
            col_id, task_count
        ));
    }

    if let Some(ref target) = move_to {
        store
            .migrate_tasks_status(&col_id, target)
            .map_err(|e| e.to_string())?;
    } else if delete_tasks {
        store
            .delete_tasks_by_status(&col_id)
            .map_err(|e| e.to_string())?;
    }

    config.column_delete(&col_id).map_err(|e| e.to_string())?;
    config.save(&root).map_err(|e| e.to_string())?;

    Ok(columns_to_dto(&config))
}

// ── Project lifecycle ───────────────────────────────────────────────

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
    untask_core::init::init(std::path::Path::new(&path), None).map_err(|e| e.to_string())
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
    let store = TaskStore::new(root).map_err(|e| e.to_string())?;
    store.delete(id).map_err(|e| e.to_string())
}

// ── Attachments ─────────────────────────────────────────────────────

#[tauri::command]
pub fn attach_file(
    id: u32,
    file_path: String,
    state: State<'_, AppState>,
) -> Result<TaskDto, String> {
    let root = require_project(&state)?;
    let store = TaskStore::new(root).map_err(|e| e.to_string())?;
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
    let store = TaskStore::new(root).map_err(|e| e.to_string())?;
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
    let store = TaskStore::new(root).map_err(|e| e.to_string())?;
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
    let store = TaskStore::new(root).map_err(|e| e.to_string())?;
    attachment_path_for_store(&store, id, &filename)
}

#[tauri::command]
pub fn read_attachment_text(
    id: u32,
    filename: String,
    state: State<'_, AppState>,
) -> Result<AttachmentTextPreviewDto, String> {
    let root = require_project(&state)?;
    let store = TaskStore::new(root).map_err(|e| e.to_string())?;
    attachment_text_preview_for_store(&store, id, &filename)
}

// ── Tags ────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct TagInfo {
    pub name: String,
    pub count: usize,
}

#[tauri::command]
pub fn list_all_tags(state: State<'_, AppState>) -> Result<Vec<TagInfo>, String> {
    let root = require_project(&state)?;
    let store = TaskStore::new(root).map_err(|e| e.to_string())?;
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

// ── Docs ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn list_docs(state: State<'_, AppState>) -> Result<Vec<DocInfo>, String> {
    let root = require_project(&state)?;
    let docs_store = DocsStore::new(root.clone());
    let docs = docs_store.list().map_err(|e| e.to_string())?;
    Ok(docs
        .into_iter()
        .map(|doc| DocInfo {
            path: relative_project_path(&root, &doc.path),
            basename: doc.basename,
            doc_type: doc.doc_type,
        })
        .collect())
}

#[tauri::command]
pub fn list_docs_tree(state: State<'_, AppState>) -> Result<Vec<DocNode>, String> {
    let root = require_project(&state)?;
    let docs_store = DocsStore::new(root);
    docs_store.list_tree().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_doc(path: String, state: State<'_, AppState>) -> Result<DocDetail, String> {
    let root = require_project(&state)?;
    let docs_store = DocsStore::new(root.clone());
    let doc = docs_store.get(&path).map_err(|e| e.to_string())?;
    Ok(DocDetail {
        path: relative_project_path(&root, &doc.path),
        basename: doc.basename,
        content: doc.content,
        doc_type: doc.doc_type,
    })
}

#[tauri::command]
pub fn save_doc(path: String, content: String, state: State<'_, AppState>) -> Result<(), String> {
    let root = require_project(&state)?;
    write_doc(&root, &path, &content)
}

#[tauri::command]
pub fn create_doc(
    parent_path: String,
    name: String,
    content: Option<String>,
    state: State<'_, AppState>,
) -> Result<DocInfo, String> {
    let root = require_project(&state)?;
    let docs_store = DocsStore::new(root.clone());
    let content_str = content.as_deref().unwrap_or("");
    let doc = docs_store
        .create_doc(&parent_path, &name, content_str)
        .map_err(|e| e.to_string())?;
    let doc_type = untask_core::docs::parse_doc_type(content_str);
    Ok(DocInfo {
        path: relative_project_path(&root, &doc.path),
        basename: doc.basename,
        doc_type,
    })
}

#[tauri::command]
pub fn create_doc_folder(
    parent_path: String,
    name: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let root = require_project(&state)?;
    let docs_store = DocsStore::new(root);
    let path = docs_store
        .create_folder(&parent_path, &name)
        .map_err(|e| e.to_string())?;
    Ok(path.display().to_string())
}

#[tauri::command]
pub fn rename_doc_path(
    path: String,
    new_name: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let root = require_project(&state)?;
    let docs_store = DocsStore::new(root);
    let path = docs_store
        .rename_path(&path, &new_name)
        .map_err(|e| e.to_string())?;
    Ok(path.display().to_string())
}

#[tauri::command]
pub fn move_doc_path(
    path: String,
    destination_parent: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let root = require_project(&state)?;
    let docs_store = DocsStore::new(root);
    let path = docs_store
        .move_path(&path, &destination_parent)
        .map_err(|e| e.to_string())?;
    Ok(path.display().to_string())
}

#[tauri::command]
pub fn delete_doc_path(path: String, state: State<'_, AppState>) -> Result<(), String> {
    let root = require_project(&state)?;
    let docs_store = DocsStore::new(root);
    docs_store.delete_doc(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_doc_folder(path: String, state: State<'_, AppState>) -> Result<(), String> {
    let root = require_project(&state)?;
    let docs_store = DocsStore::new(root);
    docs_store.delete_folder(&path).map_err(|e| e.to_string())
}

// ── Search, Next, Repair ────────────────────────────────────────────

#[tauri::command]
pub fn search(query: String, state: State<'_, AppState>) -> Result<Vec<SearchHit>, String> {
    let root = require_project(&state)?;
    let results = untask_core::search::search(&root, &query, false).map_err(|e| e.to_string())?;
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
    let store = TaskStore::new(root).map_err(|e| e.to_string())?;
    store.count_by_prd(&prd_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_repair_summary(
    state: State<'_, AppState>,
) -> Result<untask_core::repair::RepairReport, String> {
    let root = require_project(&state)?;
    untask_core::repair::check(&root).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use untask_core::store::TaskUpdate;

    fn setup_project() -> tempfile::TempDir {
        let tmp = tempfile::TempDir::new().unwrap();
        untask_core::init::init(tmp.path(), None).unwrap();
        tmp
    }

    #[test]
    fn resolve_doc_path_supports_configured_globs_outside_default_docs_dir() {
        let tmp = setup_project();
        let doc_path = tmp.path().join("docs/architecture.md");
        std::fs::create_dir_all(doc_path.parent().unwrap()).unwrap();
        std::fs::write(
            tmp.path().join(".untask/config.yml"),
            "docs:\n  - \"docs/**/*.md\"\n",
        )
        .unwrap();
        std::fs::write(&doc_path, "# Architecture").unwrap();

        let resolved = resolve_doc_path(tmp.path(), "docs/architecture.md").unwrap();

        assert_eq!(resolved, doc_path);
    }

    #[test]
    fn write_doc_rejects_paths_outside_discovered_docs() {
        let tmp = setup_project();
        let outside = tmp.path().join("README.md");
        std::fs::write(&outside, "before").unwrap();

        let error = write_doc(tmp.path(), &outside.display().to_string(), "after").unwrap_err();

        assert!(error.contains("document not found") || error.contains("Doc not found"));
        assert_eq!(std::fs::read_to_string(outside).unwrap(), "before");
    }

    #[test]
    fn relative_project_path_prefers_project_relative_doc_references() {
        let root = Path::new("/tmp/project");
        let doc = root.join(".untask/docs/guide.md");

        assert_eq!(
            relative_project_path(root, &doc),
            ".untask/docs/guide.md".to_string()
        );
    }

    #[test]
    fn attachment_path_helper_rejects_invalid_filename_and_missing_metadata() {
        let tmp = setup_project();
        let store = TaskStore::new(tmp.path().to_path_buf()).unwrap();
        let task = store.add("Task with attachment", None, None).unwrap();
        let task_id = task.id.unwrap();

        let invalid = attachment_path_for_store(&store, task_id, "../escape.txt").unwrap_err();
        assert!(invalid.contains("invalid attachment filename"));

        let missing = attachment_path_for_store(&store, task_id, "missing.txt").unwrap_err();
        assert!(missing.contains("attachment"));
        assert!(missing.contains("not found"));
    }

    #[test]
    fn attachment_text_preview_helper_returns_content_and_truncation() {
        let tmp = setup_project();
        let store = TaskStore::new(tmp.path().to_path_buf()).unwrap();
        let task = store.add("Task with preview", None, None).unwrap();
        let task_id = task.id.unwrap();

        let updated = store
            .attach_file_bytes(
                task_id,
                &vec![b'a'; 1024 * 1024 + 16],
                "notes.log",
                "text/plain",
            )
            .unwrap();
        assert_eq!(updated.attachments.len(), 1);

        let preview = attachment_text_preview_for_store(&store, task_id, "notes.log").unwrap();
        assert_eq!(preview.filename, "notes.log");
        assert!(preview.truncated);
        assert_eq!(preview.content.len(), 1024 * 1024);

        let cleared = store
            .update(
                task_id,
                TaskUpdate {
                    attachments: Some(vec![]),
                    ..TaskUpdate::default()
                },
            )
            .unwrap();
        assert!(cleared.attachments.is_empty());
    }
}
