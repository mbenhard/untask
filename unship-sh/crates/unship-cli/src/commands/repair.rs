use std::path::Path;

use unship_core::error::Result;
use unship_core::repair;

use crate::output::Formatter;

pub fn run(root: &Path, _check: bool, write: bool, json: bool, fmt: &Formatter) -> Result<()> {
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
        println!("{}", fmt.success("Project is clean. No issues found."));
        return Ok(());
    }

    if !report.unindexed_tasks.is_empty() {
        println!("{}", fmt.section_title("Unindexed tasks"));
        for u in &report.unindexed_tasks {
            println!(
                "{}",
                fmt.path_detail(&u.path.display().to_string(), &u.title)
            );
        }
    }

    if !report.mismatched_ids.is_empty() {
        println!("{}", fmt.section_title("Mismatched IDs"));
        for m in &report.mismatched_ids {
            println!(
                "{}",
                fmt.path_detail(
                    &m.path.display().to_string(),
                    &format!(
                        "filename:{} frontmatter:{}",
                        m.filename_id, m.frontmatter_id
                    ),
                )
            );
        }
    }

    if !report.unknown_statuses.is_empty() {
        println!("{}", fmt.section_title("Unknown statuses"));
        for u in &report.unknown_statuses {
            println!(
                "{}",
                fmt.path_detail(
                    &u.path.display().to_string(),
                    &format!("'{}' on {}", u.status, u.title),
                )
            );
        }
    }

    if !report.noncanonical_statuses.is_empty() {
        println!("{}", fmt.section_title("Non-canonical statuses"));
        for n in &report.noncanonical_statuses {
            println!(
                "{}",
                fmt.path_detail(
                    &n.path.display().to_string(),
                    &format!(
                        "'{}' should be '{}' on {}",
                        n.status, n.canonical_status, n.title
                    ),
                )
            );
        }
    }

    if !report.actions_taken.is_empty() {
        println!();
        println!("{}", fmt.section_title("Actions taken"));
        for a in &report.actions_taken {
            println!("{}", fmt.bullet(&a.description));
        }
    } else if !report.is_clean() && !write {
        println!();
        println!(
            "{}",
            fmt.warning("Run 'unship repair --write' to fix these issues.")
        );
    }

    Ok(())
}
