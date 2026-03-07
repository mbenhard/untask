use std::path::Path;

use serde::Serialize;
use untask_core::error::Result;
use untask_core::search::{self, SearchResult, SearchResultKind};

use crate::output::Formatter;

pub fn run(root: &Path, query: &str, tasks_only: bool, json: bool, fmt: &Formatter) -> Result<()> {
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
            print!("{}", fmt_search_result(fmt, root, r));
        }
    }

    Ok(())
}

fn fmt_search_result(fmt: &Formatter, root: &Path, result: &SearchResult) -> String {
    let kind_label = match result.kind {
        SearchResultKind::Task => "task",
        SearchResultKind::Doc => "doc",
    };
    let rel = result
        .path
        .strip_prefix(root)
        .unwrap_or(&result.path)
        .display()
        .to_string();
    fmt.search_result(
        kind_label,
        &result.title,
        &format!("{rel}:{}", result.line_number),
        &result.snippet,
    )
}

#[derive(Serialize)]
struct SearchEntry<'a> {
    kind: &'a str,
    title: &'a str,
    path: String,
    snippet: &'a str,
    line: u32,
}
