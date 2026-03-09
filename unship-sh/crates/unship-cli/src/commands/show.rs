use serde::Serialize;
use unship_core::error::Result;
use unship_core::store::TaskStore;
use unship_core::task::Task;

use crate::output::Formatter;

pub fn run(store: &TaskStore, reference: &str, json: bool, fmt: &Formatter) -> Result<()> {
    let task = store.get_by_ref(reference)?;

    if json {
        println!(
            "{}",
            serde_json::to_string_pretty(&TaskDetail::from(&task))?
        );
    } else {
        print!("{}", fmt.task_detail(&task));
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
