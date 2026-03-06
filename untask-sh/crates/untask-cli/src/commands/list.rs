use untask_core::error::{Result, UntaskError};
use untask_core::store::{ListFilter, TaskStore};
use untask_core::task::Task;
use untask_core::types::Priority;

pub fn run(
    store: &TaskStore,
    status: Option<&str>,
    tag: Option<&str>,
    priority: Option<&str>,
    sort: &str,
    json: bool,
) -> Result<()> {
    let status = status
        .map(|raw| {
            store
                .config()
                .normalize_status(raw)
                .ok_or_else(|| UntaskError::InvalidConfig(format!("unknown status: {raw}")))
        })
        .transpose()?;

    let filter = if status.is_some() || tag.is_some() {
        Some(ListFilter {
            status,
            tag: tag.map(String::from),
        })
    } else {
        None
    };

    let mut tasks = store.list(filter)?;

    // Filter by priority (post-filter since store doesn't support it)
    if let Some(p) = priority {
        let target = parse_priority(p)?;
        tasks.retain(|t| t.priority == Some(target));
    }

    // Sort
    sort_tasks(&mut tasks, sort)?;

    if json {
        println!("{}", serde_json::to_string_pretty(&tasks)?);
    } else if tasks.is_empty() {
        println!("No tasks found.");
    } else {
        print_task_table(&tasks);
    }

    Ok(())
}

fn parse_priority(s: &str) -> Result<Priority> {
    match s.to_lowercase().as_str() {
        "low" => Ok(Priority::Low),
        "medium" | "med" => Ok(Priority::Medium),
        "high" => Ok(Priority::High),
        "urgent" => Ok(Priority::Urgent),
        _ => Err(UntaskError::InvalidConfig(format!("unknown priority: {s}"))),
    }
}

fn sort_tasks(tasks: &mut [Task], field: &str) -> Result<()> {
    match field {
        "id" => {} // already sorted by id from store
        "priority" => tasks.sort_by(|a, b| a.priority.cmp(&b.priority).reverse()),
        "updated" => tasks.sort_by(|a, b| b.updated.cmp(&a.updated)),
        "created" => tasks.sort_by(|a, b| b.created.cmp(&a.created)),
        "title" => tasks.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase())),
        _ => {
            return Err(UntaskError::InvalidConfig(format!(
                "unknown sort field: {field} (use: id, priority, updated, created, title)"
            )));
        }
    }
    Ok(())
}

fn print_task_table(tasks: &[Task]) {
    // Find max widths for formatting
    let id_width = tasks
        .iter()
        .filter_map(|t| t.id)
        .map(|id| id.to_string().len())
        .max()
        .unwrap_or(2)
        .max(2);

    for task in tasks {
        let id_str = task
            .id
            .map(|id| format!("{id:>width$}", width = id_width))
            .unwrap_or_else(|| " ".repeat(id_width));

        let priority_dot = match task.priority {
            Some(Priority::Urgent) => "!",
            Some(Priority::High) => "*",
            Some(Priority::Medium) => ".",
            Some(Priority::Low) | None => " ",
        };

        let progress = if task.subtask_progress.1 > 0 {
            format!(" [{}/{}]", task.subtask_progress.0, task.subtask_progress.1)
        } else {
            String::new()
        };

        let tags = if task.tags.is_empty() {
            String::new()
        } else {
            format!(" [{}]", task.tags.join(", "))
        };

        println!(
            "  {priority_dot} #{id_str}  {status:<12}  {title}{tags}{progress}",
            status = task.status,
            title = task.title,
            tags = tags,
            progress = progress,
        );
    }
}
