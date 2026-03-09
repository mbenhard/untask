use std::sync::{Arc, Barrier};
use tempfile::TempDir;
use unship_core::error::UnshipError;
use unship_core::fs::atomic_write;
use unship_core::init::init;
use unship_core::lock::ProjectLock;

#[test]
fn init_creates_all_directories() {
    let dir = TempDir::new().unwrap();
    init(dir.path(), None).unwrap();

    assert!(dir.path().join(".unship/tasks").is_dir());
    assert!(dir.path().join(".unship/docs").is_dir());
    assert!(dir.path().join(".unship/attachments").is_dir());
    assert!(dir.path().join(".unship/cache").is_dir());
}

#[test]
fn init_is_idempotent() {
    let dir = TempDir::new().unwrap();
    init(dir.path(), None).unwrap();
    init(dir.path(), None).unwrap();
    assert!(dir.path().join(".unship/tasks").is_dir());
}

#[test]
fn init_creates_gitignore() {
    let dir = TempDir::new().unwrap();
    init(dir.path(), None).unwrap();

    let content = std::fs::read_to_string(dir.path().join(".unship/.gitignore")).unwrap();
    assert!(content.contains(".lock"));
    assert!(content.contains("cache/"));
}

#[test]
fn lock_acquisition_succeeds() {
    let dir = TempDir::new().unwrap();
    init(dir.path(), None).unwrap();
    let _lock = ProjectLock::acquire(dir.path()).unwrap();
}

#[test]
fn lock_requires_initialized_project() {
    let dir = TempDir::new().unwrap();

    match ProjectLock::acquire(dir.path()) {
        Err(UnshipError::NotInitialized) => {}
        Err(other) => panic!("expected NotInitialized, got {other:?}"),
        Ok(_) => panic!("expected lock acquisition to fail without .unship"),
    }
}

#[test]
fn lock_serializes_access() {
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::thread;

    let dir = TempDir::new().unwrap();
    init(dir.path(), None).unwrap();

    let counter = Arc::new(AtomicU32::new(0));
    let barrier = Arc::new(Barrier::new(2));
    let mut handles = vec![];

    for _ in 0..2 {
        let path = dir.path().to_path_buf();
        let counter = Arc::clone(&counter);
        let barrier = Arc::clone(&barrier);
        handles.push(thread::spawn(move || {
            barrier.wait();
            let _lock = ProjectLock::acquire(&path).unwrap();
            // Simulate work while holding lock
            let val = counter.fetch_add(1, Ordering::SeqCst);
            std::thread::sleep(std::time::Duration::from_millis(10));
            let after = counter.load(Ordering::SeqCst);
            // While we held the lock, no other thread should have incremented
            assert_eq!(after, val + 1);
        }));
    }

    for h in handles {
        h.join().unwrap();
    }
    assert_eq!(counter.load(std::sync::atomic::Ordering::SeqCst), 2);
}

#[test]
fn atomic_write_creates_file() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("test.txt");
    atomic_write(&path, b"hello world").unwrap();
    assert_eq!(std::fs::read_to_string(&path).unwrap(), "hello world");
}

#[test]
fn atomic_write_no_temp_files_left() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("test.txt");
    atomic_write(&path, b"content").unwrap();

    let entries: Vec<_> = std::fs::read_dir(dir.path())
        .unwrap()
        .filter_map(|e| e.ok())
        .collect();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].file_name(), "test.txt");
}
