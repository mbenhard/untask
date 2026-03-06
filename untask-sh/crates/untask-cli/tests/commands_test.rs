use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::{Command, Stdio},
};

use tempfile::TempDir;

fn untask() -> Command {
    Command::new(env!("CARGO_BIN_EXE_untask"))
}

fn run_in(dir: &std::path::Path, args: &[&str]) -> (String, String, bool) {
    run_in_with(dir, args, None, &[])
}

fn run_in_with(
    dir: &Path,
    args: &[&str],
    input: Option<&str>,
    envs: &[(&str, &str)],
) -> (String, String, bool) {
    let mut command = untask();
    command
        .args(args)
        .current_dir(dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    for (key, value) in envs {
        command.env(key, value);
    }
    if input.is_some() {
        command.stdin(Stdio::piped());
    }

    let mut child = command.spawn().unwrap();
    if let Some(input) = input {
        child
            .stdin
            .as_mut()
            .unwrap()
            .write_all(input.as_bytes())
            .unwrap();
    }

    let output = child.wait_with_output().unwrap();
    let stdout = String::from_utf8(output.stdout).unwrap();
    let stderr = String::from_utf8(output.stderr).unwrap();
    (stdout, stderr, output.status.success())
}

fn init_project(dir: &std::path::Path) {
    let (_, _, ok) = run_in(dir, &["init"]);
    assert!(ok, "init failed");
}

fn find_task_file(dir: &Path, slug_fragment: &str) -> PathBuf {
    fs::read_dir(dir.join(".untask/tasks"))
        .unwrap()
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .find(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.contains(slug_fragment))
        })
        .unwrap()
}

fn insert_frontmatter_lines(path: &Path, lines: &[&str]) {
    let content = fs::read_to_string(path).unwrap();
    let injected = content.replacen("\n---\n", &format!("\n{}\n---\n", lines.join("\n")), 1);
    fs::write(path, injected).unwrap();
}

// ── Init ────────────────────────────────────────────────────────────

#[test]
fn init_creates_project() {
    let tmp = TempDir::new().unwrap();
    let (stdout, _, ok) = run_in(tmp.path(), &["init"]);
    assert!(ok);
    assert!(stdout.contains("Initialized"));
    assert!(tmp.path().join(".untask/tasks").is_dir());
}

// ── Add ─────────────────────────────────────────────────────────────

#[test]
fn add_creates_task_file() {
    let tmp = TempDir::new().unwrap();
    init_project(tmp.path());

    let (stdout, _, ok) = run_in(tmp.path(), &["add", "Fix login bug"]);
    assert!(ok);
    assert!(stdout.contains("Created task #1: Fix login bug"));

    // Verify file exists
    let entries: Vec<_> = std::fs::read_dir(tmp.path().join(".untask/tasks"))
        .unwrap()
        .collect();
    assert_eq!(entries.len(), 1);
}

#[test]
fn add_with_status() {
    let tmp = TempDir::new().unwrap();
    init_project(tmp.path());

    let (stdout, _, ok) = run_in(tmp.path(), &["add", "WIP task", "--status", "in-progress"]);
    assert!(ok);
    assert!(stdout.contains("Created task #1"));
}

#[test]
fn add_json_output() {
    let tmp = TempDir::new().unwrap();
    init_project(tmp.path());

    let (stdout, _, ok) = run_in(tmp.path(), &["--json", "add", "JSON task"]);
    assert!(ok);
    let parsed: serde_json::Value = serde_json::from_str(&stdout).unwrap();
    assert_eq!(parsed["title"], "JSON task");
    assert_eq!(parsed["id"], 1);
}

// ── List ────────────────────────────────────────────────────────────

#[test]
fn list_displays_all_tasks() {
    let tmp = TempDir::new().unwrap();
    init_project(tmp.path());
    run_in(tmp.path(), &["add", "Task A"]);
    run_in(tmp.path(), &["add", "Task B"]);

    let (stdout, _, ok) = run_in(tmp.path(), &["list"]);
    assert!(ok);
    assert!(stdout.contains("Task A"));
    assert!(stdout.contains("Task B"));
}

#[test]
fn list_filters_by_status() {
    let tmp = TempDir::new().unwrap();
    init_project(tmp.path());
    run_in(tmp.path(), &["add", "Backlog task"]);
    run_in(tmp.path(), &["add", "Done task", "--status", "done"]);

    let (stdout, _, ok) = run_in(tmp.path(), &["list", "--status", "done"]);
    assert!(ok);
    assert!(stdout.contains("Done task"));
    assert!(!stdout.contains("Backlog task"));
}

#[test]
fn list_rejects_unknown_status_filter() {
    let tmp = TempDir::new().unwrap();
    init_project(tmp.path());

    let (_, stderr, ok) = run_in(tmp.path(), &["list", "--status", "not-a-status"]);
    assert!(!ok);
    assert!(stderr.contains("unknown status"));
}

#[test]
fn list_filters_by_tag() {
    let tmp = TempDir::new().unwrap();
    init_project(tmp.path());
    run_in(tmp.path(), &["add", "Tagged task"]);

    // Manually add a tag to the task file
    let task_path = find_task_file(tmp.path(), "tagged-task");
    insert_frontmatter_lines(&task_path, &["tags:", "  - bug"]);

    let (stdout, _, ok) = run_in(tmp.path(), &["list", "--tag", "bug"]);
    assert!(ok);
    assert!(stdout.contains("Tagged task"));

    let (stdout, _, ok) = run_in(tmp.path(), &["list", "--tag", "feature"]);
    assert!(ok);
    assert!(stdout.contains("No tasks found"));
}

#[test]
fn list_filters_by_priority() {
    let tmp = TempDir::new().unwrap();
    init_project(tmp.path());
    run_in(tmp.path(), &["add", "Low priority"]);
    run_in(tmp.path(), &["add", "High priority"]);

    insert_frontmatter_lines(
        &find_task_file(tmp.path(), "low-priority"),
        &["priority: low"],
    );
    insert_frontmatter_lines(
        &find_task_file(tmp.path(), "high-priority"),
        &["priority: high"],
    );

    let (stdout, _, ok) = run_in(tmp.path(), &["list", "--priority", "high"]);
    assert!(ok);
    assert!(stdout.contains("High priority"));
    assert!(!stdout.contains("Low priority"));
}

#[test]
fn list_json_outputs_valid_array() {
    let tmp = TempDir::new().unwrap();
    init_project(tmp.path());
    run_in(tmp.path(), &["add", "JSON list task"]);

    let (stdout, _, ok) = run_in(tmp.path(), &["--json", "list"]);
    assert!(ok);
    let parsed: Vec<serde_json::Value> = serde_json::from_str(&stdout).unwrap();
    assert_eq!(parsed.len(), 1);
    assert_eq!(parsed[0]["title"], "JSON list task");
}

#[test]
fn list_sort_by_title() {
    let tmp = TempDir::new().unwrap();
    init_project(tmp.path());
    run_in(tmp.path(), &["add", "Zebra"]);
    run_in(tmp.path(), &["add", "Alpha"]);

    let (stdout, _, ok) = run_in(tmp.path(), &["--json", "list", "--sort", "title"]);
    assert!(ok);
    let parsed: Vec<serde_json::Value> = serde_json::from_str(&stdout).unwrap();
    assert_eq!(parsed[0]["title"], "Alpha");
    assert_eq!(parsed[1]["title"], "Zebra");
}

#[test]
fn list_sort_by_priority_is_stable() {
    let tmp = TempDir::new().unwrap();
    init_project(tmp.path());
    run_in(tmp.path(), &["add", "Alpha high"]);
    run_in(tmp.path(), &["add", "Bravo high"]);
    run_in(tmp.path(), &["add", "Charlie medium"]);

    insert_frontmatter_lines(
        &find_task_file(tmp.path(), "alpha-high"),
        &["priority: high"],
    );
    insert_frontmatter_lines(
        &find_task_file(tmp.path(), "bravo-high"),
        &["priority: high"],
    );
    insert_frontmatter_lines(
        &find_task_file(tmp.path(), "charlie-medium"),
        &["priority: medium"],
    );

    let (stdout, _, ok) = run_in(tmp.path(), &["--json", "list", "--sort", "priority"]);
    assert!(ok);
    let parsed: Vec<serde_json::Value> = serde_json::from_str(&stdout).unwrap();
    let titles: Vec<_> = parsed
        .iter()
        .map(|task| task["title"].as_str().unwrap())
        .collect();
    assert_eq!(titles, vec!["Alpha high", "Bravo high", "Charlie medium"]);
}

// ── Show ────────────────────────────────────────────────────────────

#[test]
fn show_displays_task_details() {
    let tmp = TempDir::new().unwrap();
    init_project(tmp.path());
    run_in(tmp.path(), &["add", "Detailed task"]);

    let (stdout, _, ok) = run_in(tmp.path(), &["show", "1"]);
    assert!(ok);
    assert!(stdout.contains("#1 Detailed task"));
    assert!(stdout.contains("Status: backlog"));
}

#[test]
fn show_json_outputs_valid_object() {
    let tmp = TempDir::new().unwrap();
    init_project(tmp.path());
    run_in(tmp.path(), &["add", "JSON show task"]);

    let (stdout, _, ok) = run_in(tmp.path(), &["--json", "show", "1"]);
    assert!(ok);
    let parsed: serde_json::Value = serde_json::from_str(&stdout).unwrap();
    assert_eq!(parsed["title"], "JSON show task");
    assert_eq!(parsed["id"], 1);
}

#[test]
fn show_json_includes_body_and_subtask_progress() {
    let tmp = TempDir::new().unwrap();
    init_project(tmp.path());
    run_in(tmp.path(), &["add", "Body task"]);

    let task_path = find_task_file(tmp.path(), "body-task");
    let mut content = fs::read_to_string(&task_path).unwrap();
    content.push_str("- [x] shipped\n- [ ] remaining\n");
    fs::write(&task_path, content).unwrap();

    let (stdout, _, ok) = run_in(tmp.path(), &["--json", "show", "1"]);
    assert!(ok);
    let parsed: serde_json::Value = serde_json::from_str(&stdout).unwrap();
    assert!(parsed["body"].as_str().unwrap().contains("- [x] shipped"));
    assert_eq!(parsed["subtask_progress"]["completed"], 1);
    assert_eq!(parsed["subtask_progress"]["total"], 2);
}

// ── Status ──────────────────────────────────────────────────────────

#[test]
fn status_changes_task_status() {
    let tmp = TempDir::new().unwrap();
    init_project(tmp.path());
    run_in(tmp.path(), &["add", "Status task"]);

    let (stdout, _, ok) = run_in(tmp.path(), &["status", "1", "in-progress"]);
    assert!(ok);
    assert!(stdout.contains("backlog -> in-progress"));
}

#[test]
fn status_normalizes_aliases() {
    let tmp = TempDir::new().unwrap();
    init_project(tmp.path());
    run_in(tmp.path(), &["add", "Alias task"]);

    let (stdout, _, ok) = run_in(tmp.path(), &["status", "1", "wip"]);
    assert!(ok);
    assert!(stdout.contains("in-progress"));
}

// ── Done ────────────────────────────────────────────────────────────

#[test]
fn done_sets_status_to_done() {
    let tmp = TempDir::new().unwrap();
    init_project(tmp.path());
    run_in(tmp.path(), &["add", "Done task"]);

    let (stdout, _, ok) = run_in(tmp.path(), &["done", "1"]);
    assert!(ok);
    assert!(stdout.contains("marked as done"));

    // Verify completed timestamp is set
    let (stdout, _, ok) = run_in(tmp.path(), &["--json", "show", "1"]);
    assert!(ok);
    let parsed: serde_json::Value = serde_json::from_str(&stdout).unwrap();
    assert_eq!(parsed["status"], "done");
    assert!(parsed["completed"].is_string());
}

#[test]
fn edit_supports_editor_commands_with_arguments() {
    let tmp = TempDir::new().unwrap();
    init_project(tmp.path());
    run_in(tmp.path(), &["add", "Editable task"]);

    let script_path = tmp.path().join("mock-editor.sh");
    let log_path = tmp.path().join("editor.log");
    fs::write(
        &script_path,
        "#!/bin/sh\nprintf '%s\n' \"$@\" > \"$UNTASK_EDITOR_LOG\"\n",
    )
    .unwrap();

    let editor = format!("sh {} --wait", script_path.display());
    let (_, stderr, ok) = run_in_with(
        tmp.path(),
        &["edit", "1"],
        None,
        &[
            ("EDITOR", editor.as_str()),
            ("UNTASK_EDITOR_LOG", log_path.to_str().unwrap()),
        ],
    );
    assert!(ok, "edit failed: {stderr}");

    let recorded = fs::read_to_string(&log_path).unwrap();
    assert!(recorded.contains("--wait"));
    assert!(recorded.contains(".untask/tasks/001-editable-task.md"));
}

// ── Delete ──────────────────────────────────────────────────────────

#[test]
fn delete_with_force_removes_task() {
    let tmp = TempDir::new().unwrap();
    init_project(tmp.path());
    run_in(tmp.path(), &["add", "Delete me"]);

    let (stdout, _, ok) = run_in(tmp.path(), &["delete", "1", "--force"]);
    assert!(ok);
    assert!(stdout.contains("Deleted #1"));

    // Verify task is gone
    let entries: Vec<_> = std::fs::read_dir(tmp.path().join(".untask/tasks"))
        .unwrap()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().is_some_and(|ext| ext == "md"))
        .collect();
    assert_eq!(entries.len(), 0);
}

#[test]
fn delete_without_force_can_be_cancelled() {
    let tmp = TempDir::new().unwrap();
    init_project(tmp.path());
    run_in(tmp.path(), &["add", "Keep me"]);

    let (_, stderr, ok) = run_in_with(tmp.path(), &["delete", "1"], Some("n\n"), &[]);
    assert!(ok);
    assert!(stderr.contains("Cancelled."));

    let entries: Vec<_> = fs::read_dir(tmp.path().join(".untask/tasks"))
        .unwrap()
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.path().extension().is_some_and(|ext| ext == "md"))
        .collect();
    assert_eq!(entries.len(), 1);
}

#[test]
fn delete_json_output() {
    let tmp = TempDir::new().unwrap();
    init_project(tmp.path());
    run_in(tmp.path(), &["add", "JSON delete"]);

    let (stdout, _, ok) = run_in(tmp.path(), &["--json", "delete", "1", "--force"]);
    assert!(ok);
    let parsed: serde_json::Value = serde_json::from_str(&stdout).unwrap();
    assert_eq!(parsed["deleted"], 1);
}

// ── Full workflow ───────────────────────────────────────────────────

#[test]
fn full_workflow_init_add_list_show_status_done_delete() {
    let tmp = TempDir::new().unwrap();

    // init
    let (_, _, ok) = run_in(tmp.path(), &["init"]);
    assert!(ok);

    // add
    let (stdout, _, ok) = run_in(tmp.path(), &["add", "Workflow task"]);
    assert!(ok);
    assert!(stdout.contains("Created task #1"));

    // list
    let (stdout, _, ok) = run_in(tmp.path(), &["list"]);
    assert!(ok);
    assert!(stdout.contains("Workflow task"));

    // show
    let (stdout, _, ok) = run_in(tmp.path(), &["show", "1"]);
    assert!(ok);
    assert!(stdout.contains("#1 Workflow task"));

    // status
    let (stdout, _, ok) = run_in(tmp.path(), &["status", "1", "in-progress"]);
    assert!(ok);
    assert!(stdout.contains("in-progress"));

    // done
    let (stdout, _, ok) = run_in(tmp.path(), &["done", "1"]);
    assert!(ok);
    assert!(stdout.contains("marked as done"));

    // delete
    let (stdout, _, ok) = run_in(tmp.path(), &["delete", "1", "--force"]);
    assert!(ok);
    assert!(stdout.contains("Deleted #1"));

    // list should be empty
    let (stdout, _, ok) = run_in(tmp.path(), &["list"]);
    assert!(ok);
    assert!(stdout.contains("No tasks found"));
}

// ── Error cases ─────────────────────────────────────────────────────

#[test]
fn commands_fail_when_not_initialized() {
    let tmp = TempDir::new().unwrap();

    for args in [
        vec!["add", "test"],
        vec!["list"],
        vec!["show", "1"],
        vec!["edit", "1"],
        vec!["status", "1", "done"],
        vec!["done", "1"],
        vec!["delete", "1", "--force"],
    ] {
        let (_, stderr, ok) = run_in(tmp.path(), &args);
        assert!(!ok, "expected failure for {:?}, stderr: {}", args, stderr);
        assert!(
            stderr.contains("not initialized"),
            "expected 'not initialized' in stderr for {:?}, got: {}",
            args,
            stderr
        );
    }
}
