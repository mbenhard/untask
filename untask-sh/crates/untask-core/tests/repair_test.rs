use std::path::Path;

use untask_core::init::init;
use untask_core::repair::{check, repair};
use untask_core::store::TaskStore;

fn setup() -> (tempfile::TempDir, TaskStore) {
    let tmp = tempfile::TempDir::new().unwrap();
    init(tmp.path()).unwrap();
    let store = TaskStore::new(tmp.path().to_path_buf()).unwrap();
    (tmp, store)
}

fn write_task(dir: &Path, filename: &str, content: &str) {
    let tasks_dir = dir.join(".untask/tasks");
    std::fs::write(tasks_dir.join(filename), content).unwrap();
}

// ── 1. Check detects unindexed file without frontmatter ID ──────

#[test]
fn check_detects_unindexed_without_frontmatter_id() {
    let (tmp, _store) = setup();
    write_task(
        tmp.path(),
        "loose-note.md",
        "---\ntitle: Loose note\nstatus: todo\n---\nSome body\n",
    );

    let report = check(tmp.path()).unwrap();
    assert_eq!(report.unindexed_tasks.len(), 1);
    assert_eq!(report.unindexed_tasks[0].title, "Loose note");
    assert!(!report.unindexed_tasks[0].has_frontmatter_id);
}

// ── 2. Check detects unindexed file with frontmatter ID ─────────

#[test]
fn check_detects_unindexed_with_frontmatter_id() {
    let (tmp, _store) = setup();
    write_task(
        tmp.path(),
        "legacy-task.md",
        "---\nid: 42\ntitle: Legacy task\nstatus: todo\n---\n",
    );

    let report = check(tmp.path()).unwrap();
    assert_eq!(report.unindexed_tasks.len(), 1);
    assert_eq!(report.unindexed_tasks[0].title, "Legacy task");
    assert!(report.unindexed_tasks[0].has_frontmatter_id);
}

// ── 3. Check detects mismatched filename/frontmatter IDs ────────

#[test]
fn check_detects_mismatched_ids() {
    let (tmp, _store) = setup();
    write_task(
        tmp.path(),
        "001-some-task.md",
        "---\nid: 5\ntitle: Some task\nstatus: todo\n---\n",
    );

    let report = check(tmp.path()).unwrap();
    assert_eq!(report.mismatched_ids.len(), 1);
    assert_eq!(report.mismatched_ids[0].filename_id, 1);
    assert_eq!(report.mismatched_ids[0].frontmatter_id, 5);
}

// ── 4. Check detects unknown statuses ───────────────────────────

#[test]
fn check_detects_unknown_statuses() {
    let (tmp, _store) = setup();
    write_task(
        tmp.path(),
        "001-task.md",
        "---\nid: 1\ntitle: Mystery status\nstatus: yolo\n---\n",
    );

    let report = check(tmp.path()).unwrap();
    assert_eq!(report.unknown_statuses.len(), 1);
    assert_eq!(report.unknown_statuses[0].status, "yolo");
    assert_eq!(report.unknown_statuses[0].title, "Mystery status");
}

#[test]
fn check_detects_status_aliases_that_need_canonicalization() {
    let (tmp, _store) = setup();
    write_task(
        tmp.path(),
        "001-task.md",
        "---\nid: 1\ntitle: Alias status\nstatus: to-do\n---\n",
    );

    let report = check(tmp.path()).unwrap();
    assert_eq!(report.noncanonical_statuses.len(), 1);
    assert_eq!(report.noncanonical_statuses[0].status, "to-do");
    assert_eq!(report.noncanonical_statuses[0].canonical_status, "todo");
    assert_eq!(report.noncanonical_statuses[0].title, "Alias status");
}

// ── 5. Repair assigns IDs to unindexed tasks ────────────────────

#[test]
fn repair_assigns_ids_to_unindexed_tasks() {
    let (tmp, store) = setup();
    // Create a managed task first (takes ID 1)
    store.add("Existing task", None).unwrap();

    write_task(
        tmp.path(),
        "loose-note.md",
        "---\ntitle: Loose note\nstatus: todo\n---\n",
    );

    let report = repair(tmp.path()).unwrap();
    assert_eq!(report.unindexed_tasks.len(), 1);
    assert!(!report.actions_taken.is_empty());

    // The unindexed task should now be reachable by ID 2
    let store = TaskStore::new(tmp.path().to_path_buf()).unwrap();
    let task = store.get(2).unwrap();
    assert_eq!(task.title, "Loose note");
    assert_eq!(task.id, Some(2));
}

// ── 6. Repair renames files correctly ───────────────────────────

#[test]
fn repair_renames_files_correctly() {
    let (tmp, _store) = setup();
    write_task(
        tmp.path(),
        "my-random-file.md",
        "---\ntitle: Fix login bug\nstatus: todo\n---\n",
    );

    repair(tmp.path()).unwrap();

    let tasks_dir = tmp.path().join(".untask/tasks");
    // Old file should be gone
    assert!(!tasks_dir.join("my-random-file.md").exists());
    // New file should exist with correct format
    assert!(tasks_dir.join("001-fix-login-bug.md").exists());
}

// ── 7. Repair normalizes statuses ───────────────────────────────

#[test]
fn repair_normalizes_unknown_statuses() {
    let (tmp, _store) = setup();
    write_task(
        tmp.path(),
        "001-task.md",
        "---\nid: 1\ntitle: Bad status\nstatus: yolo\n---\n",
    );

    let report = repair(tmp.path()).unwrap();
    assert_eq!(report.unknown_statuses.len(), 1);
    assert!(!report.actions_taken.is_empty());

    // Status should be normalized to default (backlog)
    let store = TaskStore::new(tmp.path().to_path_buf()).unwrap();
    let task = store.get(1).unwrap();
    assert_eq!(task.status, "backlog");
}

#[test]
fn repair_normalizes_status_aliases_to_canonical_ids() {
    let (tmp, _store) = setup();
    write_task(
        tmp.path(),
        "001-task.md",
        "---\nid: 1\ntitle: Alias status\nstatus: to-do\n---\n",
    );

    let report = repair(tmp.path()).unwrap();
    assert_eq!(report.noncanonical_statuses.len(), 1);
    assert!(!report.actions_taken.is_empty());

    let task = TaskStore::new(tmp.path().to_path_buf())
        .unwrap()
        .get(1)
        .unwrap();
    assert_eq!(task.status, "todo");
}

// ── 8. Repair aligns frontmatter ID with filename ───────────────

#[test]
fn repair_aligns_frontmatter_id_with_filename() {
    let (tmp, _store) = setup();
    write_task(
        tmp.path(),
        "003-some-task.md",
        "---\nid: 99\ntitle: Some task\nstatus: todo\n---\n",
    );

    let report = repair(tmp.path()).unwrap();
    assert_eq!(report.mismatched_ids.len(), 1);
    assert!(!report.actions_taken.is_empty());

    // Frontmatter ID should now match filename ID
    let store = TaskStore::new(tmp.path().to_path_buf()).unwrap();
    let task = store.get(3).unwrap();
    assert_eq!(task.id, Some(3));
    assert_eq!(task.title, "Some task");
}

// ── 9. Check doesn't modify any files ───────────────────────────

#[test]
fn check_does_not_modify_files() {
    let (tmp, _store) = setup();
    write_task(
        tmp.path(),
        "loose-note.md",
        "---\ntitle: Loose note\nstatus: yolo\n---\nBody\n",
    );
    write_task(
        tmp.path(),
        "001-mismatch.md",
        "---\nid: 9\ntitle: Mismatch\nstatus: todo\n---\n",
    );

    let tasks_dir = tmp.path().join(".untask/tasks");

    // Snapshot file state before check
    let loose_before = std::fs::read_to_string(tasks_dir.join("loose-note.md")).unwrap();
    let mismatch_before = std::fs::read_to_string(tasks_dir.join("001-mismatch.md")).unwrap();
    let file_count_before = std::fs::read_dir(&tasks_dir).unwrap().count();

    let report = check(tmp.path()).unwrap();
    assert!(!report.is_clean()); // should detect issues

    // Files should be unchanged
    let loose_after = std::fs::read_to_string(tasks_dir.join("loose-note.md")).unwrap();
    let mismatch_after = std::fs::read_to_string(tasks_dir.join("001-mismatch.md")).unwrap();
    let file_count_after = std::fs::read_dir(&tasks_dir).unwrap().count();

    assert_eq!(loose_before, loose_after);
    assert_eq!(mismatch_before, mismatch_after);
    assert_eq!(file_count_before, file_count_after);
}

// ── 10. Repair handles duplicate slugs by disambiguating ────────

#[test]
fn repair_disambiguates_duplicate_slugs() {
    let (tmp, _store) = setup();
    // Two unindexed files with the same title → same slug
    write_task(
        tmp.path(),
        "aaa-first.md",
        "---\ntitle: Fix bug\nstatus: todo\n---\n",
    );
    write_task(
        tmp.path(),
        "zzz-second.md",
        "---\ntitle: Fix bug\nstatus: todo\n---\n",
    );

    repair(tmp.path()).unwrap();

    let tasks_dir = tmp.path().join(".untask/tasks");
    let mut files: Vec<String> = std::fs::read_dir(&tasks_dir)
        .unwrap()
        .filter_map(|e| {
            e.ok()
                .and_then(|e| e.file_name().to_str().map(String::from))
        })
        .collect();
    files.sort();

    // Both files should exist with different names
    assert_eq!(files.len(), 2);
    // First gets the clean slug, second gets disambiguated
    assert!(
        files[0] != files[1],
        "files should have different names: {files:?}"
    );
    // Both should have numeric prefixes now
    assert!(
        files
            .iter()
            .all(|f| f.chars().next().unwrap().is_ascii_digit()),
        "all files should have numeric prefixes: {files:?}"
    );
}
