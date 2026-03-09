use std::fs;

use chrono::Utc;
use tempfile::TempDir;
use unship_core::attachments;
use unship_core::store::{TaskStore, TaskUpdate};
use unship_core::task::AttachmentRef;

fn setup() -> TempDir {
    let tmp = TempDir::new().unwrap();
    unship_core::init::init(tmp.path(), None).unwrap();
    tmp
}

#[test]
fn add_and_remove_attachment() {
    let tmp = setup();
    let source = tmp.path().join("test-file.txt");
    fs::write(&source, "hello world").unwrap();

    let att = attachments::add_attachment(tmp.path(), 1, &source).unwrap();
    assert_eq!(att.filename, "test-file.txt");
    assert_eq!(att.mime_type, "text/plain");
    assert_eq!(att.size, 11);

    let stored = attachments::attachment_path(tmp.path(), 1, &att.filename).unwrap();
    assert!(stored.is_file());

    attachments::remove_attachment(tmp.path(), 1, &att.filename).unwrap();
    assert!(!stored.exists());
}

#[test]
fn filename_collision_handling() {
    let tmp = setup();
    let source = tmp.path().join("file.png");
    fs::write(&source, "fake png 1").unwrap();

    let a1 = attachments::add_attachment(tmp.path(), 1, &source).unwrap();
    assert_eq!(a1.filename, "file.png");

    fs::write(&source, "fake png 2").unwrap();
    let a2 = attachments::add_attachment(tmp.path(), 1, &source).unwrap();
    assert_eq!(a2.filename, "file-1.png");
}

#[test]
fn rejects_oversized_file() {
    let tmp = setup();
    let source = tmp.path().join("huge.bin");
    let data = vec![0u8; 26 * 1024 * 1024];
    fs::write(&source, &data).unwrap();

    let result = attachments::add_attachment(tmp.path(), 1, &source);
    assert!(result.is_err());
}

#[test]
fn add_attachment_from_bytes() {
    let tmp = setup();
    let data = b"fake png data";

    let att = attachments::add_attachment_bytes(tmp.path(), 1, data, "paste-1234.png", "image/png")
        .unwrap();

    assert_eq!(att.filename, "paste-1234.png");
    assert_eq!(att.mime_type, "image/png");
    assert_eq!(att.size, data.len() as u64);

    let stored = attachments::attachment_path(tmp.path(), 1, &att.filename).unwrap();
    assert!(stored.is_file());
    assert_eq!(std::fs::read(&stored).unwrap(), data);
}

#[test]
fn remove_all_cleans_directory() {
    let tmp = setup();
    let s1 = tmp.path().join("a.txt");
    let s2 = tmp.path().join("b.txt");
    fs::write(&s1, "a").unwrap();
    fs::write(&s2, "b").unwrap();

    attachments::add_attachment(tmp.path(), 1, &s1).unwrap();
    attachments::add_attachment(tmp.path(), 1, &s2).unwrap();

    let dir = tmp.path().join(".unship/attachments/1");
    assert!(dir.is_dir());

    attachments::remove_all_attachments(tmp.path(), 1).unwrap();
    assert!(!dir.exists());
}

#[test]
fn rejects_traversal_and_empty_attachment_filenames() {
    for invalid in ["", ".", "..", "../x", "../../x", "a/b", "a\\b"] {
        let error = attachments::validate_attachment_filename(invalid).unwrap_err();
        assert!(error.to_string().contains("invalid attachment filename"));
    }

    assert_eq!(
        attachments::validate_attachment_filename("report.pdf").unwrap(),
        "report.pdf"
    );
}

#[test]
fn attachment_path_never_escapes_attachment_directory() {
    let tmp = setup();
    let safe = attachments::attachment_path(tmp.path(), 42, "report.pdf").unwrap();
    assert!(safe.ends_with(".unship/attachments/42/report.pdf"));

    let error = attachments::attachment_path(tmp.path(), 42, "../report.pdf").unwrap_err();
    assert!(error.to_string().contains("invalid attachment filename"));
}

#[test]
fn store_remove_missing_file_still_clears_metadata() {
    let tmp = setup();
    let store = TaskStore::new(tmp.path().to_path_buf()).unwrap();
    let task = store.add("Task with attachment", None, None).unwrap();
    let task_id = task.id.unwrap();

    let updated = store
        .attach_file_bytes(task_id, b"hello", "notes.txt", "text/plain")
        .unwrap();
    assert_eq!(updated.attachments.len(), 1);

    let stored = attachments::attachment_path(tmp.path(), task_id, "notes.txt").unwrap();
    fs::remove_file(&stored).unwrap();

    let updated = store.delete_attachment(task_id, "notes.txt").unwrap();
    assert!(updated.attachments.is_empty());
}

#[test]
fn store_can_remove_invalid_reference_without_touching_outside_files() {
    let tmp = setup();
    let store = TaskStore::new(tmp.path().to_path_buf()).unwrap();
    let task = store
        .add("Task with broken attachment", None, None)
        .unwrap();
    let task_id = task.id.unwrap();
    let outside = tmp.path().join("outside.txt");
    fs::write(&outside, "keep me").unwrap();

    let broken = AttachmentRef {
        filename: "../../outside.txt".to_string(),
        mime_type: "text/plain".to_string(),
        size: 7,
        created: Utc::now(),
    };

    let updated = store
        .update(
            task_id,
            TaskUpdate {
                attachments: Some(vec![broken]),
                ..TaskUpdate::default()
            },
        )
        .unwrap();
    assert_eq!(updated.attachments.len(), 1);

    let updated = store
        .delete_attachment(task_id, "../../outside.txt")
        .unwrap();
    assert!(updated.attachments.is_empty());
    assert_eq!(fs::read_to_string(outside).unwrap(), "keep me");
}

#[cfg(unix)]
#[test]
fn add_attachment_rolls_back_when_task_persist_fails() {
    use std::os::unix::fs::PermissionsExt;

    let tmp = setup();
    let store = TaskStore::new(tmp.path().to_path_buf()).unwrap();
    let task = store.add("Task for rollback", None, None).unwrap();
    let task_id = task.id.unwrap();
    let tasks_dir = tmp.path().join(".unship/tasks");

    let mut perms = fs::metadata(&tasks_dir).unwrap().permissions();
    perms.set_mode(0o555);
    fs::set_permissions(&tasks_dir, perms.clone()).unwrap();

    let result = store.attach_file_bytes(task_id, b"hello", "rollback.txt", "text/plain");

    perms.set_mode(0o755);
    fs::set_permissions(&tasks_dir, perms).unwrap();

    assert!(result.is_err());
    assert!(
        !attachments::attachment_path(tmp.path(), task_id, "rollback.txt")
            .unwrap()
            .exists()
    );
    assert!(store.get(task_id).unwrap().attachments.is_empty());
}

#[cfg(unix)]
#[test]
fn delete_attachment_rolls_back_when_task_persist_fails() {
    use std::os::unix::fs::PermissionsExt;

    let tmp = setup();
    let store = TaskStore::new(tmp.path().to_path_buf()).unwrap();
    let task = store.add("Task for delete rollback", None, None).unwrap();
    let task_id = task.id.unwrap();

    store
        .attach_file_bytes(task_id, b"hello", "rollback.txt", "text/plain")
        .unwrap();
    let stored = attachments::attachment_path(tmp.path(), task_id, "rollback.txt").unwrap();
    assert!(stored.exists());

    let tasks_dir = tmp.path().join(".unship/tasks");
    let mut perms = fs::metadata(&tasks_dir).unwrap().permissions();
    perms.set_mode(0o555);
    fs::set_permissions(&tasks_dir, perms.clone()).unwrap();

    let result = store.delete_attachment(task_id, "rollback.txt");

    perms.set_mode(0o755);
    fs::set_permissions(&tasks_dir, perms).unwrap();

    assert!(result.is_err());
    assert!(stored.exists());
    assert_eq!(store.get(task_id).unwrap().attachments.len(), 1);
}
