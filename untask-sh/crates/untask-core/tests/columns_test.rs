use std::fs;

use untask_core::columns;
use untask_core::config::Config;
use untask_core::init::init;
use untask_core::store::TaskStore;

fn setup() -> tempfile::TempDir {
    let tmp = tempfile::TempDir::new().unwrap();
    init(tmp.path(), None).unwrap();
    tmp
}

#[test]
fn rename_column_migrates_tasks_under_shared_core_flow() {
    let tmp = setup();
    let mut config = Config::load_strict(tmp.path()).unwrap();
    config.column_add("blocked", Some("review"), false).unwrap();
    config.save(tmp.path()).unwrap();

    let store = TaskStore::new(tmp.path().to_path_buf()).unwrap();
    let task = store.add("Blocked task", Some("blocked"), None).unwrap();

    let result = columns::rename_column(tmp.path(), "blocked", "qa").unwrap();
    assert_eq!(result.migrated_tasks, 1);
    assert!(result.config.columns.iter().any(|column| column.id == "qa"));

    let reloaded = TaskStore::new(tmp.path().to_path_buf())
        .unwrap()
        .get(task.id.unwrap())
        .unwrap();
    assert_eq!(reloaded.status, "qa");
}

#[test]
fn delete_column_normalizes_move_target_alias() {
    let tmp = setup();
    let mut config = Config::load_strict(tmp.path()).unwrap();
    config.column_add("blocked", Some("review"), false).unwrap();
    config.save(tmp.path()).unwrap();

    let store = TaskStore::new(tmp.path().to_path_buf()).unwrap();
    let task = store.add("Blocked task", Some("blocked"), None).unwrap();

    let result = columns::delete_column(tmp.path(), "blocked", Some("doing"), false).unwrap();
    assert_eq!(result.migrated_tasks, 1);

    let reloaded = TaskStore::new(tmp.path().to_path_buf())
        .unwrap()
        .get(task.id.unwrap())
        .unwrap();
    assert_eq!(reloaded.status, "in-progress");
}

#[test]
fn delete_column_rejects_unknown_move_target() {
    let tmp = setup();
    let mut config = Config::load_strict(tmp.path()).unwrap();
    config.column_add("blocked", Some("review"), false).unwrap();
    config.save(tmp.path()).unwrap();

    let err = columns::delete_column(tmp.path(), "blocked", Some("unknown-status"), false)
        .unwrap_err();
    assert!(err.to_string().contains("column not found"));
}

#[test]
fn load_strict_returns_error_for_invalid_config() {
    let tmp = tempfile::TempDir::new().unwrap();
    fs::create_dir_all(tmp.path().join(".untask")).unwrap();
    fs::write(tmp.path().join(".untask/config.yml"), "not: [valid: yaml: {{").unwrap();

    let err = Config::load_strict(tmp.path()).unwrap_err();
    assert!(err.to_string().contains("YAML parse error"));
}
