use std::path::Path;

use untask_core::error::Result;
use untask_core::next::{self, NextSummary};

use crate::output::Formatter;

pub fn run(root: &Path, json: bool, fmt: &Formatter) -> Result<()> {
    let summary = next::generate_next(root)?;

    if json {
        println!("{}", serde_json::to_string_pretty(&summary)?);
    } else {
        print_summary(&summary, fmt);
    }

    Ok(())
}

fn print_summary(summary: &NextSummary, fmt: &Formatter) {
    let id_width = summary
        .open_tasks
        .iter()
        .chain(summary.recently_completed.iter())
        .filter_map(|task| task.id)
        .map(count_digits)
        .max()
        .unwrap_or(2)
        .max(2);

    if let Some(ref git) = summary.git {
        println!("{}", fmt.heading("Git"));
        println!("Branch: {}", git.branch);
        if git.has_uncommitted_changes {
            println!("{}", fmt.warning("Uncommitted changes present"));
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
        println!("{}", fmt.heading("Open Tasks"));
        for task in &summary.open_tasks {
            println!("{}", fmt.task_row(task, id_width));
        }
        println!();
    }

    if !summary.recently_completed.is_empty() {
        println!("{}", fmt.heading("Recently Completed"));
        for task in &summary.recently_completed {
            println!("{}", fmt.completed_task_row(task, id_width));
        }
        println!();
    }

    if !summary.cleanup_hints.is_empty() {
        println!("{}", fmt.heading("Cleanup"));
        for hint in &summary.cleanup_hints {
            println!("{}", fmt.bullet(&hint.message));
        }
        println!();
    }

    if summary.open_tasks.is_empty()
        && summary.recently_completed.is_empty()
        && summary.cleanup_hints.is_empty()
    {
        println!("{}", fmt.success("Nothing to do."));
    }
}

fn count_digits(id: u32) -> usize {
    id.to_string().len()
}
