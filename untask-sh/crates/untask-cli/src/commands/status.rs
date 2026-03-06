use untask_core::error::Result;
use untask_core::store::TaskStore;

pub fn run(store: &TaskStore, reference: &str, status: &str, json: bool) -> Result<()> {
    let task = store.get_by_ref(reference)?;
    let id = task
        .id
        .ok_or_else(|| untask_core::error::UntaskError::TaskNotFound(reference.to_string()))?;

    let updated = store.set_status(id, status)?;

    if json {
        println!("{}", serde_json::to_string_pretty(&updated)?);
    } else {
        println!("#{} {} -> {}", id, task.status, updated.status);
    }
    Ok(())
}
