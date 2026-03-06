use std::path::Path;
use std::process::Command;

use chrono::{DateTime, Utc};

pub struct GitSummary {
    pub recent_commits: Vec<Commit>,
    pub branch: String,
    pub has_uncommitted_changes: bool,
}

pub struct Commit {
    pub hash: String,
    pub message: String,
    pub author: String,
    pub timestamp: DateTime<Utc>,
}

/// Gather a git summary for the project. Returns `None` if git is unavailable,
/// the directory is not a repo, or any git command fails.
pub fn get_summary(project_root: &Path, limit: usize) -> Option<GitSummary> {
    let branch = run_git(project_root, &["branch", "--show-current"])?;
    let branch = branch.trim().to_string();

    let status_output = run_git(project_root, &["status", "--porcelain"])?;
    let has_uncommitted_changes = !status_output.trim().is_empty();

    let recent_commits = run_git(
        project_root,
        &["log", &format!("-n{limit}"), "--format=%H%x00%s%x00%aN%x00%aI"],
    )
    .map(|output| {
        output
            .trim()
            .lines()
            .filter_map(parse_commit_line)
            .collect()
    })
    .unwrap_or_default();

    Some(GitSummary {
        recent_commits,
        branch,
        has_uncommitted_changes,
    })
}

fn run_git(dir: &Path, args: &[&str]) -> Option<String> {
    Command::new("git")
        .args(args)
        .current_dir(dir)
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| String::from_utf8(o.stdout).ok())
}

fn parse_commit_line(line: &str) -> Option<Commit> {
    let parts: Vec<&str> = line.splitn(4, '\0').collect();
    if parts.len() < 4 {
        return None;
    }
    let timestamp = DateTime::parse_from_rfc3339(parts[3].trim())
        .ok()?
        .with_timezone(&Utc);
    Some(Commit {
        hash: parts[0].to_string(),
        message: parts[1].to_string(),
        author: parts[2].to_string(),
        timestamp,
    })
}
