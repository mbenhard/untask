use std::path::{Path, PathBuf};

use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};

use crate::types::Priority;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AttachmentRef {
    pub filename: String,
    pub mime_type: String,
    pub size: u64,
    pub created: DateTime<Utc>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Task {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<u32>,
    pub title: String,
    pub status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub priority: Option<Priority>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prd: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created: Option<NaiveDate>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated: Option<DateTime<Utc>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub completed: Option<DateTime<Utc>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub position: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confidence: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub owner: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub attachments: Vec<AttachmentRef>,
    #[serde(skip)]
    pub body: String,
    #[serde(skip)]
    pub file_path: Option<PathBuf>,
    #[serde(skip)]
    pub subtask_progress: (u32, u32),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TaskKind {
    Managed,
    UnindexedWithId,
    UnindexedWithoutId,
}

#[derive(Debug, Default, Deserialize)]
struct TaskFrontmatter {
    #[serde(default)]
    id: Option<u32>,
    #[serde(default)]
    title: String,
    #[serde(default)]
    status: String,
    #[serde(default)]
    priority: Option<Priority>,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default)]
    prd: Option<String>,
    #[serde(default)]
    created: Option<NaiveDate>,
    #[serde(default)]
    updated: Option<DateTime<Utc>>,
    #[serde(default)]
    completed: Option<DateTime<Utc>>,
    #[serde(default)]
    position: Option<f64>,
    #[serde(default)]
    confidence: Option<String>,
    #[serde(default)]
    owner: Option<String>,
    #[serde(default)]
    attachments: Vec<AttachmentRef>,
}

impl From<TaskFrontmatter> for Task {
    fn from(frontmatter: TaskFrontmatter) -> Self {
        Self {
            id: frontmatter.id,
            title: frontmatter.title,
            status: frontmatter.status,
            priority: frontmatter.priority,
            tags: frontmatter.tags,
            prd: frontmatter.prd,
            created: frontmatter.created,
            updated: frontmatter.updated,
            completed: frontmatter.completed,
            position: frontmatter.position,
            confidence: frontmatter.confidence,
            owner: frontmatter.owner,
            attachments: frontmatter.attachments,
            ..Self::default()
        }
    }
}

impl Task {
    /// Classify a task based on its file path and frontmatter id.
    pub fn kind(&self) -> TaskKind {
        if let Some(ref path) = self.file_path
            && parse_filename_id(path).is_some()
        {
            return TaskKind::Managed;
        }
        if self.id.is_some() {
            TaskKind::UnindexedWithId
        } else {
            TaskKind::UnindexedWithoutId
        }
    }
}

/// Parse a task from markdown content (frontmatter + body).
pub fn parse_task(content: &str) -> Task {
    let (frontmatter_str, body) = split_frontmatter(content);

    let mut task = if let Some(fm) = frontmatter_str {
        serde_yaml::from_str::<TaskFrontmatter>(&fm)
            .map(Task::from)
            .unwrap_or_default()
    } else {
        Task::default()
    };

    task.body = body.to_string();
    task.subtask_progress = count_subtasks(&task.body);
    task
}

/// Serialize a task back to markdown (frontmatter + body).
pub fn serialize_task(task: &Task) -> String {
    let frontmatter = serde_yaml::to_string(task).unwrap_or_default();
    let mut result = String::from("---\n");
    result.push_str(&frontmatter);
    result.push_str("---\n");
    result.push_str(&task.body);
    result
}

/// Split content into optional frontmatter string and body.
fn split_frontmatter(content: &str) -> (Option<String>, &str) {
    let trimmed = content.trim_start();
    if !trimmed.starts_with("---") {
        return (None, content);
    }

    // Find the opening delimiter line end
    let after_open = match trimmed[3..].find('\n') {
        Some(i) => 3 + i + 1,
        None => return (None, content),
    };

    // Find the closing delimiter
    if let Some(close_pos) = trimmed[after_open..].find("\n---") {
        let fm_end = after_open + close_pos;
        let frontmatter = &trimmed[after_open..fm_end];
        // Body starts after the closing --- line
        let body_start = fm_end + 4; // "\n---"
        let rest = &trimmed[body_start..];
        // Skip the rest of the closing delimiter line
        let body = match rest.find('\n') {
            Some(i) => &rest[i + 1..],
            None => "",
        };
        (Some(frontmatter.to_string()), body)
    } else {
        (None, content)
    }
}

/// Count top-level checklist items: (completed, total).
fn count_subtasks(body: &str) -> (u32, u32) {
    let mut completed = 0u32;
    let mut total = 0u32;
    for line in body.lines() {
        let trimmed = line.trim_start();
        if trimmed.starts_with("- [x]") || trimmed.starts_with("- [X]") {
            // Only count top-level (no leading whitespace beyond the line itself)
            if !line.starts_with("  ") && !line.starts_with('\t') {
                total += 1;
                completed += 1;
            }
        } else if trimmed.starts_with("- [ ]") && !line.starts_with("  ") && !line.starts_with('\t')
        {
            total += 1;
        }
    }
    (completed, total)
}

/// Extract numeric ID from a task filename like `001-fix-login-bug.md`.
pub fn parse_filename_id(path: &Path) -> Option<u32> {
    let stem = path.file_stem()?.to_str()?;
    let prefix = stem.split('-').next()?;
    prefix.parse::<u32>().ok()
}
