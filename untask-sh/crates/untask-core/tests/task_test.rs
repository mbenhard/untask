use std::path::PathBuf;

use untask_core::slug::generate_slug;
use untask_core::task::{TaskKind, parse_filename_id, parse_task, serialize_task};

#[test]
fn parse_minimal_task() {
    let content = "---\ntitle: Fix the login bug\nstatus: todo\n---\n";
    let task = parse_task(content);
    assert_eq!(task.title, "Fix the login bug");
    assert_eq!(task.status, "todo");
    assert!(task.id.is_none());
    assert!(task.body.is_empty());
}

#[test]
fn parse_rich_task() {
    let content = r#"---
id: 2
title: Implement OAuth2 flow
status: in-progress
priority: high
tags: [auth, backend]
created: 2026-03-06
---

## Description
Need to support Google and GitHub OAuth providers.

## Subtasks
- [x] Set up OAuth credentials
- [ ] Implement callback handler
- [ ] Add session persistence
"#;
    let task = parse_task(content);
    assert_eq!(task.id, Some(2));
    assert_eq!(task.title, "Implement OAuth2 flow");
    assert_eq!(task.status, "in-progress");
    assert_eq!(task.tags, vec!["auth", "backend"]);
    assert!(task.body.contains("## Description"));
    assert_eq!(task.subtask_progress, (1, 3));
}

#[test]
fn malformed_frontmatter_preserves_body() {
    let content = "---\ntitle: [invalid: yaml: {{\n---\nSome body content here.\n";
    let task = parse_task(content);
    assert!(task.title.is_empty());
    assert!(task.body.contains("Some body content here."));
}

#[test]
fn partial_frontmatter_keeps_known_fields() {
    let content = "---\ntitle: Still visible\n---\nBody content.\n";
    let task = parse_task(content);
    assert_eq!(task.title, "Still visible");
    assert!(task.status.is_empty());
    assert_eq!(task.body, "Body content.\n");
}

#[test]
fn no_frontmatter_uses_entire_content_as_body() {
    let content = "Just a plain markdown file.\n";
    let task = parse_task(content);
    assert!(task.title.is_empty());
    assert_eq!(task.body, content);
}

#[test]
fn subtask_counting() {
    let content = "---\ntitle: Test\nstatus: todo\n---\n\n- [x] Done item\n- [ ] Open item\n- [x] Another done\n- [ ] Another open\n";
    let task = parse_task(content);
    assert_eq!(task.subtask_progress, (2, 4));
}

#[test]
fn nested_subtasks_ignored() {
    let content = "---\ntitle: Test\nstatus: todo\n---\n\n- [ ] Top level\n  - [ ] Nested (ignored)\n  - [x] Nested done (ignored)\n- [x] Another top\n";
    let task = parse_task(content);
    assert_eq!(task.subtask_progress, (1, 2));
}

#[test]
fn serialize_and_reparse_roundtrip() {
    let content = "---\ntitle: Roundtrip test\nstatus: done\n---\n\nBody content.\n";
    let task = parse_task(content);
    let serialized = serialize_task(&task);
    let reparsed = parse_task(&serialized);
    assert_eq!(reparsed.title, "Roundtrip test");
    assert_eq!(reparsed.status, "done");
    assert!(reparsed.body.contains("Body content."));
}

#[test]
fn serialize_preserves_body_exactly() {
    let content = "---\ntitle: Exact body\nstatus: todo\n---\n\nBody without trailing newline";
    let task = parse_task(content);
    assert_eq!(serialize_task(&task), content);
}

#[test]
fn task_kind_managed() {
    let mut task = parse_task("---\ntitle: Test\nstatus: todo\n---\n");
    task.file_path = Some(PathBuf::from("001-fix-bug.md"));
    assert_eq!(task.kind(), TaskKind::Managed);
}

#[test]
fn task_kind_unindexed_with_id() {
    let content = "---\nid: 5\ntitle: Test\nstatus: todo\n---\n";
    let mut task = parse_task(content);
    task.file_path = Some(PathBuf::from("fix-bug.md"));
    assert_eq!(task.kind(), TaskKind::UnindexedWithId);
}

#[test]
fn task_kind_unindexed_without_id() {
    let mut task = parse_task("---\ntitle: Test\nstatus: todo\n---\n");
    task.file_path = Some(PathBuf::from("random-notes.md"));
    assert_eq!(task.kind(), TaskKind::UnindexedWithoutId);
}

#[test]
fn slug_generation() {
    assert_eq!(generate_slug("Fix the login bug"), "fix-the-login-bug");
    assert_eq!(generate_slug("  Multiple   spaces  "), "multiple-spaces");
    assert_eq!(generate_slug("Special!@#chars"), "special-chars");
    assert_eq!(generate_slug("UPPERCASE"), "uppercase");
    assert_eq!(generate_slug("already-slugged"), "already-slugged");
}

#[test]
fn filename_id_extraction() {
    assert_eq!(parse_filename_id(&PathBuf::from("001-fix-bug.md")), Some(1));
    assert_eq!(parse_filename_id(&PathBuf::from("042-task.md")), Some(42));
    assert_eq!(parse_filename_id(&PathBuf::from("fix-bug.md")), None);
    assert_eq!(parse_filename_id(&PathBuf::from("abc-task.md")), None);
}
