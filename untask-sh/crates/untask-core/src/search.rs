use std::path::{Path, PathBuf};

use crate::docs::DocsStore;
use crate::error::Result;
use crate::store::TaskStore;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SearchResultKind {
    Task,
    Doc,
}

#[derive(Debug, Clone)]
pub struct SearchResult {
    pub kind: SearchResultKind,
    pub path: PathBuf,
    pub title: String,
    pub snippet: String,
    pub line_number: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum SearchMatchKind {
    TaskTitle,
    TaskTag,
    TaskBody,
    DocContent,
}

#[derive(Debug, Clone)]
struct RankedSearchResult {
    match_kind: SearchMatchKind,
    result: SearchResult,
}

pub fn search(project_root: &Path, query: &str, tasks_only: bool) -> Result<Vec<SearchResult>> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(vec![]);
    }

    let mut results = Vec::new();
    let query_lower = query.to_lowercase();

    let store = TaskStore::new(project_root.to_path_buf())?;
    let tasks = store.list(None)?;

    for task in tasks {
        if task.title.to_lowercase().contains(&query_lower) {
            results.push(RankedSearchResult {
                match_kind: SearchMatchKind::TaskTitle,
                result: SearchResult {
                    kind: SearchResultKind::Task,
                    path: task.file_path.clone().unwrap_or_default(),
                    title: task.title.clone(),
                    snippet: make_snippet(&task.title, &query_lower),
                    line_number: 1,
                },
            });
            continue;
        }

        if let Some(matched_tag) = task
            .tags
            .iter()
            .find(|tag| tag.to_lowercase().contains(&query_lower))
        {
            results.push(RankedSearchResult {
                match_kind: SearchMatchKind::TaskTag,
                result: SearchResult {
                    kind: SearchResultKind::Task,
                    path: task.file_path.clone().unwrap_or_default(),
                    title: task.title.clone(),
                    snippet: format!("tag: {}", make_snippet(matched_tag, &query_lower)),
                    line_number: 0,
                },
            });
            continue;
        }

        if let Some((line_number, line)) = find_match_line(&task.body, &query_lower) {
            results.push(RankedSearchResult {
                match_kind: SearchMatchKind::TaskBody,
                result: SearchResult {
                    kind: SearchResultKind::Task,
                    path: task.file_path.clone().unwrap_or_default(),
                    title: task.title,
                    snippet: make_snippet(line, &query_lower),
                    line_number,
                },
            });
        }
    }

    if !tasks_only {
        let docs_store = DocsStore::new(project_root.to_path_buf());
        for doc in docs_store.list()? {
            if let Some((line_number, line)) = find_match_line(&doc.content, &query_lower) {
                results.push(RankedSearchResult {
                    match_kind: SearchMatchKind::DocContent,
                    result: SearchResult {
                        kind: SearchResultKind::Doc,
                        path: doc.path,
                        title: doc.basename,
                        snippet: make_snippet(line, &query_lower),
                        line_number,
                    },
                });
            }
        }
    }

    results.sort_by(|left, right| {
        left.match_kind
            .cmp(&right.match_kind)
            .then_with(|| {
                left.result
                    .title
                    .to_lowercase()
                    .cmp(&right.result.title.to_lowercase())
            })
            .then_with(|| left.result.path.cmp(&right.result.path))
            .then_with(|| left.result.line_number.cmp(&right.result.line_number))
    });

    Ok(results.into_iter().map(|result| result.result).collect())
}

fn find_match_line<'a>(content: &'a str, query_lower: &str) -> Option<(u32, &'a str)> {
    content.lines().enumerate().find_map(|(index, line)| {
        line.to_lowercase()
            .contains(query_lower)
            .then_some(((index + 1) as u32, line))
    })
}

fn make_snippet(text: &str, query_lower: &str) -> String {
    let text_lower = text.to_lowercase();
    let Some(pos) = text_lower.find(query_lower) else {
        return text.to_string();
    };

    let match_len = query_lower.len();
    let match_end = pos + match_len;

    if match_end > text.len() || !text.is_char_boundary(pos) || !text.is_char_boundary(match_end) {
        return text.to_string();
    }

    let start = text[..pos]
        .char_indices()
        .rev()
        .nth(49)
        .map(|(i, _)| i)
        .unwrap_or(0);
    let end = text[match_end..]
        .char_indices()
        .nth(50)
        .map(|(i, _)| match_end + i)
        .unwrap_or(text.len());

    let mut snippet = String::new();
    if start > 0 {
        snippet.push_str("...");
    }
    snippet.push_str(&text[start..pos]);
    snippet.push_str("**");
    snippet.push_str(&text[pos..match_end]);
    snippet.push_str("**");
    snippet.push_str(&text[match_end..end]);
    if end < text.len() {
        snippet.push_str("...");
    }
    snippet
}
