use std::path::Path;

use chrono::{Duration, Utc};
use untask_core::git;
use untask_core::init::init;
use untask_core::next::{self, CleanupKind};
use untask_core::store::TaskStore;
fn setup() -> (tempfile::TempDir, TaskStore) {
    let tmp = tempfile::TempDir::new().unwrap();
    init(tmp.path(), None).unwrap();
    let store = TaskStore::new(tmp.path().to_path_buf()).unwrap();
    (tmp, store)
}

fn write_task(dir: &Path, filename: &str, content: &str) {
    let tasks_dir = dir.join(".untask/tasks");
    std::fs::write(tasks_dir.join(filename), content).unwrap();
}

fn git(dir: &Path, args: &[&str]) {
    let output = std::process::Command::new("git")
        .args(args)
        .current_dir(dir)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "git command failed: git {}\nstderr: {}",
        args.join(" "),
        String::from_utf8_lossy(&output.stderr)
    );
}

fn init_git_repo(dir: &Path) {
    git(dir, &["init"]);
    git(dir, &["config", "user.email", "test@test.com"]);
    git(dir, &["config", "user.name", "Test"]);
}

// ── Git summary ──────────────────────────────────────────────────────

#[test]
fn git_summary_returns_none_when_not_in_git_repo() {
    let tmp = tempfile::TempDir::new().unwrap();
    let result = git::get_summary(tmp.path(), 5);
    assert!(result.is_none());
}

#[test]
fn git_summary_returns_commits_when_available() {
    let tmp = tempfile::TempDir::new().unwrap();
    let dir = tmp.path();

    init_git_repo(dir);
    std::fs::write(dir.join("file.txt"), "hello").unwrap();
    git(dir, &["add", "."]);
    git(dir, &["commit", "-m", "initial commit"]);

    let summary = git::get_summary(dir, 5).unwrap();
    assert!(!summary.branch.is_empty());
    assert_eq!(summary.recent_commits.len(), 1);
    assert_eq!(summary.recent_commits[0].message, "initial commit");
    assert!(!summary.has_uncommitted_changes);
}

#[test]
fn git_summary_detects_uncommitted_changes() {
    let tmp = tempfile::TempDir::new().unwrap();
    let dir = tmp.path();

    init_git_repo(dir);
    std::fs::write(dir.join("file.txt"), "hello").unwrap();
    git(dir, &["add", "."]);
    git(dir, &["commit", "-m", "initial"]);

    // Create uncommitted change
    std::fs::write(dir.join("dirty.txt"), "uncommitted").unwrap();

    let summary = git::get_summary(dir, 5).unwrap();
    assert!(summary.has_uncommitted_changes);
}

#[test]
fn git_summary_handles_empty_history() {
    let tmp = tempfile::TempDir::new().unwrap();
    let dir = tmp.path();

    git(dir, &["init"]);

    // git log fails on empty repo, but get_summary should still return Some
    let summary = git::get_summary(dir, 5);
    // branch --show-current succeeds on a fresh repo
    if let Some(s) = summary {
        assert!(s.recent_commits.is_empty());
    }
}

// ── Next summary ─────────────────────────────────────────────────────

#[test]
fn next_includes_open_tasks_sorted_by_updated_descending() {
    let (tmp, store) = setup();
    store.add("First task", None, None).unwrap();
    store.add("Second task", None, None).unwrap();
    store.add("Third task", None, None).unwrap();

    // Touch "First task" last so it becomes most recently updated
    store
        .update(
            1,
            untask_core::store::TaskUpdate {
                title: Some("First task".into()),
                ..Default::default()
            },
        )
        .unwrap();

    let summary = next::generate_next(tmp.path()).unwrap();
    assert_eq!(summary.open_tasks.len(), 3);
    // Most recently updated first
    assert_eq!(summary.open_tasks[0].title, "First task");
}

#[test]
fn next_includes_recently_completed_tasks() {
    let (tmp, store) = setup();
    store.add("Done task", Some("done"), None).unwrap();
    store.add("Open task", None, None).unwrap();

    let summary = next::generate_next(tmp.path()).unwrap();
    assert_eq!(summary.recently_completed.len(), 1);
    assert_eq!(summary.recently_completed[0].title, "Done task");
    assert_eq!(summary.open_tasks.len(), 1);
    assert_eq!(summary.open_tasks[0].title, "Open task");
}

#[test]
fn next_treats_done_aliases_as_completed_instead_of_open() {
    let (tmp, _store) = setup();
    write_task(
        tmp.path(),
        "001-finished.md",
        &format!(
            "---\nid: 1\ntitle: Finished via alias\nstatus: finished\ncompleted: \"{}\"\n---\n",
            Utc::now().to_rfc3339()
        ),
    );

    let summary = next::generate_next(tmp.path()).unwrap();
    assert!(summary.open_tasks.is_empty());
    assert_eq!(summary.recently_completed.len(), 1);
    assert_eq!(summary.recently_completed[0].title, "Finished via alias");
    assert!(
        summary
            .cleanup_hints
            .iter()
            .any(|hint| hint.kind == CleanupKind::NoncanonicalStatus)
    );
}

#[test]
fn next_excludes_old_completed_tasks() {
    let (tmp, _store) = setup();
    // Write a task with a completed timestamp > 7 days ago
    let old_timestamp = (Utc::now() - Duration::days(10)).to_rfc3339();
    write_task(
        tmp.path(),
        "001-old-done.md",
        &format!(
            "---\nid: 1\ntitle: Old done\nstatus: done\ncompleted: \"{}\"\n---\n",
            old_timestamp
        ),
    );

    let summary = next::generate_next(tmp.path()).unwrap();
    assert!(summary.recently_completed.is_empty());
}

#[test]
fn next_omits_empty_sections() {
    let (tmp, _store) = setup();
    // No tasks at all
    let summary = next::generate_next(tmp.path()).unwrap();
    assert!(summary.open_tasks.is_empty());
    assert!(summary.recently_completed.is_empty());
    assert!(summary.cleanup_hints.is_empty());
}

#[test]
fn next_includes_cleanup_hints_for_unindexed_tasks() {
    let (tmp, _store) = setup();
    write_task(
        tmp.path(),
        "loose-note.md",
        "---\ntitle: Loose note\nstatus: todo\n---\n",
    );

    let summary = next::generate_next(tmp.path()).unwrap();
    assert_eq!(summary.cleanup_hints.len(), 1);
    assert_eq!(summary.cleanup_hints[0].kind, CleanupKind::Unindexed);
}

#[test]
fn next_includes_cleanup_hints_for_unknown_statuses() {
    let (tmp, _store) = setup();
    write_task(
        tmp.path(),
        "001-bad.md",
        "---\nid: 1\ntitle: Bad status\nstatus: yolo\n---\n",
    );

    let summary = next::generate_next(tmp.path()).unwrap();
    assert!(
        summary
            .cleanup_hints
            .iter()
            .any(|h| h.kind == CleanupKind::UnknownStatus)
    );
}

#[test]
fn next_works_in_non_git_directory() {
    let (tmp, store) = setup();
    store.add("Task in non-git dir", None, None).unwrap();

    let summary = next::generate_next(tmp.path()).unwrap();
    assert!(summary.git.is_none());
    assert_eq!(summary.open_tasks.len(), 1);
}

#[test]
fn recently_completed_filter_handles_missing_completed_timestamp() {
    let (tmp, _store) = setup();
    // A done task without a completed timestamp should not appear in recently_completed
    write_task(
        tmp.path(),
        "001-no-timestamp.md",
        "---\nid: 1\ntitle: No timestamp\nstatus: done\n---\n",
    );

    let summary = next::generate_next(tmp.path()).unwrap();
    assert!(summary.recently_completed.is_empty());
}

#[test]
fn next_respects_custom_done_columns() {
    let (tmp, _store) = setup();
    std::fs::write(
        tmp.path().join(".untask/config.yml"),
        r#"
columns:
  - id: todo
  - id: shipped
    done: true
"#,
    )
    .unwrap();

    write_task(
        tmp.path(),
        "001-shipped.md",
        &format!(
            "---\nid: 1\ntitle: Custom done\nstatus: shipped\ncompleted: \"{}\"\n---\n",
            Utc::now().to_rfc3339()
        ),
    );

    let summary = next::generate_next(tmp.path()).unwrap();
    assert!(summary.open_tasks.is_empty());
    assert_eq!(summary.recently_completed.len(), 1);
    assert_eq!(summary.recently_completed[0].status, "shipped");
}
