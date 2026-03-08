use std::path::{Path, PathBuf};

use chrono::{Duration, Utc};
use serde::Serialize;

use crate::config::Config;
use crate::error::Result;
use crate::git::{self, GitSummary};
use crate::repair;
use crate::store::TaskStore;
use crate::task::Task;

#[derive(Serialize)]
pub struct NextSummary {
    pub git: Option<GitSummary>,
    pub open_tasks: Vec<Task>,
    pub recently_completed: Vec<Task>,
    pub cleanup_hints: Vec<CleanupHint>,
}

#[derive(Serialize)]
pub struct CleanupHint {
    pub kind: CleanupKind,
    pub path: PathBuf,
    pub message: String,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
pub enum CleanupKind {
    Unindexed,
    MismatchedId,
    UnknownStatus,
    NoncanonicalStatus,
}

/// Generate a "next" summary: git state, open tasks, recent completions, cleanup hints.
pub fn generate_next(project_root: &Path) -> Result<NextSummary> {
    let git = git::get_summary(project_root, 10);

    let store = TaskStore::new(project_root.to_path_buf())?;
    let all_tasks = store.list(None)?;
    let config = store.config();

    let mut open_tasks: Vec<Task> = all_tasks
        .iter()
        .filter(|task| !task_is_done(config, task))
        .filter(|task| task.owner.as_deref() != Some("user"))
        .cloned()
        .collect();
    // Sort by updated descending (most recently touched first)
    open_tasks.sort_by(|a, b| b.updated.cmp(&a.updated));

    let cutoff = Utc::now() - Duration::days(7);
    let mut recently_completed: Vec<Task> = all_tasks
        .into_iter()
        .filter(|task| task_is_done(config, task) && task.completed.is_some_and(|c| c >= cutoff))
        .collect();
    recently_completed.sort_by(|a, b| b.completed.cmp(&a.completed));

    let cleanup_hints = build_cleanup_hints(project_root);

    Ok(NextSummary {
        git,
        open_tasks,
        recently_completed,
        cleanup_hints,
    })
}

fn task_is_done(config: &Config, task: &Task) -> bool {
    config.normalize_status(&task.status).as_deref() == Some("done")
}

fn build_cleanup_hints(project_root: &Path) -> Vec<CleanupHint> {
    let report = match repair::check(project_root) {
        Ok(r) => r,
        Err(_) => return vec![],
    };

    let mut hints = Vec::new();

    for u in &report.unindexed_tasks {
        hints.push(CleanupHint {
            kind: CleanupKind::Unindexed,
            path: u.path.clone(),
            message: format!("Unindexed task file: {}", u.title),
        });
    }

    for m in &report.mismatched_ids {
        hints.push(CleanupHint {
            kind: CleanupKind::MismatchedId,
            path: m.path.clone(),
            message: format!(
                "Filename ID ({}) doesn't match frontmatter ID ({})",
                m.filename_id, m.frontmatter_id
            ),
        });
    }

    for u in &report.unknown_statuses {
        hints.push(CleanupHint {
            kind: CleanupKind::UnknownStatus,
            path: u.path.clone(),
            message: format!("Unknown status '{}' on task: {}", u.status, u.title),
        });
    }

    for n in &report.noncanonical_statuses {
        hints.push(CleanupHint {
            kind: CleanupKind::NoncanonicalStatus,
            path: n.path.clone(),
            message: format!(
                "Non-canonical status '{}' (should be '{}') on task: {}",
                n.status, n.canonical_status, n.title
            ),
        });
    }

    hints
}
