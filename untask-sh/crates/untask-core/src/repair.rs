use std::collections::HashSet;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::config::Config;
use crate::error::Result;
use crate::fs::atomic_write;
use crate::lock::ProjectLock;
use crate::slug::generate_slug;
use crate::task::{parse_filename_id, parse_task, serialize_task};

#[derive(Debug, Default, Serialize)]
pub struct RepairReport {
    pub unindexed_tasks: Vec<UnindexedTask>,
    pub mismatched_ids: Vec<MismatchedId>,
    pub unknown_statuses: Vec<UnknownStatus>,
    pub actions_taken: Vec<RepairAction>,
}

impl RepairReport {
    pub fn is_clean(&self) -> bool {
        self.unindexed_tasks.is_empty()
            && self.mismatched_ids.is_empty()
            && self.unknown_statuses.is_empty()
    }
}

#[derive(Debug, Serialize)]
pub struct UnindexedTask {
    pub path: PathBuf,
    pub has_frontmatter_id: bool,
    pub title: String,
}

#[derive(Debug, Serialize)]
pub struct MismatchedId {
    pub path: PathBuf,
    pub filename_id: u32,
    pub frontmatter_id: u32,
}

#[derive(Debug, Serialize)]
pub struct UnknownStatus {
    pub path: PathBuf,
    pub status: String,
    pub title: String,
}

#[derive(Debug, Serialize)]
pub struct RepairAction {
    pub description: String,
}

fn tasks_dir(project_root: &Path) -> PathBuf {
    project_root.join(".untask/tasks")
}

fn md_entries(dir: &Path) -> Result<Vec<PathBuf>> {
    if !dir.is_dir() {
        return Ok(vec![]);
    }
    let mut paths = Vec::new();
    for entry in std::fs::read_dir(dir)? {
        let path = entry?.path();
        if path.extension().is_some_and(|e| e == "md") {
            paths.push(path);
        }
    }
    paths.sort();
    Ok(paths)
}

/// Scan the tasks directory for issues (read-only).
fn scan(dir: &Path, config: &Config) -> Result<RepairReport> {
    let mut report = RepairReport::default();

    for path in md_entries(dir)? {
        let content = std::fs::read_to_string(&path)?;
        let task = parse_task(&content);
        let filename_id = parse_filename_id(&path);

        if filename_id.is_none() {
            report.unindexed_tasks.push(UnindexedTask {
                path: path.clone(),
                has_frontmatter_id: task.id.is_some(),
                title: task.title.clone(),
            });
        }

        if let (Some(fid), Some(tid)) = (filename_id, task.id) {
            if fid != tid {
                report.mismatched_ids.push(MismatchedId {
                    path: path.clone(),
                    filename_id: fid,
                    frontmatter_id: tid,
                });
            }
        }

        if !task.status.is_empty() && config.normalize_status(&task.status).is_none() {
            report.unknown_statuses.push(UnknownStatus {
                path: path.clone(),
                status: task.status.clone(),
                title: task.title.clone(),
            });
        }
    }

    Ok(report)
}

/// Find the maximum task ID across all files (filename IDs and frontmatter IDs).
fn max_id(dir: &Path) -> Result<u32> {
    let mut max = 0u32;
    for path in md_entries(dir)? {
        if let Some(id) = parse_filename_id(&path) {
            max = max.max(id);
        }
        let content = std::fs::read_to_string(&path)?;
        if let Some(id) = parse_task(&content).id {
            max = max.max(id);
        }
    }
    Ok(max)
}

/// Apply repairs to all detected issues in a single pass per file.
fn apply_fixes(dir: &Path, config: &Config, report: &mut RepairReport) -> Result<()> {
    let unindexed: HashSet<PathBuf> = report.unindexed_tasks.iter().map(|u| u.path.clone()).collect();
    let mismatched: HashSet<PathBuf> = report.mismatched_ids.iter().map(|m| m.path.clone()).collect();
    let bad_status: HashSet<PathBuf> = report.unknown_statuses.iter().map(|u| u.path.clone()).collect();

    let mut next_id = max_id(dir)?;
    let mut used_filenames: HashSet<String> = HashSet::new();
    for path in md_entries(dir)? {
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            used_filenames.insert(name.to_string());
        }
    }

    for path in md_entries(dir)? {
        let is_unindexed = unindexed.contains(&path);
        let is_mismatched = mismatched.contains(&path);
        let has_bad_status = bad_status.contains(&path);

        if !is_unindexed && !is_mismatched && !has_bad_status {
            continue;
        }

        let content = std::fs::read_to_string(&path)?;
        let mut task = parse_task(&content);
        task.file_path = Some(path.clone());
        let mut needs_rename = false;
        let mut new_id: Option<u32> = parse_filename_id(&path);

        // Fix unindexed: assign new ID, prepare rename
        if is_unindexed {
            next_id += 1;
            let assigned = next_id;
            task.id = Some(assigned);
            new_id = Some(assigned);
            needs_rename = true;

            report.actions_taken.push(RepairAction {
                description: format!(
                    "Assigned ID {} to {}",
                    assigned,
                    path.file_name().unwrap_or_default().to_string_lossy()
                ),
            });
        }

        // Fix mismatched: align frontmatter to filename
        if is_mismatched {
            let fid = parse_filename_id(&path).unwrap();
            let old_id = task.id;
            task.id = Some(fid);

            report.actions_taken.push(RepairAction {
                description: format!(
                    "Updated frontmatter ID {} → {} in {}",
                    old_id.unwrap_or(0),
                    fid,
                    path.file_name().unwrap_or_default().to_string_lossy()
                ),
            });
        }

        // Fix unknown status: normalize to default
        if has_bad_status {
            let old_status = task.status.clone();
            let default = config.default_status();
            task.status = default.clone();

            report.actions_taken.push(RepairAction {
                description: format!(
                    "Normalized status '{}' → '{}' in {}",
                    old_status,
                    default,
                    path.file_name().unwrap_or_default().to_string_lossy()
                ),
            });
        }

        // Write changes
        let serialized = serialize_task(&task);

        if needs_rename {
            let id = new_id.unwrap();
            let slug = generate_slug(&task.title);
            let mut filename = format!("{:03}-{slug}.md", id);

            // Disambiguate if filename already taken
            if used_filenames.contains(&filename) {
                filename = format!("{:03}-{slug}-{id}.md", id);
            }

            let new_path = dir.join(&filename);
            atomic_write(&new_path, serialized.as_bytes())?;

            if path != new_path {
                std::fs::remove_file(&path)?;
                used_filenames.remove(
                    path.file_name().unwrap_or_default().to_str().unwrap_or(""),
                );
            }
            used_filenames.insert(filename.clone());

            report.actions_taken.push(RepairAction {
                description: format!(
                    "Renamed {} → {}",
                    path.file_name().unwrap_or_default().to_string_lossy(),
                    filename
                ),
            });
        } else {
            atomic_write(&path, serialized.as_bytes())?;
        }
    }

    Ok(())
}

/// Read-only check for issues. Does not modify any files or acquire a lock.
pub fn check(project_root: &Path) -> Result<RepairReport> {
    let config = Config::load(project_root);
    scan(&tasks_dir(project_root), &config)
}

/// Detect and fix issues. Acquires project lock.
pub fn repair(project_root: &Path) -> Result<RepairReport> {
    let _lock = ProjectLock::acquire(project_root)?;
    let config = Config::load(project_root);
    let dir = tasks_dir(project_root);

    let mut report = scan(&dir, &config)?;
    if report.is_clean() {
        return Ok(report);
    }

    apply_fixes(&dir, &config, &mut report)?;
    Ok(report)
}
