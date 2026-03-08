use crate::output::Formatter;
use untask_core::error::{Result, UntaskError};
use untask_core::store::{ListFilter, TaskStore};
use untask_core::task::Task;

pub fn run(
    store: &TaskStore,
    status: Option<&str>,
    tag: Option<&str>,
    sort: &str,
    json: bool,
    fmt: &Formatter,
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

    // Sort
    sort_tasks(&mut tasks, sort)?;

    if json {
        println!("{}", serde_json::to_string_pretty(&tasks)?);
    } else if tasks.is_empty() {
        println!("No tasks found.");
    } else {
        print_task_table(&tasks, fmt);
    }

    Ok(())
}

fn sort_tasks(tasks: &mut [Task], field: &str) -> Result<()> {
    match field {
        "id" => {} // already sorted by id from store
        "updated" => tasks.sort_by(|a, b| b.updated.cmp(&a.updated)),
        "created" => tasks.sort_by(|a, b| b.created.cmp(&a.created)),
        "title" => tasks.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase())),
        _ => {
            return Err(UntaskError::InvalidConfig(format!(
                "unknown sort field: {field} (use: id, updated, created, title)"
            )));
        }
    }
    Ok(())
}

fn print_task_table(tasks: &[Task], fmt: &Formatter) {
    let id_width = tasks
        .iter()
        .filter_map(|t| t.id)
        .map(|id| id.to_string().len())
        .max()
        .unwrap_or(2)
        .max(2);

    for task in tasks {
        println!("{}", fmt.task_row(task, id_width));
    }
}
