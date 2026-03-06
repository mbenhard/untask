use serde::Serialize;
use untask_core::error::Result;
use untask_core::store::TaskStore;
use untask_core::task::Task;
use untask_core::types::Priority;

pub fn run(store: &TaskStore, reference: &str, json: bool) -> Result<()> {
    let task = store.get_by_ref(reference)?;

    if json {
        println!(
            "{}",
            serde_json::to_string_pretty(&TaskDetail::from(&task))?
        );
    } else {
        print_task_detail(&task);
    }

    Ok(())
}

#[derive(Serialize)]
struct TaskDetail<'a> {
    #[serde(flatten)]
    task: &'a Task,
    body: &'a str,
    subtask_progress: SubtaskProgress,
}

#[derive(Serialize)]
struct SubtaskProgress {
    completed: u32,
    total: u32,
}

impl<'a> From<&'a Task> for TaskDetail<'a> {
    fn from(task: &'a Task) -> Self {
        Self {
            task,
            body: &task.body,
            subtask_progress: SubtaskProgress {
                completed: task.subtask_progress.0,
                total: task.subtask_progress.1,
            },
        }
    }
}

fn print_task_detail(task: &Task) {
    let id_str = task
        .id
        .map(|id| format!("#{id}"))
        .unwrap_or_else(|| "?".into());

    println!("{id_str} {}", task.title);
    println!("Status: {}", task.status);

    if let Some(priority) = task.priority {
        println!("Priority: {}", format_priority(priority));
    }
    if !task.tags.is_empty() {
        println!("Tags: {}", task.tags.join(", "));
    }
    if let Some(created) = task.created {
        println!("Created: {created}");
    }
    if let Some(updated) = task.updated {
        println!("Updated: {}", updated.format("%Y-%m-%d %H:%M"));
    }
    if let Some(completed) = task.completed {
        println!("Completed: {}", completed.format("%Y-%m-%d %H:%M"));
    }
    if task.subtask_progress.1 > 0 {
        println!(
            "Progress: {}/{}",
            task.subtask_progress.0, task.subtask_progress.1
        );
    }
    if !task.body.is_empty() {
        println!();
        print!("{}", task.body);
        if !task.body.ends_with('\n') {
            println!();
        }
    }
}

fn format_priority(priority: Priority) -> &'static str {
    match priority {
        Priority::Low => "low",
        Priority::Medium => "medium",
        Priority::High => "high",
        Priority::Urgent => "urgent",
    }
}
