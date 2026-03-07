use std::path::Path;

use untask_core::error::Result;
use untask_core::repair;

pub fn run(root: &Path, _check: bool, write: bool, json: bool) -> Result<()> {
    let report = if write {
        repair::repair(root)?
    } else {
        repair::check(root)?
    };

    if json {
        println!("{}", serde_json::to_string_pretty(&report)?);
        return Ok(());
    }

    if report.is_clean() && report.actions_taken.is_empty() {
        println!("Project is clean. No issues found.");
        return Ok(());
    }

    if !report.unindexed_tasks.is_empty() {
        println!("Unindexed tasks:");
        for u in &report.unindexed_tasks {
            println!("  {} - {}", u.path.display(), u.title);
        }
    }

    if !report.mismatched_ids.is_empty() {
        println!("Mismatched IDs:");
        for m in &report.mismatched_ids {
            println!(
                "  {} - filename:{} frontmatter:{}",
                m.path.display(),
                m.filename_id,
                m.frontmatter_id
            );
        }
    }

    if !report.unknown_statuses.is_empty() {
        println!("Unknown statuses:");
        for u in &report.unknown_statuses {
            println!("  {} - '{}' on {}", u.path.display(), u.status, u.title);
        }
    }

    if !report.noncanonical_statuses.is_empty() {
        println!("Non-canonical statuses:");
        for n in &report.noncanonical_statuses {
            println!(
                "  {} - '{}' should be '{}' on {}",
                n.path.display(),
                n.status,
                n.canonical_status,
                n.title
            );
        }
    }

    if !report.actions_taken.is_empty() {
        println!();
        println!("Actions taken:");
        for a in &report.actions_taken {
            println!("  {}", a.description);
        }
    } else if !report.is_clean() && !write {
        println!();
        println!("Run 'untask repair --write' to fix these issues.");
    }

    Ok(())
}
