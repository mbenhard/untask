use std::sync::{Arc, Barrier};

use untask_core::init::init;
use untask_core::store::{ListFilter, TaskStore, TaskUpdate};

fn setup() -> (tempfile::TempDir, TaskStore) {
    let tmp = tempfile::TempDir::new().unwrap();
    init(tmp.path()).unwrap();
    let store = TaskStore::new(tmp.path().to_path_buf()).unwrap();
    (tmp, store)
}

// ── Add ────────────────────────────────────────────────────────────

#[test]
fn add_creates_file_with_correct_format() {
    let (tmp, store) = setup();
    let task = store.add("Fix login bug", None).unwrap();

    assert_eq!(task.id, Some(1));
    assert_eq!(task.title, "Fix login bug");
    assert_eq!(task.status, "backlog"); // default column

    let path = task.file_path.unwrap();
    assert!(path.exists());
    assert_eq!(
        path.file_name().unwrap().to_str().unwrap(),
        "001-fix-login-bug.md"
    );
    // Verify it's inside .untask/tasks/
    assert!(path.starts_with(tmp.path().join(".untask/tasks")));
}

#[test]
fn add_with_status() {
    let (_tmp, store) = setup();
    let task = store.add("Deploy service", Some("in-progress")).unwrap();
    assert_eq!(task.status, "in-progress");
}

#[test]
fn add_normalizes_status_alias() {
    let (_tmp, store) = setup();
    let task = store.add("WIP task", Some("doing")).unwrap();
    assert_eq!(task.status, "in-progress");
}

#[test]
fn add_increments_ids() {
    let (_tmp, store) = setup();
    let t1 = store.add("First", None).unwrap();
    let t2 = store.add("Second", None).unwrap();
    let t3 = store.add("Third", None).unwrap();
    assert_eq!(t1.id, Some(1));
    assert_eq!(t2.id, Some(2));
    assert_eq!(t3.id, Some(3));
}

#[test]
fn add_is_gap_tolerant() {
    let (_tmp, store) = setup();
    let t1 = store.add("First", None).unwrap();
    let t2 = store.add("Second", None).unwrap();
    assert_eq!(t1.id, Some(1));
    assert_eq!(t2.id, Some(2));

    // Delete task 1, next ID should be 3 (not 1)
    store.delete(1).unwrap();
    let t3 = store.add("Third", None).unwrap();
    assert_eq!(t3.id, Some(3));
}

// ── List ───────────────────────────────────────────────────────────

#[test]
fn list_returns_all_tasks() {
    let (_tmp, store) = setup();
    store.add("A", None).unwrap();
    store.add("B", None).unwrap();
    let tasks = store.list(None).unwrap();
    assert_eq!(tasks.len(), 2);
}

#[test]
fn list_does_not_modify_files() {
    let (_tmp, store) = setup();
    store.add("Check me", None).unwrap();

    // Create an unindexed file (no ID prefix in filename)
    let unindexed_path = _tmp.path().join(".untask/tasks/random-note.md");
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
fn list_filters_by_status() {
    let (_tmp, store) = setup();
    store.add("Backlog task", None).unwrap();
    store.add("In-progress task", Some("in-progress")).unwrap();

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
    let t1 = store.add("Tagged", None).unwrap();
    store.add("Untagged", None).unwrap();

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
    store.add("Find me", None).unwrap();
    let task = store.get(1).unwrap();
    assert_eq!(task.title, "Find me");
}

#[test]
fn get_by_ref_numeric() {
    let (_tmp, store) = setup();
    store.add("By ref", None).unwrap();
    let task = store.get_by_ref("1").unwrap();
    assert_eq!(task.title, "By ref");
}

#[test]
fn get_by_ref_slug() {
    let (_tmp, store) = setup();
    store.add("Fix login bug", None).unwrap();
    let task = store.get_by_ref("fix-login-bug").unwrap();
    assert_eq!(task.title, "Fix login bug");
}

#[test]
fn get_not_found() {
    let (_tmp, store) = setup();
    let err = store.get(999).unwrap_err();
    assert!(matches!(
        err,
        untask_core::error::UntaskError::TaskNotFound(_)
    ));
}

// ── Update ─────────────────────────────────────────────────────────

#[test]
fn update_modifies_fields_and_refreshes_updated() {
    let (_tmp, store) = setup();
    let created = store.add("Original", None).unwrap();
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
    let task = store.add("Delete me", None).unwrap();
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
        untask_core::error::UntaskError::TaskNotFound(_)
    ));
}

// ── Status transitions ─────────────────────────────────────────────

#[test]
fn set_status_normalizes_alias() {
    let (_tmp, store) = setup();
    store.add("Status test", None).unwrap();
    let task = store.set_status(1, "doing").unwrap();
    assert_eq!(task.status, "in-progress");
}

#[test]
fn mark_done_sets_completed() {
    let (_tmp, store) = setup();
    store.add("Complete me", None).unwrap();

    let task = store.mark_done(1).unwrap();
    assert_eq!(task.status, "done");
    assert!(task.completed.is_some());
}

#[test]
fn moving_out_of_done_clears_completed() {
    let (_tmp, store) = setup();
    store.add("Reopen me", None).unwrap();

    let done = store.mark_done(1).unwrap();
    assert!(done.completed.is_some());

    let reopened = store.set_status(1, "todo").unwrap();
    assert_eq!(reopened.status, "todo");
    assert!(reopened.completed.is_none());
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
            store.add(&format!("Task {i}"), None).unwrap()
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
        store.add(&format!("Task {i}"), None).unwrap();
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
