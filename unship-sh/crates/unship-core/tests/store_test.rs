use std::sync::{Arc, Barrier};

use unship_core::init::init;
use unship_core::store::{ListFilter, TaskStore, TaskUpdate};

fn setup() -> (tempfile::TempDir, TaskStore) {
    let tmp = tempfile::TempDir::new().unwrap();
    init(tmp.path(), None).unwrap();
    let store = TaskStore::new(tmp.path().to_path_buf()).unwrap();
    (tmp, store)
}

// ── Add ────────────────────────────────────────────────────────────

#[test]
fn add_creates_file_with_correct_format() {
    let (tmp, store) = setup();
    let task = store.add("Fix login bug", None, None).unwrap();

    assert_eq!(task.id, Some(1));
    assert_eq!(task.title, "Fix login bug");
    assert_eq!(task.status, "backlog"); // default column

    let path = task.file_path.unwrap();
    assert!(path.exists());
    assert_eq!(
        path.file_name().unwrap().to_str().unwrap(),
        "001-fix-login-bug.md"
    );
    // Verify it's inside .unship/tasks/
    assert!(path.starts_with(tmp.path().join(".unship/tasks")));
}

#[test]
fn add_with_status() {
    let (_tmp, store) = setup();
    let task = store
        .add("Deploy service", Some("in-progress"), None)
        .unwrap();
    assert_eq!(task.status, "in-progress");
}

#[test]
fn add_normalizes_status_alias() {
    let (_tmp, store) = setup();
    let task = store.add("WIP task", Some("doing"), None).unwrap();
    assert_eq!(task.status, "in-progress");
}

#[test]
fn add_rejects_unknown_status() {
    let (_tmp, store) = setup();
    let err = store
        .add("Mystery task", Some("mystery"), None)
        .unwrap_err();
    assert!(matches!(
        err,
        unship_core::error::UnshipError::InvalidConfig(message)
            if message.contains("unknown status: mystery")
    ));
}

#[test]
fn add_increments_ids() {
    let (_tmp, store) = setup();
    let t1 = store.add("First", None, None).unwrap();
    let t2 = store.add("Second", None, None).unwrap();
    let t3 = store.add("Third", None, None).unwrap();
    assert_eq!(t1.id, Some(1));
    assert_eq!(t2.id, Some(2));
    assert_eq!(t3.id, Some(3));
}

#[test]
fn add_is_gap_tolerant() {
    let (_tmp, store) = setup();
    let t1 = store.add("First", None, None).unwrap();
    let t2 = store.add("Second", None, None).unwrap();
    assert_eq!(t1.id, Some(1));
    assert_eq!(t2.id, Some(2));

    // Delete task 1, next ID should be 3 (not 1)
    store.delete(1).unwrap();
    let t3 = store.add("Third", None, None).unwrap();
    assert_eq!(t3.id, Some(3));
}

#[test]
fn add_uses_frontmatter_ids_when_allocating_next_id() {
    let (tmp, store) = setup();
    let legacy_path = tmp.path().join(".unship/tasks/legacy-task.md");
    std::fs::write(
        &legacy_path,
        "---\nid: 7\ntitle: Legacy task\nstatus: todo\n---\n",
    )
    .unwrap();

    let task = store.add("Fresh task", None, None).unwrap();

    assert_eq!(task.id, Some(8));
    assert_eq!(
        task.file_path
            .as_ref()
            .and_then(|path| path.file_name())
            .and_then(|name| name.to_str()),
        Some("008-fresh-task.md")
    );
}

#[test]
fn add_done_sets_completed() {
    let (_tmp, store) = setup();
    let task = store.add("Ship it", Some("done"), None).unwrap();

    assert_eq!(task.status, "done");
    assert!(task.completed.is_some());
}

#[test]
fn add_assigns_position_within_status_column() {
    let (_tmp, store) = setup();
    let backlog_one = store.add("Backlog one", None, None).unwrap();
    let in_progress = store.add("Doing", Some("in-progress"), None).unwrap();
    let backlog_two = store.add("Backlog two", None, None).unwrap();

    assert_eq!(backlog_one.position, Some(1.0));
    assert_eq!(in_progress.position, Some(1.0));
    assert_eq!(backlog_two.position, Some(2.0));
}

// ── List ───────────────────────────────────────────────────────────

#[test]
fn list_returns_all_tasks() {
    let (_tmp, store) = setup();
    store.add("A", None, None).unwrap();
    store.add("B", None, None).unwrap();
    let tasks = store.list(None).unwrap();
    assert_eq!(tasks.len(), 2);
}

#[test]
fn list_does_not_modify_files() {
    let (_tmp, store) = setup();
    store.add("Check me", None, None).unwrap();

    // Create an unindexed file (no ID prefix in filename)
    let unindexed_path = _tmp.path().join(".unship/tasks/random-note.md");
    std::fs::write(
        &unindexed_path,
        "---\ntitle: Random\nstatus: todo\n---\nBody here\n",
    )
    .unwrap();

    let original_name = unindexed_path
        .file_name()
        .unwrap()
        .to_str()
        .unwrap()
        .to_string();

    // List tasks
    let tasks = store.list(None).unwrap();
    assert_eq!(tasks.len(), 2);

    // Verify unindexed file was NOT renamed
    assert!(
        unindexed_path.exists(),
        "unindexed file should not be renamed by list"
    );
    assert_eq!(
        unindexed_path.file_name().unwrap().to_str().unwrap(),
        original_name
    );
}

#[test]
fn list_orders_managed_tasks_before_unindexed_files() {
    let (tmp, store) = setup();
    store.add("Managed task", None, None).unwrap();
    std::fs::write(
        tmp.path().join(".unship/tasks/notes.md"),
        "---\ntitle: Loose note\nstatus: todo\n---\n",
    )
    .unwrap();

    let tasks = store.list(None).unwrap();
    let titles: Vec<_> = tasks.iter().map(|task| task.title.as_str()).collect();

    assert_eq!(titles, vec!["Managed task", "Loose note"]);
}

#[test]
fn list_filters_by_status() {
    let (_tmp, store) = setup();
    store.add("Backlog task", None, None).unwrap();
    store
        .add("In-progress task", Some("in-progress"), None)
        .unwrap();

    let tasks = store
        .list(Some(ListFilter {
            status: Some("in-progress".to_string()),
            tag: None,
        }))
        .unwrap();
    assert_eq!(tasks.len(), 1);
    assert_eq!(tasks[0].title, "In-progress task");
}

#[test]
fn list_filters_by_tag() {
    let (_tmp, store) = setup();
    let t1 = store.add("Tagged", None, None).unwrap();
    store.add("Untagged", None, None).unwrap();

    store
        .update(
            t1.id.unwrap(),
            TaskUpdate {
                tags: Some(vec!["urgent".to_string()]),
                ..Default::default()
            },
        )
        .unwrap();

    let tasks = store
        .list(Some(ListFilter {
            status: None,
            tag: Some("urgent".to_string()),
        }))
        .unwrap();
    assert_eq!(tasks.len(), 1);
    assert_eq!(tasks[0].title, "Tagged");
}

// ── Get ────────────────────────────────────────────────────────────

#[test]
fn get_by_id() {
    let (_tmp, store) = setup();
    store.add("Find me", None, None).unwrap();
    let task = store.get(1).unwrap();
    assert_eq!(task.title, "Find me");
}

#[test]
fn get_by_id_reads_legacy_frontmatter_ids() {
    let (tmp, store) = setup();
    let legacy_path = tmp.path().join(".unship/tasks/legacy-task.md");
    std::fs::write(
        &legacy_path,
        "---\nid: 42\ntitle: Legacy task\nstatus: backlog\n---\n",
    )
    .unwrap();

    let task = store.get(42).unwrap();

    assert_eq!(task.title, "Legacy task");
    assert_eq!(task.file_path.as_deref(), Some(legacy_path.as_path()));
}

#[test]
fn get_by_ref_numeric() {
    let (_tmp, store) = setup();
    store.add("By ref", None, None).unwrap();
    let task = store.get_by_ref("1").unwrap();
    assert_eq!(task.title, "By ref");
}

#[test]
fn get_by_ref_slug() {
    let (_tmp, store) = setup();
    store.add("Fix login bug", None, None).unwrap();
    let task = store.get_by_ref("fix-login-bug").unwrap();
    assert_eq!(task.title, "Fix login bug");
}

#[test]
fn get_not_found() {
    let (_tmp, store) = setup();
    let err = store.get(999).unwrap_err();
    assert!(matches!(
        err,
        unship_core::error::UnshipError::TaskNotFound(_)
    ));
}

// ── Update ─────────────────────────────────────────────────────────

#[test]
fn update_modifies_fields_and_refreshes_updated() {
    let (_tmp, store) = setup();
    let created = store.add("Original", None, None).unwrap();
    let original_updated = created.updated;

    std::thread::sleep(std::time::Duration::from_millis(10));

    let updated = store
        .update(
            1,
            TaskUpdate {
                title: Some("Modified".to_string()),
                ..Default::default()
            },
        )
        .unwrap();

    assert_eq!(updated.title, "Modified");
    assert!(updated.updated > original_updated);
}

// ── Delete ─────────────────────────────────────────────────────────

#[test]
fn delete_removes_file() {
    let (_tmp, store) = setup();
    let task = store.add("Delete me", None, None).unwrap();
    let path = task.file_path.unwrap();
    assert!(path.exists());

    store.delete(1).unwrap();
    assert!(!path.exists());
}

#[test]
fn delete_not_found() {
    let (_tmp, store) = setup();
    let err = store.delete(999).unwrap_err();
    assert!(matches!(
        err,
        unship_core::error::UnshipError::TaskNotFound(_)
    ));
}

// ── Status transitions ─────────────────────────────────────────────

#[test]
fn set_status_normalizes_alias() {
    let (_tmp, store) = setup();
    store.add("Status test", None, None).unwrap();
    let task = store.set_status(1, "doing").unwrap();
    assert_eq!(task.status, "in-progress");
}

#[test]
fn mark_done_sets_completed() {
    let (_tmp, store) = setup();
    store.add("Complete me", None, None).unwrap();

    let task = store.mark_done(1).unwrap();
    assert_eq!(task.status, "done");
    assert!(task.completed.is_some());
}

#[test]
fn moving_out_of_done_clears_completed() {
    let (_tmp, store) = setup();
    store.add("Reopen me", None, None).unwrap();

    let done = store.mark_done(1).unwrap();
    assert!(done.completed.is_some());

    let reopened = store.set_status(1, "todo").unwrap();
    assert_eq!(reopened.status, "todo");
    assert!(reopened.completed.is_none());
}

#[test]
fn mark_done_uses_configured_done_column() {
    let tmp = tempfile::TempDir::new().unwrap();
    unship_core::init::init(
        tmp.path(),
        Some(unship_core::config::Preset::BugTracking.columns()),
    )
    .unwrap();
    let store = TaskStore::new(tmp.path().to_path_buf()).unwrap();

    store.add("Resolve me", None, None).unwrap();

    let task = store.mark_done(1).unwrap();
    assert_eq!(task.status, "resolved");
    assert!(task.completed.is_some());
}

// ── Concurrency ────────────────────────────────────────────────────

#[test]
fn concurrent_adds_serialize_under_lock() {
    let (tmp, _) = setup();
    let root = tmp.path().to_path_buf();
    let barrier = Arc::new(Barrier::new(5));
    let mut handles = vec![];

    for i in 0..5 {
        let root = root.clone();
        let barrier = Arc::clone(&barrier);
        handles.push(std::thread::spawn(move || {
            let store = TaskStore::new(root).unwrap();
            barrier.wait();
            store.add(&format!("Task {i}"), None, None).unwrap()
        }));
    }

    let tasks: Vec<_> = handles.into_iter().map(|h| h.join().unwrap()).collect();
    let ids: Vec<u32> = tasks.iter().filter_map(|t| t.id).collect();

    // All IDs should be unique
    let mut sorted = ids.clone();
    sorted.sort();
    sorted.dedup();
    assert_eq!(sorted.len(), 5, "all 5 tasks should have unique IDs");
}

#[test]
fn concurrent_status_changes() {
    let (tmp, store) = setup();
    for i in 0..3 {
        store.add(&format!("Task {i}"), None, None).unwrap();
    }

    let root = tmp.path().to_path_buf();
    let barrier = Arc::new(Barrier::new(3));
    let mut handles = vec![];

    for id in 1..=3 {
        let root = root.clone();
        let barrier = Arc::clone(&barrier);
        handles.push(std::thread::spawn(move || {
            let store = TaskStore::new(root).unwrap();
            barrier.wait();
            store.set_status(id, "in-progress").unwrap()
        }));
    }

    for h in handles {
        h.join().unwrap();
    }

    // All tasks should be in-progress
    let store = TaskStore::new(tmp.path().to_path_buf()).unwrap();
    let tasks = store.list(None).unwrap();
    for t in &tasks {
        assert_eq!(t.status, "in-progress");
    }
}

#[test]
fn concurrent_deletes_remove_all_targets() {
    let (tmp, store) = setup();
    for i in 0..5 {
        store.add(&format!("Task {i}"), None, None).unwrap();
    }

    let root = tmp.path().to_path_buf();
    let barrier = Arc::new(Barrier::new(5));
    let mut handles = vec![];

    for id in 1..=5 {
        let root = root.clone();
        let barrier = Arc::clone(&barrier);
        handles.push(std::thread::spawn(move || {
            let store = TaskStore::new(root).unwrap();
            barrier.wait();
            store.delete(id).unwrap();
        }));
    }

    for handle in handles {
        handle.join().unwrap();
    }

    let store = TaskStore::new(tmp.path().to_path_buf()).unwrap();
    assert!(store.list(None).unwrap().is_empty());
}

// ── PRD field ──────────────────────────────────────────────────────

#[test]
fn add_task_preserves_prd_field_through_roundtrip() {
    let (_tmp, store) = setup();
    let task = store.add("Setup boilerplate", None, None).unwrap();

    let path = task.file_path.unwrap();
    let updated_content = format!(
        "---\nid: {}\ntitle: Setup boilerplate\nstatus: backlog\nprd: .unship/docs/my-project.md\ncreated: 2026-03-08\nupdated: 2026-03-08T00:00:00Z\nposition: 1.0\n---\n",
        task.id.unwrap()
    );
    std::fs::write(&path, updated_content).unwrap();

    let loaded = store.get(task.id.unwrap()).unwrap();
    assert_eq!(loaded.prd.as_deref(), Some(".unship/docs/my-project.md"));
}

#[test]
fn add_task_with_prd_sets_field() {
    let (_tmp, store) = setup();
    let task = store
        .add("Task from PRD", None, Some(".unship/docs/spec.md"))
        .unwrap();

    assert_eq!(task.prd.as_deref(), Some(".unship/docs/spec.md"));

    let loaded = store.get(task.id.unwrap()).unwrap();
    assert_eq!(loaded.prd.as_deref(), Some(".unship/docs/spec.md"));
}

// ── count_by_prd ───────────────────────────────────────────────────

#[test]
fn count_by_prd_returns_done_and_total() {
    let (_tmp, store) = setup();

    let t1 = store
        .add("Task 1", None, Some(".unship/docs/my-project.md"))
        .unwrap();
    let _t2 = store
        .add("Task 2", None, Some(".unship/docs/my-project.md"))
        .unwrap();
    let _t3 = store
        .add("Task 3", None, Some(".unship/docs/my-project.md"))
        .unwrap();
    let _t4 = store.add("Unrelated task", None, None).unwrap();

    store.mark_done(t1.id.unwrap()).unwrap();

    let (done, total) = store.count_by_prd(".unship/docs/my-project.md").unwrap();
    assert_eq!(total, 3);
    assert_eq!(done, 1);
}

#[test]
fn count_by_prd_returns_zero_when_no_tasks_linked() {
    let (_tmp, store) = setup();
    store.add("Unlinked task", None, None).unwrap();

    let (done, total) = store.count_by_prd("nonexistent.md").unwrap();
    assert_eq!(total, 0);
    assert_eq!(done, 0);
}
