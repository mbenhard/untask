use std::path::Path;

use serde::Serialize;
use untask_core::docs::DocsStore;
use untask_core::error::Result;

pub fn list(root: &Path, json: bool) -> Result<()> {
    let store = DocsStore::new(root.to_path_buf());
    let docs = store.list()?;

    if json {
        let items: Vec<DocEntry> = docs
            .iter()
            .map(|d| DocEntry {
                name: &d.basename,
                path: d
                    .path
                    .strip_prefix(root)
                    .unwrap_or(&d.path)
                    .to_string_lossy()
                    .into_owned(),
            })
            .collect();
        println!("{}", serde_json::to_string_pretty(&items)?);
    } else if docs.is_empty() {
        println!("No docs found.");
    } else {
        for doc in &docs {
            let rel = doc.path.strip_prefix(root).unwrap_or(&doc.path).display();
            println!("  {rel}");
        }
    }

    Ok(())
}

pub fn show(root: &Path, name: &str, json: bool) -> Result<()> {
    let store = DocsStore::new(root.to_path_buf());
    let doc = store.get(name)?;

    if json {
        let entry = DocDetail {
            name: &doc.basename,
            path: doc
                .path
                .strip_prefix(root)
                .unwrap_or(&doc.path)
                .to_string_lossy()
                .into_owned(),
            content: &doc.content,
        };
        println!("{}", serde_json::to_string_pretty(&entry)?);
    } else {
        print!("{}", doc.content);
        if !doc.content.ends_with('\n') {
            println!();
        }
    }

    Ok(())
}

#[derive(Serialize)]
struct DocEntry<'a> {
    name: &'a str,
    path: String,
}

#[derive(Serialize)]
struct DocDetail<'a> {
    name: &'a str,
    path: String,
    content: &'a str,
}
