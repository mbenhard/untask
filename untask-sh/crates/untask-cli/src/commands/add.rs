use untask_core::error::Result;
use untask_core::store::TaskStore;

pub fn run(
    store: &TaskStore,
    title: &str,
    status: Option<&str>,
    prd: Option<&str>,
    json: bool,
) -> Result<()> {
    let task = store.add(title, status, prd)?;
    if json {
        println!("{}", serde_json::to_string_pretty(&task)?);
    } else {
        println!("Created task #{}: {}", task.id.unwrap_or(0), task.title);
    }
    Ok(())
}
