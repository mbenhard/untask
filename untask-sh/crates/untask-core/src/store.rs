use std::cmp::Ordering;
use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};

use chrono::Utc;

use crate::config::Config;
use crate::error::{Result, UntaskError};
use crate::fs::atomic_write;
use crate::lock::ProjectLock;
use crate::slug::generate_slug;
use crate::task::{AttachmentRef, Task, TaskKind, parse_filename_id, parse_task, serialize_task};

pub struct TaskStore {
    project_root: PathBuf,
    config: Config,
}

/// Fields that can be updated on a task.
#[derive(Default)]
pub struct TaskUpdate {
    pub title: Option<String>,
    pub status: Option<String>,
    pub tags: Option<Vec<String>>,
    pub body: Option<String>,
    pub position: Option<f64>,
    pub prd: Option<Option<String>>,
    pub owner: Option<Option<String>>,
    pub attachments: Option<Vec<crate::task::AttachmentRef>>,
}

/// Filter for listing tasks.
pub struct ListFilter {
    pub status: Option<String>,
    pub tag: Option<String>,
}

#[derive(Debug, Clone)]
pub struct AttachmentTextPreview {
    pub filename: String,
    pub mime_type: String,
    pub content: String,
    pub truncated: bool,
}

const TEXT_PREVIEW_LIMIT_BYTES: usize = 1024 * 1024;
const TEXT_PREVIEW_EXTENSIONS: &[&str] = &[
    "txt", "md", "json", "csv", "log", "yaml", "yml", "xml", "html",
];

impl TaskStore {
    pub fn new(project_root: PathBuf) -> Result<Self> {
        let config = Config::load(&project_root);
        Ok(Self {
            project_root,
            config,
        })
    }

    pub fn new_strict(project_root: PathBuf) -> Result<Self> {
        let config = Config::load_strict(&project_root)?;
        Ok(Self {
            project_root,
            config,
        })
    }

    pub(crate) fn with_config(project_root: PathBuf, config: Config) -> Self {
        Self {
            project_root,
            config,
        }
    }

    pub fn config(&self) -> &Config {
        &self.config
    }

    fn tasks_dir(&self) -> PathBuf {
        self.project_root.join(".untask/tasks")
    }

    fn task_paths(&self) -> Result<Vec<PathBuf>> {
        let tasks_dir = self.tasks_dir();
        if !tasks_dir.is_dir() {
            return Ok(vec![]);
        }

        let mut paths = Vec::new();
        for entry in std::fs::read_dir(tasks_dir)? {
            let path = entry?.path();
            if path.extension().is_some_and(|ext| ext == "md") {
                paths.push(path);
            }
        }
        Ok(paths)
    }

    fn load_task_from_path(&self, path: &Path) -> Result<Task> {
        let content = std::fs::read_to_string(path)?;
        let mut task = parse_task(&content);
        task.file_path = Some(path.to_path_buf());
        if task.id.is_none() {
            task.id = parse_filename_id(path);
        }
        Ok(task)
    }

    fn find_task_path_by_id(&self, id: u32) -> Result<Option<PathBuf>> {
        let expected_prefix = format!("{}-", Self::format_id(id));
        let task_paths = self.task_paths()?;
        let mut fallback_paths = Vec::new();

        for path in task_paths {
            if path
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with(&expected_prefix))
            {
                return Ok(Some(path));
            }
            fallback_paths.push(path);
        }

        for path in fallback_paths {
            if self.read_known_id(&path)? == Some(id) {
                return Ok(Some(path));
            }
        }

        Ok(None)
    }

    fn load_task_by_id(&self, id: u32) -> Result<Task> {
        let path = self
            .find_task_path_by_id(id)?
            .ok_or_else(|| UntaskError::TaskNotFound(id.to_string()))?;
        self.load_task_from_path(&path)
    }

    fn scan_tasks<F>(&self, mut visitor: F) -> Result<()>
    where
        F: FnMut(Task) -> Result<()>,
    {
        for path in self.task_paths()? {
            visitor(self.load_task_from_path(&path)?)?;
        }
        Ok(())
    }

    // ── Read operations (no side effects) ──────────────────────────

    /// List all tasks. Never modifies files.
    pub fn list(&self, filter: Option<ListFilter>) -> Result<Vec<Task>> {
        let mut tasks = Vec::new();
        self.scan_tasks(|task| {
            tasks.push(task);
            Ok(())
        })?;

        // Sort by ID (managed first), then unindexed
        tasks.sort_by(task_order);

        if let Some(filter) = filter {
            if let Some(ref status) = filter.status {
                let canonical = self.config.normalize_status(status).unwrap_or_default();
                tasks.retain(|t| {
                    self.config.normalize_status(&t.status).unwrap_or_default() == canonical
                });
            }
            if let Some(ref tag) = filter.tag {
                let tag_lower = tag.to_lowercase();
                tasks.retain(|t| t.tags.iter().any(|t| t.to_lowercase() == tag_lower));
            }
        }

        Ok(tasks)
    }

    /// Get a task by numeric ID. Never modifies files.
    pub fn get(&self, id: u32) -> Result<Task> {
        self.load_task_by_id(id)
    }

    /// Get a task by reference (numeric ID or slug match). Never modifies files.
    pub fn get_by_ref(&self, reference: &str) -> Result<Task> {
        // Try numeric ID first
        if let Ok(id) = reference.parse::<u32>() {
            return self.get(id);
        }

        // Try slug match
        let ref_lower = reference.to_lowercase();
        let tasks = self.list(None)?;
        let matches: Vec<Task> = tasks
            .into_iter()
            .filter(|t| {
                let slug = generate_slug(&t.title);
                slug == ref_lower || slug.contains(&ref_lower)
            })
            .collect();

        match matches.len() {
            0 => Err(UntaskError::TaskNotFound(reference.to_string())),
            1 => Ok(matches.into_iter().next().unwrap()),
            _ => {
                let descriptions: Vec<String> = matches
                    .iter()
                    .map(|t| {
                        format!(
                            "#{} ({})",
                            t.id.map(|id| id.to_string()).unwrap_or_else(|| "?".into()),
                            t.title
                        )
                    })
                    .collect();
                Err(UntaskError::Ambiguous(
                    reference.to_string(),
                    descriptions.join(", "),
                ))
            }
        }
    }

    // ── ID allocation ──────────────────────────────────────────────

    /// Find the next available ID by scanning existing files.
    /// Gap-tolerant: always uses max + 1, never reuses deleted IDs.
    fn next_id(&self) -> Result<u32> {
        let tasks_dir = self.tasks_dir();
        if !tasks_dir.is_dir() {
            return Ok(1);
        }

        let mut max_id = 0u32;
        for path in self.task_paths()? {
            if let Some(id) = self.read_known_id(&path)? {
                max_id = max_id.max(id);
            }
        }
        Ok(max_id + 1)
    }

    /// Format an ID with zero-padding (at least 3 digits).
    fn format_id(id: u32) -> String {
        format!("{id:03}")
    }

    // ── Write operations (acquire lock, atomic writes) ─────────────

    /// Add a new task. Returns the created task.
    pub fn add(&self, title: &str, status: Option<&str>, prd: Option<&str>) -> Result<Task> {
        let _lock = ProjectLock::acquire(&self.project_root)?;

        let id = self.next_id()?;
        let slug = generate_slug(title);
        let canonical_status = self.resolve_status(status)?;
        let position = self.next_position_for_status(&canonical_status)?;

        let now = Utc::now();
        let task = Task {
            id: Some(id),
            title: title.to_string(),
            completed: self.config.is_done_status(&canonical_status).then_some(now),
            status: canonical_status,
            created: Some(now.date_naive()),
            updated: Some(now),
            position: Some(position),
            prd: prd.map(|s| s.to_string()),
            ..Task::default()
        };

        let filename = format!("{}-{slug}.md", Self::format_id(id));
        let path = self.tasks_dir().join(&filename);
        let content = serialize_task(&task);
        atomic_write(&path, content.as_bytes())?;

        let mut task = task;
        task.file_path = Some(path);
        Ok(task)
    }

    /// Update a task's fields. Returns the updated task.
    pub fn update(&self, id: u32, updates: TaskUpdate) -> Result<Task> {
        let _lock = ProjectLock::acquire(&self.project_root)?;
        let (mut task, path) = self.load_task_for_write(id)?;
        self.apply_updates(&mut task, updates)?;
        self.persist_task(&mut task, &path)
    }

    /// Delete a task by ID.
    pub fn delete(&self, id: u32) -> Result<()> {
        let _lock = ProjectLock::acquire(&self.project_root)?;

        let task = self.get(id)?;
        let path = task
            .file_path
            .ok_or_else(|| UntaskError::TaskNotFound(id.to_string()))?;
        std::fs::remove_file(&path)?;
        if let Some(tid) = task.id {
            let _ = crate::attachments::remove_all_attachments(&self.project_root, tid);
        }
        Ok(())
    }

    /// Change a task's status. Returns the updated task.
    pub fn set_status(&self, id: u32, status: &str) -> Result<Task> {
        self.update(
            id,
            TaskUpdate {
                status: Some(status.to_string()),
                ..TaskUpdate::default()
            },
        )
    }

    /// Mark a task as done. Returns the updated task.
    pub fn mark_done(&self, id: u32) -> Result<Task> {
        let done_status = self.config.done_status();
        self.set_status(id, &done_status)
    }

    pub fn attach_file(&self, id: u32, source_path: &Path) -> Result<Task> {
        let _lock = ProjectLock::acquire(&self.project_root)?;
        let (mut task, path) = self.load_task_for_write(id)?;
        let task_id = task.id.unwrap_or(id);
        let attachment =
            crate::attachments::add_attachment(&self.project_root, task_id, source_path)?;
        let attachment_path =
            crate::attachments::attachment_path(&self.project_root, task_id, &attachment.filename)?;

        task.attachments.push(attachment);

        match self.persist_task(&mut task, &path) {
            Ok(task) => Ok(task),
            Err(err) => {
                let _ = crate::attachments::remove_attachment(
                    &self.project_root,
                    task_id,
                    attachment_path
                        .file_name()
                        .and_then(|name| name.to_str())
                        .unwrap_or_default(),
                );
                Err(err)
            }
        }
    }

    pub fn attach_file_bytes(
        &self,
        id: u32,
        data: &[u8],
        filename: &str,
        mime_type: &str,
    ) -> Result<Task> {
        let _lock = ProjectLock::acquire(&self.project_root)?;
        let (mut task, path) = self.load_task_for_write(id)?;
        let task_id = task.id.unwrap_or(id);
        let attachment = crate::attachments::add_attachment_bytes(
            &self.project_root,
            task_id,
            data,
            filename,
            mime_type,
        )?;
        let attachment_path =
            crate::attachments::attachment_path(&self.project_root, task_id, &attachment.filename)?;

        task.attachments.push(attachment);

        match self.persist_task(&mut task, &path) {
            Ok(task) => Ok(task),
            Err(err) => {
                let _ = crate::attachments::remove_attachment(
                    &self.project_root,
                    task_id,
                    attachment_path
                        .file_name()
                        .and_then(|name| name.to_str())
                        .unwrap_or_default(),
                );
                Err(err)
            }
        }
    }

    pub fn delete_attachment(&self, id: u32, filename: &str) -> Result<Task> {
        let _lock = ProjectLock::acquire(&self.project_root)?;
        let (mut task, path) = self.load_task_for_write(id)?;
        let task_id = task.id.unwrap_or(id);
        let removed = remove_attachment_entry(&mut task.attachments, filename)
            .ok_or_else(|| UntaskError::TaskNotFound(format!("attachment {filename}")))?;

        let valid_filename =
            crate::attachments::validate_attachment_filename(&removed.filename).ok();
        let rollback = if let Some(valid_name) = valid_filename.as_deref() {
            self.stage_attachment_removal(task_id, valid_name)?
        } else {
            None
        };

        match self.persist_task(&mut task, &path) {
            Ok(task) => {
                if let Some((_, staged_path)) = rollback {
                    let _ = std::fs::remove_file(&staged_path);
                    let _ =
                        crate::attachments::cleanup_attachments_dir(&self.project_root, task_id);
                }
                Ok(task)
            }
            Err(err) => {
                if let Some((original_path, staged_path)) = rollback
                    && staged_path.exists()
                {
                    let _ = std::fs::rename(&staged_path, &original_path);
                }
                Err(err)
            }
        }
    }

    pub fn attachment_path(&self, id: u32, filename: &str) -> Result<PathBuf> {
        crate::attachments::validate_attachment_filename(filename)?;
        let task = self.get(id)?;
        let task_id = task.id.unwrap_or(id);
        let attachment = task
            .attachments
            .iter()
            .find(|attachment| attachment.filename == filename)
            .ok_or_else(|| UntaskError::TaskNotFound(format!("attachment {filename}")))?;
        let path =
            crate::attachments::attachment_path(&self.project_root, task_id, &attachment.filename)?;
        if !path.is_file() {
            return Err(UntaskError::TaskNotFound(format!("attachment {filename}")));
        }
        Ok(path)
    }

    pub fn read_attachment_text(&self, id: u32, filename: &str) -> Result<AttachmentTextPreview> {
        crate::attachments::validate_attachment_filename(filename)?;
        let task = self.get(id)?;
        let attachment = task
            .attachments
            .iter()
            .find(|attachment| attachment.filename == filename)
            .cloned()
            .ok_or_else(|| UntaskError::TaskNotFound(format!("attachment {filename}")))?;
        let task_id = task.id.unwrap_or(id);
        let extension = Path::new(&attachment.filename)
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.to_lowercase())
            .ok_or_else(|| {
                UntaskError::InvalidConfig(format!(
                    "attachment does not support text preview: {}",
                    attachment.filename
                ))
            })?;

        if !TEXT_PREVIEW_EXTENSIONS
            .iter()
            .any(|allowed| *allowed == extension)
        {
            return Err(UntaskError::InvalidConfig(format!(
                "attachment does not support text preview: {}",
                attachment.filename
            )));
        }

        let path =
            crate::attachments::attachment_path(&self.project_root, task_id, &attachment.filename)?;
        if !path.is_file() {
            return Err(UntaskError::TaskNotFound(format!(
                "attachment {}",
                attachment.filename
            )));
        }

        let (content, truncated) = read_utf8_preview(&path, TEXT_PREVIEW_LIMIT_BYTES)?;

        Ok(AttachmentTextPreview {
            filename: attachment.filename,
            mime_type: attachment.mime_type,
            content,
            truncated,
        })
    }

    // ── Helpers ────────────────────────────────────────────────────

    /// Apply a status change, handling done/undone transitions for `completed`.
    fn apply_status_change(&self, task: &mut Task, new_status: &str) -> Result<()> {
        let canonical = self.normalize_status(new_status)?;

        let was_done = self.config.is_done_status(&task.status);
        let is_done = self.config.is_done_status(&canonical);

        task.status = canonical;

        if is_done && !was_done {
            task.completed = Some(Utc::now());
        } else if !is_done && was_done {
            task.completed = None;
        }

        Ok(())
    }

    fn apply_updates(&self, task: &mut Task, updates: TaskUpdate) -> Result<()> {
        if let Some(title) = updates.title {
            task.title = title;
        }
        if let Some(status) = updates.status {
            self.apply_status_change(task, &status)?;
        }
        if let Some(tags) = updates.tags {
            task.tags = tags;
        }
        if let Some(body) = updates.body {
            task.body = body;
        }
        if let Some(position) = updates.position {
            task.position = Some(position);
        }
        if let Some(prd) = updates.prd {
            task.prd = prd;
        }
        if let Some(owner) = updates.owner {
            task.owner = owner;
        }
        if let Some(attachments) = updates.attachments {
            task.attachments = attachments;
        }
        Ok(())
    }

    fn normalize_status(&self, raw: &str) -> Result<String> {
        self.config
            .normalize_status(raw)
            .ok_or_else(|| UntaskError::InvalidConfig(format!("unknown status: {raw}")))
    }

    fn resolve_status(&self, requested: Option<&str>) -> Result<String> {
        requested
            .map(|status| self.normalize_status(status))
            .transpose()?
            .map(Ok)
            .unwrap_or_else(|| Ok(self.config.default_status()))
    }

    fn next_position_for_status(&self, status: &str) -> Result<f64> {
        let mut matching_count = 0usize;
        let mut max_position = 0.0f64;

        self.scan_tasks(|task| {
            if self.config.normalize_status(&task.status).as_deref() != Some(status) {
                return Ok(());
            }
            matching_count += 1;
            if let Some(position) = task.position {
                max_position = max_position.max(position);
            }
            Ok(())
        })?;

        Ok(max_position.max(matching_count as f64) + 1.0)
    }

    fn load_task_for_write(&self, id: u32) -> Result<(Task, PathBuf)> {
        let task = self.load_task_by_id(id)?;
        let path = task
            .file_path
            .clone()
            .ok_or_else(|| UntaskError::TaskNotFound(id.to_string()))?;
        Ok((task, path))
    }

    fn persist_task(&self, task: &mut Task, path: &Path) -> Result<Task> {
        task.updated = Some(Utc::now());
        let content = serialize_task(task);
        atomic_write(path, content.as_bytes())?;
        Ok(task.clone())
    }

    fn stage_attachment_removal(
        &self,
        task_id: u32,
        filename: &str,
    ) -> Result<Option<(PathBuf, PathBuf)>> {
        let attachment_path =
            crate::attachments::attachment_path(&self.project_root, task_id, filename)?;
        if !attachment_path.exists() {
            return Ok(None);
        }
        if !attachment_path.is_file() {
            return Err(UntaskError::InvalidConfig(format!(
                "attachment is not a file: {filename}"
            )));
        }

        let staged_path = attachment_path.with_file_name(format!(
            ".{}.delete-{}",
            filename,
            Utc::now().timestamp_millis()
        ));
        std::fs::rename(&attachment_path, &staged_path)?;
        Ok(Some((attachment_path, staged_path)))
    }

    // ── Batch operations (for column rename/delete) ─────────────

    /// Batch-update status on all tasks matching `old_status` to `new_status`.
    /// Used when renaming a column. Acquires project lock.
    pub fn migrate_tasks_status(&self, old_status: &str, new_status: &str) -> Result<u32> {
        let _lock = ProjectLock::acquire(&self.project_root)?;
        self.migrate_tasks_status_locked(old_status, new_status)
    }

    pub(crate) fn migrate_tasks_status_locked(
        &self,
        old_status: &str,
        new_status: &str,
    ) -> Result<u32> {
        let old_status = self.normalize_status(old_status)?;
        let new_status = self.normalize_status(new_status)?;
        let mut count = 0u32;

        self.scan_tasks(|task| {
            let canonical = self.config.normalize_status(&task.status);
            if canonical.as_deref() == Some(old_status.as_str())
                && let Some(ref path) = task.file_path
            {
                let mut updated = task.clone();
                updated.status = new_status.clone();
                updated.updated = Some(Utc::now());
                let content = serialize_task(&updated);
                atomic_write(path, content.as_bytes())?;
                count += 1;
            }
            Ok(())
        })?;
        Ok(count)
    }

    /// Delete all tasks matching a status. Used when deleting a column with --delete-tasks.
    /// Acquires project lock.
    pub fn delete_tasks_by_status(&self, status: &str) -> Result<u32> {
        let _lock = ProjectLock::acquire(&self.project_root)?;
        self.delete_tasks_by_status_locked(status)
    }

    pub(crate) fn delete_tasks_by_status_locked(&self, status: &str) -> Result<u32> {
        let status = self.normalize_status(status)?;
        let mut count = 0u32;

        self.scan_tasks(|task| {
            let canonical = self.config.normalize_status(&task.status);
            if canonical.as_deref() == Some(status.as_str())
                && let Some(ref path) = task.file_path
            {
                std::fs::remove_file(path)?;
                if let Some(tid) = task.id {
                    let _ = crate::attachments::remove_all_attachments(&self.project_root, tid);
                }
                count += 1;
            }
            Ok(())
        })?;
        Ok(count)
    }

    /// Count tasks linked to a PRD by relative path. Returns (done, total).
    pub fn count_by_prd(&self, prd_path: &str) -> Result<(u32, u32)> {
        let mut done = 0u32;
        let mut total = 0u32;

        self.scan_tasks(|task| {
            if task.prd.as_deref() == Some(prd_path) {
                total += 1;
                if self.config.is_done_status(&task.status) {
                    done += 1;
                }
            }
            Ok(())
        })?;

        Ok((done, total))
    }

    /// Count tasks in a given column status.
    pub fn count_tasks_in_column(&self, status: &str) -> Result<u32> {
        let status = self.normalize_status(status)?;
        let mut count = 0u32;
        self.scan_tasks(|task| {
            if self.config.normalize_status(&task.status).as_deref() == Some(status.as_str()) {
                count += 1;
            }
            Ok(())
        })?;
        Ok(count)
    }

    /// Reload config from disk (useful after column operations modify config).
    pub fn reload_config(&mut self) {
        self.config = Config::load(&self.project_root);
    }

    fn read_known_id(&self, path: &Path) -> Result<Option<u32>> {
        if path.extension().is_none_or(|ext| ext != "md") {
            return Ok(None);
        }

        if let Some(id) = parse_filename_id(path) {
            return Ok(Some(id));
        }

        let content = std::fs::read_to_string(path)?;
        Ok(parse_task(&content).id)
    }
}

fn remove_attachment_entry(
    attachments: &mut Vec<AttachmentRef>,
    filename: &str,
) -> Option<AttachmentRef> {
    let index = attachments
        .iter()
        .position(|attachment| attachment.filename == filename)?;
    Some(attachments.remove(index))
}

fn read_utf8_preview(path: &Path, limit: usize) -> Result<(String, bool)> {
    let mut file = File::open(path)?;
    let mut buffer = Vec::new();
    file.by_ref()
        .take((limit + 1) as u64)
        .read_to_end(&mut buffer)?;

    let truncated = buffer.len() > limit;
    if truncated {
        buffer.truncate(limit);
    }

    decode_utf8_prefix(buffer).map(|content| (content, truncated))
}

fn decode_utf8_prefix(mut bytes: Vec<u8>) -> Result<String> {
    loop {
        match String::from_utf8(bytes.clone()) {
            Ok(content) => return Ok(content),
            Err(err) => {
                let valid_up_to = err.utf8_error().valid_up_to();
                if valid_up_to == 0 {
                    return Err(UntaskError::InvalidConfig(
                        "attachment preview is not valid UTF-8".to_string(),
                    ));
                }
                bytes.truncate(valid_up_to);
            }
        }
    }
}

fn task_order(left: &Task, right: &Task) -> Ordering {
    task_kind_rank(left.kind())
        .cmp(&task_kind_rank(right.kind()))
        .then_with(|| {
            left.id
                .unwrap_or(u32::MAX)
                .cmp(&right.id.unwrap_or(u32::MAX))
        })
        .then_with(|| left.title.to_lowercase().cmp(&right.title.to_lowercase()))
}

fn task_kind_rank(kind: TaskKind) -> u8 {
    match kind {
        TaskKind::Managed => 0,
        TaskKind::UnindexedWithId => 1,
        TaskKind::UnindexedWithoutId => 2,
    }
}
