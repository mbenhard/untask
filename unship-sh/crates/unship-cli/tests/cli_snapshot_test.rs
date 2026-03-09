use std::{
    env, fs,
    path::Path,
    process::{Command, Stdio},
};

use tempfile::TempDir;

fn unship() -> Command {
    Command::new(env!("CARGO_BIN_EXE_unship"))
}

fn run_json(dir: &Path, args: &[&str]) -> serde_json::Value {
    let mut full_args = vec!["--json"];
    full_args.extend(args);
    let output = unship()
        .args(&full_args)
        .current_dir(dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "command failed: unship {}\nstderr: {}",
        full_args.join(" "),
        String::from_utf8_lossy(&output.stderr)
    );
    serde_json::from_slice(&output.stdout).unwrap()
}

fn run_plain(dir: &Path, args: &[&str]) -> String {
    let output = unship()
        .args(args)
        .env("NO_COLOR", "1")
        .current_dir(dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "command failed: unship {}\nstderr: {}",
        args.join(" "),
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8(output.stdout).unwrap()
}

fn init_project(dir: &Path) {
    let output = unship().arg("init").current_dir(dir).output().unwrap();
    assert!(output.status.success(), "init failed");
}

fn add_task(dir: &Path, title: &str) {
    let output = unship()
        .args(["add", title])
        .current_dir(dir)
        .output()
        .unwrap();
    assert!(output.status.success(), "add failed");
}

fn add_task_with_status(dir: &Path, title: &str, status: &str) {
    let output = unship()
        .args(["add", title, "--status", status])
        .current_dir(dir)
        .output()
        .unwrap();
    assert!(output.status.success(), "add with status failed");
}

fn insert_frontmatter_lines(path: &Path, lines: &[&str]) {
    let content = fs::read_to_string(path).unwrap();
    let injected = content.replacen("\n---\n", &format!("\n{}\n---\n", lines.join("\n")), 1);
    fs::write(path, injected).unwrap();
}

fn find_task_file(dir: &Path, slug_fragment: &str) -> std::path::PathBuf {
    fs::read_dir(dir.join(".unship/tasks"))
        .unwrap()
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .find(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| n.contains(slug_fragment))
        })
        .unwrap()
}

fn write_task_file(dir: &Path, filename: &str, content: &str) {
    fs::write(dir.join(".unship/tasks").join(filename), content).unwrap();
}

fn write_doc(dir: &Path, rel_path: &str, content: &str) {
    let path = dir.join(rel_path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).unwrap();
    }
    fs::write(path, content).unwrap();
}

fn git(dir: &Path, args: &[&str]) {
    let output = Command::new("git")
        .args(args)
        .current_dir(dir)
        .output()
        .unwrap();
    assert!(output.status.success());
}

fn setup_project_with_tasks(dir: &Path) {
    init_project(dir);
    add_task(dir, "Implement auth");
    add_task_with_status(dir, "Write tests", "in-progress");
    add_task_with_status(dir, "Deploy app", "done");

    insert_frontmatter_lines(
        &find_task_file(dir, "implement-auth"),
        &["tags:", "  - backend", "  - security"],
    );

    // Add body with subtasks to task 1
    let task_path = find_task_file(dir, "implement-auth");
    let mut content = fs::read_to_string(&task_path).unwrap();
    content.push_str("- [x] Design schema\n- [ ] Add endpoints\n- [ ] Add middleware\n");
    fs::write(&task_path, content).unwrap();
}

// ── JSON Snapshot Tests ─────────────────────────────────────────────

#[test]
fn snapshot_list_json() {
    let tmp = TempDir::new().unwrap();
    setup_project_with_tasks(tmp.path());

    let value = run_json(tmp.path(), &["list"]);
    let arr = value.as_array().unwrap();

    // Redact dynamic fields
    let redacted: Vec<serde_json::Value> =
        arr.iter().map(|task| redact_task(task.clone())).collect();

    insta::assert_json_snapshot!("list_json", redacted);
}

#[test]
fn snapshot_show_json() {
    let tmp = TempDir::new().unwrap();
    setup_project_with_tasks(tmp.path());

    let value = run_json(tmp.path(), &["show", "1"]);
    let redacted = redact_task(value);
    insta::assert_json_snapshot!("show_json", redacted);
}

#[test]
fn snapshot_search_json() {
    let tmp = TempDir::new().unwrap();
    setup_project_with_tasks(tmp.path());
    write_doc(
        tmp.path(),
        ".unship/docs/deploy.md",
        "# Deploy\nDeploy the app to production.\n",
    );

    let value = run_json(tmp.path(), &["search", "deploy"]);
    let arr = value.as_array().unwrap();
    let redacted: Vec<serde_json::Value> = arr
        .iter()
        .map(|entry| {
            let mut e = entry.clone();
            if let Some(obj) = e.as_object_mut() {
                obj.insert("path".into(), serde_json::json!("[path]"));
            }
            e
        })
        .collect();

    insta::assert_json_snapshot!("search_json", redacted);
}

#[test]
fn snapshot_repair_json() {
    let tmp = TempDir::new().unwrap();
    init_project(tmp.path());
    write_task_file(
        tmp.path(),
        "loose-note.md",
        "---\ntitle: Loose note\nstatus: yolo\n---\nBody\n",
    );

    let value = run_json(tmp.path(), &["repair", "--check"]);
    let redacted = redact_repair(value);
    insta::assert_json_snapshot!("repair_json", redacted);
}

#[test]
fn snapshot_next_json() {
    let tmp = TempDir::new().unwrap();
    init_project(tmp.path());

    // Setup git repo
    git(tmp.path(), &["init"]);
    git(tmp.path(), &["config", "user.email", "test@example.com"]);
    git(tmp.path(), &["config", "user.name", "Test User"]);
    fs::write(tmp.path().join("README.md"), "hello\n").unwrap();
    git(tmp.path(), &["add", "."]);
    git(tmp.path(), &["commit", "-m", "initial commit"]);

    add_task(tmp.path(), "Open task");
    add_task_with_status(tmp.path(), "Completed task", "done");
    write_task_file(
        tmp.path(),
        "loose-note.md",
        "---\ntitle: Loose note\nstatus: todo\n---\n",
    );

    let value = run_json(tmp.path(), &["next"]);
    let redacted = redact_next(value);
    insta::assert_json_snapshot!("next_json", redacted);
}

// ── NO_COLOR / --no-color Tests ─────────────────────────────────────

#[test]
fn no_color_env_produces_no_ansi_codes() {
    let tmp = TempDir::new().unwrap();
    setup_project_with_tasks(tmp.path());

    let stdout = run_plain(tmp.path(), &["list"]);
    assert!(
        !stdout.contains("\x1b["),
        "output contains ANSI escape codes"
    );
    assert!(stdout.contains("Implement auth"));
}

#[test]
fn no_color_flag_produces_no_ansi_codes() {
    let tmp = TempDir::new().unwrap();
    setup_project_with_tasks(tmp.path());

    let output = unship()
        .args(["--no-color", "list"])
        .current_dir(tmp.path())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .unwrap();
    assert!(output.status.success());
    let stdout = String::from_utf8(output.stdout).unwrap();
    assert!(
        !stdout.contains("\x1b["),
        "output contains ANSI escape codes"
    );
}

#[test]
fn piped_output_produces_no_ansi_codes() {
    let tmp = TempDir::new().unwrap();
    setup_project_with_tasks(tmp.path());

    // Running via Stdio::piped() already means stdout is not a TTY
    let output = unship()
        .args(["list"])
        .current_dir(tmp.path())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .unwrap();
    assert!(output.status.success());
    let stdout = String::from_utf8(output.stdout).unwrap();
    assert!(
        !stdout.contains("\x1b["),
        "piped output should not contain ANSI escape codes"
    );
}

// ── Redaction helpers ───────────────────────────────────────────────

fn redact_task(mut v: serde_json::Value) -> serde_json::Value {
    if let Some(obj) = v.as_object_mut() {
        for key in ["created", "updated", "completed"] {
            if obj.get(key).is_some_and(|v| !v.is_null()) {
                obj.insert(key.into(), serde_json::json!("[timestamp]"));
            }
        }
        if obj.contains_key("file_path") {
            obj.insert("file_path".into(), serde_json::json!("[path]"));
        }
    }
    v
}

fn redact_repair(mut v: serde_json::Value) -> serde_json::Value {
    if let Some(obj) = v.as_object_mut() {
        for key in [
            "unindexed_tasks",
            "mismatched_ids",
            "unknown_statuses",
            "noncanonical_statuses",
        ] {
            if let Some(arr) = obj.get_mut(key).and_then(|v| v.as_array_mut()) {
                for item in arr.iter_mut() {
                    if let Some(inner) = item.as_object_mut()
                        && inner.contains_key("path")
                    {
                        inner.insert("path".into(), serde_json::json!("[path]"));
                    }
                }
            }
        }
    }
    v
}

fn redact_next(mut v: serde_json::Value) -> serde_json::Value {
    if let Some(obj) = v.as_object_mut() {
        // Redact git info
        if let Some(git) = obj.get_mut("git").and_then(|v| v.as_object_mut())
            && let Some(commits) = git.get_mut("recent_commits").and_then(|v| v.as_array_mut())
        {
            for commit in commits.iter_mut() {
                if let Some(c) = commit.as_object_mut() {
                    c.insert("hash".into(), serde_json::json!("[hash]"));
                    c.insert("timestamp".into(), serde_json::json!("[timestamp]"));
                }
            }
        }
        // Redact task timestamps
        for key in ["open_tasks", "recently_completed"] {
            if let Some(arr) = obj.get_mut(key).and_then(|v| v.as_array_mut()) {
                for task in arr.iter_mut() {
                    let _ = redact_task(task.clone());
                    if let Some(t) = task.as_object_mut() {
                        for field in ["created", "updated", "completed"] {
                            if t.get(field).is_some_and(|v| !v.is_null()) {
                                t.insert(field.into(), serde_json::json!("[timestamp]"));
                            }
                        }
                        if t.contains_key("file_path") {
                            t.insert("file_path".into(), serde_json::json!("[path]"));
                        }
                    }
                }
            }
        }
        // Redact cleanup hint paths
        if let Some(arr) = obj.get_mut("cleanup_hints").and_then(|v| v.as_array_mut()) {
            for hint in arr.iter_mut() {
                if let Some(h) = hint.as_object_mut() {
                    if h.contains_key("path") {
                        h.insert("path".into(), serde_json::json!("[path]"));
                    }
                    if let Some(msg) = h.get("message").and_then(|v| v.as_str()) {
                        // Redact absolute paths in messages
                        if msg.contains('/') {
                            let redacted = msg
                                .split('/')
                                .next_back()
                                .map(|f| format!("[...]{f}"))
                                .unwrap_or_else(|| "[path]".into());
                            h.insert("message".into(), serde_json::json!(redacted));
                        }
                    }
                }
            }
        }
    }
    v
}
