use std::path::{Path, PathBuf};
use std::process::Command;

use base64::Engine as _;
use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Deserializer, Serialize};
use tauri::State;

use crate::state::AppState;
use untask_core::docs::{DocType, DocsStore};
use untask_core::store::{AttachmentTextPreview, TaskStore};
use untask_core::task::Task;

pub(crate) fn deserialize_double_option<'de, T, D>(
    deserializer: D,
) -> Result<Option<Option<T>>, D::Error>
where
    T: Deserialize<'de>,
    D: Deserializer<'de>,
{
    Ok(Some(Option::deserialize(deserializer)?))
}

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
    pub tags: Option<Vec<String>>,
    pub body: Option<String>,
    pub position: Option<f64>,
    #[serde(default, deserialize_with = "deserialize_double_option")]
    pub prd: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_double_option")]
    pub owner: Option<Option<String>>,
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

#[derive(Serialize)]
pub struct TagInfo {
    pub name: String,
    pub count: usize,
}

pub(crate) fn require_project(state: &State<'_, AppState>) -> Result<PathBuf, String> {
    state
        .current_project
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or_else(|| "no project open".to_string())
}

pub(crate) fn ensure_project_dir(path: &Path) -> Result<(), String> {
    if path.join(".untask").is_dir() {
        Ok(())
    } else {
        Err(format!("not an untask project: {}", path.display()))
    }
}

pub(crate) fn relative_project_path(project_root: &Path, path: &Path) -> String {
    path.strip_prefix(project_root)
        .unwrap_or(path)
        .display()
        .to_string()
}

#[cfg(test)]
pub(crate) fn resolve_doc_path(project_root: &Path, reference: &str) -> Result<PathBuf, String> {
    let docs_store =
        DocsStore::new_strict(project_root.to_path_buf()).map_err(|e| e.to_string())?;
    let doc = docs_store.get(reference).map_err(|e| e.to_string())?;
    Ok(doc.path)
}

pub(crate) fn write_doc(project_root: &Path, reference: &str, content: &str) -> Result<(), String> {
    let docs_store =
        DocsStore::new_strict(project_root.to_path_buf()).map_err(|e| e.to_string())?;
    docs_store.save_doc(reference, content).map_err(|e| e.to_string())
}

pub(crate) fn attachment_path_for_store(
    store: &TaskStore,
    id: u32,
    filename: &str,
) -> Result<String, String> {
    let path = store
        .attachment_path(id, filename)
        .map_err(|e| e.to_string())?;
    Ok(path.display().to_string())
}

pub(crate) fn attachment_text_preview_for_store(
    store: &TaskStore,
    id: u32,
    filename: &str,
) -> Result<AttachmentTextPreviewDto, String> {
    let preview = store
        .read_attachment_text(id, filename)
        .map_err(|e| e.to_string())?;
    Ok(AttachmentTextPreviewDto::from(preview))
}

pub(crate) fn attachment_data_url_for_store(
    store: &TaskStore,
    id: u32,
    filename: &str,
) -> Result<String, String> {
    let task = store.get(id).map_err(|e| e.to_string())?;
    let attachment = task
        .attachments
        .iter()
        .find(|attachment| attachment.filename == filename)
        .ok_or_else(|| format!("attachment not found: {filename}"))?;
    let path = store.attachment_path(id, filename).map_err(|e| e.to_string())?;
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    Ok(format!("data:{};base64,{}", attachment.mime_type, encoded))
}

pub(crate) fn open_attachment_for_store(
    store: &TaskStore,
    id: u32,
    filename: &str,
) -> Result<(), String> {
    let path = store.attachment_path(id, filename).map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("open");
        command.arg(&path);
        command
    };

    #[cfg(target_os = "linux")]
    let mut command = {
        let mut command = Command::new("xdg-open");
        command.arg(&path);
        command
    };

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = Command::new("cmd");
        command.args(["/C", "start", ""]);
        command.arg(&path);
        command
    };

    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    return Err("open_attachment is not supported on this platform".to_string());

    command.spawn().map_err(|e| e.to_string())?;
    Ok(())
}

pub(crate) fn columns_to_dto(config: &untask_core::config::Config) -> Vec<ColumnDto> {
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

    #[test]
    fn attachment_data_url_helper_returns_inline_payload() {
        let tmp = setup_project();
        let store = TaskStore::new(tmp.path().to_path_buf()).unwrap();
        let task = store.add("Task with image", None, None).unwrap();
        let task_id = task.id.unwrap();

        store
            .attach_file_bytes(task_id, b"png-bytes", "thumb.png", "image/png")
            .unwrap();

        let data_url = attachment_data_url_for_store(&store, task_id, "thumb.png").unwrap();
        assert!(data_url.starts_with("data:image/png;base64,"));
    }
}
