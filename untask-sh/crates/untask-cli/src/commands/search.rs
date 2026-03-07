use std::path::Path;

use serde::Serialize;
use untask_core::error::Result;
use untask_core::search::{self, SearchResult, SearchResultKind};

pub fn run(root: &Path, query: &str, tasks_only: bool, json: bool) -> Result<()> {
    let results = search::search(root, query, tasks_only)?;

    if json {
        let items: Vec<SearchEntry> = results
            .iter()
            .map(|r| SearchEntry {
                kind: match r.kind {
                    SearchResultKind::Task => "task",
                    SearchResultKind::Doc => "doc",
                },
                title: &r.title,
                path: r
                    .path
                    .strip_prefix(root)
                    .unwrap_or(&r.path)
                    .to_string_lossy()
                    .into_owned(),
                snippet: &r.snippet,
                line: r.line_number,
            })
            .collect();
        println!("{}", serde_json::to_string_pretty(&items)?);
    } else if results.is_empty() {
        println!("No results for \"{query}\".");
    } else {
        for r in &results {
            print_result(root, r);
        }
    }

    Ok(())
}

fn print_result(root: &Path, result: &SearchResult) {
    let kind_label = match result.kind {
        SearchResultKind::Task => "task",
        SearchResultKind::Doc => "doc",
    };
    let rel = result
        .path
        .strip_prefix(root)
        .unwrap_or(&result.path)
        .display();
    println!("[{kind_label}] {}", result.title);
    println!("  {rel}:{}", result.line_number);
    println!("  {}", result.snippet);
    println!();
}

#[derive(Serialize)]
struct SearchEntry<'a> {
    kind: &'a str,
    title: &'a str,
    path: String,
    snippet: &'a str,
    line: u32,
}
