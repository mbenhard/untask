use std::io::{self, Write};

use untask_core::error::{Result, UntaskError};
use untask_core::store::TaskStore;

pub fn run(store: &TaskStore, reference: &str, force: bool, json: bool) -> Result<()> {
    let task = store.get_by_ref(reference)?;
    let id = task
        .id
        .ok_or_else(|| UntaskError::TaskNotFound(reference.to_string()))?;

    if !force {
        eprint!("Delete #{} \"{}\"? [y/N] ", id, task.title);
        io::stderr().flush().ok();

        let mut input = String::new();
        io::stdin()
            .read_line(&mut input)
            .map_err(|e| UntaskError::InvalidConfig(format!("failed to read confirmation: {e}")))?;

        if !input.trim().eq_ignore_ascii_case("y") {
            eprintln!("Cancelled.");
            return Ok(());
        }
    }

    store.delete(id)?;

    if json {
        println!("{}", serde_json::json!({ "deleted": id }));
    } else {
        println!("Deleted #{}", id);
    }
    Ok(())
}
