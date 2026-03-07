use std::{
    env, fs,
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

fn write_doc(dir: &Path, rel_path: &str, content: &str) {
    let path = dir.join(rel_path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).unwrap();
    }
    fs::write(path, content).unwrap();
}

fn write_task_file(dir: &Path, filename: &str, content: &str) {
    fs::write(dir.join(".untask/tasks").join(filename), content).unwrap();
}

fn configure_docs(dir: &Path, patterns: &[&str]) {
    let docs = patterns
        .iter()
        .map(|pattern| format!("  - \"{pattern}\""))
        .collect::<Vec<_>>()
        .join("\n");
    fs::write(dir.join(".untask/config.yml"), format!("docs:\n{docs}\n")).unwrap();
}

fn git(dir: &Path, args: &[&str]) {
    let output = Command::new("git")
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
    git(dir, &["config", "user.email", "test@example.com"]);
    git(dir, &["config", "user.name", "Test User"]);
}

fn prepend_path(dir: &Path) -> String {
    let existing = env::var("PATH").unwrap_or_default();
    format!("{}:{existing}", dir.display())
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

#[test]
fn bare_command_prints_help_and_guidance_inside_project() {
    let tmp = TempDir::new().unwrap();
    init_project(tmp.path());

    let (stdout, stderr, ok) = run_in(tmp.path(), &[]);
    assert!(!ok);
    assert!(stderr.is_empty());
    assert!(stdout.contains("Local-first project companion"));
    assert!(stdout.contains("Use a CLI subcommand or `untask open` to launch the desktop app."));
}

#[test]
fn bare_command_prints_help_and_guidance_outside_project() {
    let tmp = TempDir::new().unwrap();

    let (stdout, stderr, ok) = run_in(tmp.path(), &[]);
    assert!(!ok);
    assert!(stderr.is_empty());
    assert!(stdout.contains("Local-first project companion"));
    assert!(stdout.contains("Use a CLI subcommand or `untask open` to launch the desktop app."));
}

#[test]
fn bare_command_json_returns_error_without_help_text() {
    let tmp = TempDir::new().unwrap();
    init_project(tmp.path());

    let (stdout, stderr, ok) = run_in(tmp.path(), &["--json"]);
    assert!(!ok);
    assert!(stdout.is_empty());

    let parsed: serde_json::Value = serde_json::from_str(&stderr).unwrap();
    assert_eq!(
        parsed["error"],
        "Use a CLI subcommand or `untask open` to launch the desktop app."
    );
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

// ── Docs / Search / Next / Repair / Skill / Open ───────────────────

#[test]
fn docs_list_shows_all_discovered_docs() {
    let tmp = TempDir::new().unwrap();
    init_project(tmp.path());
    configure_docs(tmp.path(), &[".untask/docs/**/*.md", "docs/**/*.md"]);
    write_doc(tmp.path(), ".untask/docs/guide.md", "# Guide\n");
    write_doc(tmp.path(), "docs/plan.md", "# Plan\n");

    let (stdout, _, ok) = run_in(tmp.path(), &["docs"]);
    assert!(ok);
    assert!(stdout.contains(".untask/docs/guide.md"));
    assert!(stdout.contains("docs/plan.md"));

    let (stdout, _, ok) = run_in(tmp.path(), &["--json", "docs"]);
    assert!(ok);
    let parsed: Vec<serde_json::Value> = serde_json::from_str(&stdout).unwrap();
    assert_eq!(parsed.len(), 2);
}

#[test]
fn docs_show_displays_doc_content() {
    let tmp = TempDir::new().unwrap();
    init_project(tmp.path());
    write_doc(tmp.path(), ".untask/docs/guide.md", "# Guide\nRead me.\n");

    let (stdout, _, ok) = run_in(tmp.path(), &["docs", "show", "guide.md"]);
    assert!(ok);
    assert!(stdout.contains("# Guide"));
    assert!(stdout.contains("Read me."));

    let (stdout, _, ok) = run_in(tmp.path(), &["--json", "docs", "show", "guide.md"]);
    assert!(ok);
    let parsed: serde_json::Value = serde_json::from_str(&stdout).unwrap();
    assert_eq!(parsed["name"], "guide.md");
    assert!(parsed["content"].as_str().unwrap().contains("Read me."));
}

#[test]
fn docs_show_with_ambiguous_name_returns_helpful_error() {
    let tmp = TempDir::new().unwrap();
    init_project(tmp.path());
    configure_docs(tmp.path(), &[".untask/docs/**/*.md", "docs/**/*.md"]);
    write_doc(tmp.path(), ".untask/docs/notes.md", "root notes");
    write_doc(tmp.path(), "docs/notes.md", "project notes");

    let (_, stderr, ok) = run_in(tmp.path(), &["docs", "show", "notes.md"]);
    assert!(!ok);
    assert!(stderr.contains("Ambiguous reference 'notes.md'"));
    assert!(stderr.contains(".untask/docs/notes.md"));
    assert!(stderr.contains("docs/notes.md"));
}

#[test]
fn search_returns_matches_and_json_output() {
    let tmp = TempDir::new().unwrap();
    init_project(tmp.path());
    run_in(tmp.path(), &["add", "Deploy backend"]);
    write_doc(
        tmp.path(),
        ".untask/docs/deploy.md",
        "Production deploy checklist.\n",
    );

    let (stdout, _, ok) = run_in(tmp.path(), &["search", "deploy"]);
    assert!(ok);
    assert!(stdout.contains("[task] Deploy backend"));
    assert!(stdout.contains("[doc] deploy.md"));

    let (stdout, _, ok) = run_in(tmp.path(), &["search", "deploy", "--tasks-only"]);
    assert!(ok);
    assert!(stdout.contains("[task] Deploy backend"));
    assert!(!stdout.contains("[doc] deploy.md"));

    let (stdout, _, ok) = run_in(tmp.path(), &["--json", "search", "deploy"]);
    assert!(ok);
    let parsed: Vec<serde_json::Value> = serde_json::from_str(&stdout).unwrap();
    assert_eq!(parsed.len(), 2);
    assert!(parsed.iter().any(|entry| entry["kind"] == "task"));
    assert!(parsed.iter().any(|entry| entry["kind"] == "doc"));
}

#[test]
fn next_outputs_formatted_sections_and_json() {
    let tmp = TempDir::new().unwrap();
    init_project(tmp.path());
    init_git_repo(tmp.path());
    fs::write(tmp.path().join("README.md"), "hello\n").unwrap();
    git(tmp.path(), &["add", "."]);
    git(tmp.path(), &["commit", "-m", "initial commit"]);

    run_in(tmp.path(), &["add", "Urgent task"]);
    run_in(tmp.path(), &["add", "Done task", "--status", "done"]);
    insert_frontmatter_lines(
        &find_task_file(tmp.path(), "urgent-task"),
        &["priority: urgent"],
    );
    write_task_file(
        tmp.path(),
        "loose-note.md",
        "---\ntitle: Loose note\nstatus: todo\n---\n",
    );

    let (stdout, _, ok) = run_in(tmp.path(), &["next"]);
    assert!(ok);
    assert!(stdout.contains("## Git"));
    assert!(stdout.contains("## Open Tasks"));
    assert!(stdout.contains("## Recently Completed"));
    assert!(stdout.contains("## Cleanup"));
    assert!(stdout.contains("Urgent task"));
    assert!(stdout.contains("Done task"));

    let (stdout, _, ok) = run_in(tmp.path(), &["--json", "next"]);
    assert!(ok);
    let parsed: serde_json::Value = serde_json::from_str(&stdout).unwrap();
    assert_eq!(parsed["open_tasks"][0]["title"], "Urgent task");
    assert_eq!(parsed["recently_completed"][0]["title"], "Done task");
    assert_eq!(parsed["cleanup_hints"][0]["kind"], "Unindexed");
    assert!(
        parsed["cleanup_hints"][0]["path"]
            .as_str()
            .unwrap()
            .contains("loose-note.md")
    );
    assert_eq!(
        parsed["git"]["recent_commits"][0]["message"],
        "initial commit"
    );
    assert!(parsed["git"]["recent_commits"][0]["timestamp"].is_string());
}

#[test]
fn repair_check_reports_issues_without_modifying_files() {
    let tmp = TempDir::new().unwrap();
    init_project(tmp.path());
    write_task_file(
        tmp.path(),
        "loose-note.md",
        "---\ntitle: Loose note\nstatus: yolo\n---\nBody\n",
    );

    let before = fs::read_to_string(tmp.path().join(".untask/tasks/loose-note.md")).unwrap();
    let (stdout, _, ok) = run_in(tmp.path(), &["repair", "--check"]);
    assert!(ok);
    assert!(stdout.contains("Unindexed tasks:"));
    assert!(stdout.contains("Unknown statuses:"));
    assert!(stdout.contains("Run 'untask repair --write' to fix these issues."));

    let after = fs::read_to_string(tmp.path().join(".untask/tasks/loose-note.md")).unwrap();
    assert_eq!(before, after);
}

#[test]
fn repair_write_fixes_issues_and_json_output() {
    let tmp = TempDir::new().unwrap();
    init_project(tmp.path());
    write_task_file(
        tmp.path(),
        "loose-note.md",
        "---\ntitle: Loose note\nstatus: yolo\n---\n",
    );

    let (stdout, _, ok) = run_in(tmp.path(), &["repair", "--write"]);
    assert!(ok);
    assert!(stdout.contains("Actions taken:"));
    assert!(tmp.path().join(".untask/tasks/001-loose-note.md").exists());

    let (stdout, _, ok) = run_in(tmp.path(), &["--json", "repair", "--check"]);
    assert!(ok);
    let parsed: serde_json::Value = serde_json::from_str(&stdout).unwrap();
    assert_eq!(parsed["unindexed_tasks"].as_array().unwrap().len(), 0);
    assert_eq!(parsed["unknown_statuses"].as_array().unwrap().len(), 0);
}

#[test]
fn skill_install_prints_fallback_instructions_when_path_not_found() {
    let tmp = TempDir::new().unwrap();
    let home = TempDir::new().unwrap();
    init_project(tmp.path());

    let home_env = home.path().to_str().unwrap();
    let (stdout, _, ok) = run_in_with(
        tmp.path(),
        &["skill", "install"],
        None,
        &[("HOME", home_env)],
    );
    assert!(ok);
    assert!(stdout.contains("No supported agent config directory found."));
    assert!(stdout.contains("mkdir -p ~/.claude/commands"));
}

#[test]
fn skill_install_copies_bundled_skill_when_supported_path_exists() {
    let tmp = TempDir::new().unwrap();
    let home = TempDir::new().unwrap();
    init_project(tmp.path());
    fs::create_dir_all(home.path().join(".claude")).unwrap();

    let home_env = home.path().to_str().unwrap();
    let (stdout, _, ok) = run_in_with(
        tmp.path(),
        &["skill", "install"],
        None,
        &[("HOME", home_env)],
    );
    assert!(ok);
    assert!(stdout.contains("Installed skill"));

    let installed = home.path().join(".claude/commands/untask.md");
    assert!(installed.exists());
    let content = fs::read_to_string(installed).unwrap();
    assert!(content.contains("untask next --json"));
    assert!(content.contains("status <id> in-progress"));
    assert!(content.contains("docs/plans/"));
}

#[test]
fn open_fails_gracefully_when_app_is_unavailable() {
    let tmp = TempDir::new().unwrap();
    init_project(tmp.path());

    let mock_bin = tmp.path().join("mock-bin");
    fs::create_dir_all(&mock_bin).unwrap();
    fs::write(mock_bin.join("open"), "#!/bin/sh\nexit 1\n").unwrap();
    Command::new("chmod")
        .args(["+x", mock_bin.join("open").to_str().unwrap()])
        .status()
        .unwrap();

    let path_env = prepend_path(&mock_bin);
    let (_, stderr, ok) = run_in_with(tmp.path(), &["open"], None, &[("PATH", &path_env)]);
    assert!(!ok);
    assert!(stderr.contains("Could not open the Untask desktop app"));
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
