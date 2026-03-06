use std::cmp::Ordering;
use std::path::{Path, PathBuf};

use chrono::Utc;

use crate::config::Config;
use crate::error::{Result, UntaskError};
use crate::fs::atomic_write;
use crate::lock::ProjectLock;
use crate::slug::generate_slug;
use crate::task::{Task, TaskKind, parse_filename_id, parse_task, serialize_task};

pub struct TaskStore {
    project_root: PathBuf,
    config: Config,
}

/// Fields that can be updated on a task.
#[derive(Default)]
pub struct TaskUpdate {
    pub title: Option<String>,
    pub status: Option<String>,
    pub priority: Option<crate::types::Priority>,
    pub tags: Option<Vec<String>>,
    pub body: Option<String>,
}

/// Filter for listing tasks.
pub struct ListFilter {
    pub status: Option<String>,
    pub tag: Option<String>,
}

impl TaskStore {
    pub fn new(project_root: PathBuf) -> Result<Self> {
        let config = Config::load(&project_root);
        Ok(Self {
            project_root,
            config,
        })
    }

    pub fn config(&self) -> &Config {
        &self.config
    }

    fn tasks_dir(&self) -> PathBuf {
        self.project_root.join(".untask/tasks")
    }

    // ── Read operations (no side effects) ──────────────────────────

    /// List all tasks. Never modifies files.
    pub fn list(&self, filter: Option<ListFilter>) -> Result<Vec<Task>> {
        let tasks_dir = self.tasks_dir();
        if !tasks_dir.is_dir() {
            return Ok(vec![]);
        }

        let mut tasks = Vec::new();
        for entry in std::fs::read_dir(&tasks_dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.extension().is_some_and(|e| e == "md") {
                let content = std::fs::read_to_string(&path)?;
                let mut task = parse_task(&content);
                task.file_path = Some(path);
                // Use filename ID if available and frontmatter id is missing
                if task.id.is_none() {
                    if let Some(ref fp) = task.file_path {
                        task.id = parse_filename_id(fp);
                    }
                }
                tasks.push(task);
            }
        }

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
        let tasks = self.list(None)?;
        tasks
            .into_iter()
            .find(|t| t.id == Some(id))
            .ok_or_else(|| UntaskError::TaskNotFound(id.to_string()))
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
        for entry in std::fs::read_dir(&tasks_dir)? {
            let entry = entry?;
            let path = entry.path();
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
    pub fn add(&self, title: &str, status: Option<&str>) -> Result<Task> {
        let _lock = ProjectLock::acquire(&self.project_root)?;

        let id = self.next_id()?;
        let slug = generate_slug(title);
        let canonical_status = self.resolve_status(status)?;

        let now = Utc::now();
        let task = Task {
            id: Some(id),
            title: title.to_string(),
            completed: (canonical_status == "done").then_some(now),
            status: canonical_status,
            created: Some(now.date_naive()),
            updated: Some(now),
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

        let mut task = self.get(id)?;
        let path = task
            .file_path
            .clone()
            .ok_or_else(|| UntaskError::TaskNotFound(id.to_string()))?;

        if let Some(title) = updates.title {
            task.title = title;
        }
        if let Some(status) = updates.status {
            self.apply_status_change(&mut task, &status)?;
        }
        if let Some(priority) = updates.priority {
            task.priority = Some(priority);
        }
        if let Some(tags) = updates.tags {
            task.tags = tags;
        }
        if let Some(body) = updates.body {
            task.body = body;
        }

        task.updated = Some(Utc::now());
        let content = serialize_task(&task);
        atomic_write(&path, content.as_bytes())?;

        Ok(task)
    }

    /// Delete a task by ID.
    pub fn delete(&self, id: u32) -> Result<()> {
        let _lock = ProjectLock::acquire(&self.project_root)?;

        let task = self.get(id)?;
        let path = task
            .file_path
            .ok_or_else(|| UntaskError::TaskNotFound(id.to_string()))?;
        std::fs::remove_file(&path)?;
        Ok(())
    }

    /// Change a task's status. Returns the updated task.
    pub fn set_status(&self, id: u32, status: &str) -> Result<Task> {
        self.update(
            id,
            TaskUpdate {
                status: Some(status.to_string()),
                title: None,
                priority: None,
                tags: None,
                body: None,
            },
        )
    }

    /// Mark a task as done. Returns the updated task.
    pub fn mark_done(&self, id: u32) -> Result<Task> {
        self.set_status(id, "done")
    }

    // ── Helpers ────────────────────────────────────────────────────

    /// Apply a status change, handling done/undone transitions for `completed`.
    fn apply_status_change(&self, task: &mut Task, new_status: &str) -> Result<()> {
        let canonical = self.normalize_status(new_status)?;

        let was_done = self.config.normalize_status(&task.status).as_deref() == Some("done");
        let is_done = canonical == "done";

        task.status = canonical;

        if is_done && !was_done {
            task.completed = Some(Utc::now());
        } else if !is_done && was_done {
            task.completed = None;
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
