use std::path::Path;

use untask_core::error::Result;
use untask_core::next::{self, NextSummary};
use untask_core::types::Priority;

pub fn run(root: &Path, json: bool) -> Result<()> {
    let summary = next::generate_next(root)?;

    if json {
        println!("{}", serde_json::to_string_pretty(&summary)?);
    } else {
        print_summary(&summary);
    }

    Ok(())
}

fn print_summary(summary: &NextSummary) {
    if let Some(ref git) = summary.git {
        println!("## Git");
        println!("Branch: {}", git.branch);
        if git.has_uncommitted_changes {
            println!("Uncommitted changes present");
        }
        if !git.recent_commits.is_empty() {
            println!("Recent:");
            for commit in git.recent_commits.iter().take(5) {
                println!("  {} {}", &commit.hash[..7], commit.message);
            }
        }
        println!();
    }

    if !summary.open_tasks.is_empty() {
        println!("## Open Tasks");
        for task in &summary.open_tasks {
            let id = task.id.map(|id| format!("#{id}")).unwrap_or_default();
            let priority = task.priority.map(format_priority).unwrap_or("");
            let status = &task.status;
            println!("  {id} {:<40} [{status}] {priority}", task.title);
        }
        println!();
    }

    if !summary.recently_completed.is_empty() {
        println!("## Recently Completed");
        for task in &summary.recently_completed {
            let id = task.id.map(|id| format!("#{id}")).unwrap_or_default();
            let when = task
                .completed
                .map(|c| c.format("%Y-%m-%d").to_string())
                .unwrap_or_default();
            println!("  {id} {} ({})", task.title, when);
        }
        println!();
    }

    if !summary.cleanup_hints.is_empty() {
        println!("## Cleanup");
        for hint in &summary.cleanup_hints {
            println!("  - {}", hint.message);
        }
        println!();
    }

    if summary.open_tasks.is_empty()
        && summary.recently_completed.is_empty()
        && summary.cleanup_hints.is_empty()
    {
        println!("Nothing to do.");
    }
}

fn format_priority(p: Priority) -> &'static str {
    match p {
        Priority::Low => "low",
        Priority::Medium => "medium",
        Priority::High => "high",
        Priority::Urgent => "urgent",
    }
}
