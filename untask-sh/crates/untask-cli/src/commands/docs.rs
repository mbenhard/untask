use std::path::Path;

use serde::Serialize;
use untask_core::config::Config;
use untask_core::docs::DocsStore;
use untask_core::error::{Result, UntaskError};

pub fn list(root: &Path, doc_type: Option<&str>, json: bool) -> Result<()> {
    let store = DocsStore::new(root.to_path_buf());
    let mut docs = store.list()?;

    if let Some(type_filter) = doc_type {
        let filter_type = match type_filter {
            "prd" => untask_core::docs::DocType::Prd,
            "doc" => untask_core::docs::DocType::Doc,
            other => {
                return Err(UntaskError::InvalidConfig(format!(
                    "unknown doc type: {other}"
                )))
            }
        };
        docs.retain(|d| d.doc_type == filter_type);
    }

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
                doc_type: d.doc_type,
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
            doc_type: doc.doc_type,
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

pub fn paths(root: &Path, json: bool) -> Result<()> {
    let config = Config::load(root);

    if json {
        println!("{}", serde_json::to_string_pretty(&config.docs)?);
    } else if config.docs.is_empty() {
        println!("No doc paths configured.");
    } else {
        for pattern in &config.docs {
            println!("  {pattern}");
        }
    }

    Ok(())
}

pub fn add_path(root: &Path, pattern: &str, json: bool) -> Result<()> {
    let mut config = Config::load(root);

    if config.docs.iter().any(|p| p == pattern) {
        if json {
            println!("{}", serde_json::json!({ "status": "already_exists", "pattern": pattern }));
        } else {
            println!("Pattern already configured: {pattern}");
        }
        return Ok(());
    }

    config.docs.push(pattern.to_string());
    config.validate_doc_globs()?;
    config.save(root)?;

    if json {
        println!("{}", serde_json::json!({ "status": "added", "pattern": pattern, "docs": config.docs }));
    } else {
        println!("Added: {pattern}");
    }

    Ok(())
}

pub fn remove_path(root: &Path, pattern: &str, json: bool) -> Result<()> {
    let mut config = Config::load(root);

    let before_len = config.docs.len();
    config.docs.retain(|p| p != pattern);

    if config.docs.len() == before_len {
        return Err(UntaskError::InvalidConfig(format!(
            "pattern not found: {pattern}"
        )));
    }

    config.save(root)?;

    if json {
        println!("{}", serde_json::json!({ "status": "removed", "pattern": pattern, "docs": config.docs }));
    } else {
        println!("Removed: {pattern}");
        if config.docs.is_empty() {
            println!("No doc paths configured. Use `untask docs add-path` to add one.");
        }
    }

    Ok(())
}

#[derive(Serialize)]
struct DocEntry<'a> {
    name: &'a str,
    path: String,
    doc_type: untask_core::docs::DocType,
}

#[derive(Serialize)]
struct DocDetail<'a> {
    name: &'a str,
    path: String,
    doc_type: untask_core::docs::DocType,
    content: &'a str,
}
