use untask_core::init::init;
use untask_core::search::{SearchResultKind, search};
use untask_core::store::TaskStore;

fn setup() -> tempfile::TempDir {
    let tmp = tempfile::TempDir::new().unwrap();
    init(tmp.path(), None).unwrap();
    tmp
}

fn write_doc(tmp: &tempfile::TempDir, rel_path: &str, content: &str) {
    let path = tmp.path().join(rel_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).unwrap();
    }
    std::fs::write(&path, content).unwrap();
}

// ── Task search ─────────────────────────────────────────────────────

#[test]
fn search_finds_matches_in_task_titles() {
    let tmp = setup();
    let store = TaskStore::new(tmp.path().to_path_buf()).unwrap();
    store.add("Fix login bug", None).unwrap();
    store.add("Add signup form", None).unwrap();

    let results = search(tmp.path(), "login", false).unwrap();

    assert_eq!(results.len(), 1);
    assert_eq!(results[0].kind, SearchResultKind::Task);
    assert_eq!(results[0].title, "Fix login bug");
}

#[test]
fn search_is_case_insensitive() {
    let tmp = setup();
    let store = TaskStore::new(tmp.path().to_path_buf()).unwrap();
    store.add("Fix Login Bug", None).unwrap();

    let results = search(tmp.path(), "fix login", false).unwrap();
    assert_eq!(results.len(), 1);
}

#[test]
fn search_finds_matches_in_task_bodies() {
    let tmp = setup();
    let store = TaskStore::new(tmp.path().to_path_buf()).unwrap();
    store.add("Generic task", None).unwrap();

    // Write body content directly to the task file
    let task = store.get(1).unwrap();
    let path = task.file_path.unwrap();
    let content = std::fs::read_to_string(&path).unwrap();
    let with_body = format!("{content}\nThis task involves database migration.\n");
    std::fs::write(&path, with_body).unwrap();

    let results = search(tmp.path(), "database migration", false).unwrap();

    assert_eq!(results.len(), 1);
    assert_eq!(results[0].title, "Generic task");
    assert!(results[0].line_number >= 1);
}

#[test]
fn search_finds_matches_in_tags() {
    let tmp = setup();
    let store = TaskStore::new(tmp.path().to_path_buf()).unwrap();
    store.add("Tagged task", None).unwrap();
    store
        .update(
            1,
            untask_core::store::TaskUpdate {
                tags: Some(vec!["backend".to_string(), "urgent".to_string()]),
                ..Default::default()
            },
        )
        .unwrap();

    let results = search(tmp.path(), "urgent", false).unwrap();

    assert_eq!(results.len(), 1);
    assert!(results[0].snippet.contains("urgent"));
}

// ── Doc search ──────────────────────────────────────────────────────

#[test]
fn search_finds_matches_in_docs() {
    let tmp = setup();
    write_doc(
        &tmp,
        ".untask/docs/guide.md",
        "# Getting Started\nFollow these deployment steps.",
    );

    let results = search(tmp.path(), "deployment", false).unwrap();

    assert_eq!(results.len(), 1);
    assert_eq!(results[0].kind, SearchResultKind::Doc);
    assert_eq!(results[0].title, "guide.md");
}

#[test]
fn search_tasks_only_excludes_docs() {
    let tmp = setup();
    let store = TaskStore::new(tmp.path().to_path_buf()).unwrap();
    store.add("Fix deploy script", None).unwrap();
    write_doc(
        &tmp,
        ".untask/docs/deploy.md",
        "# Deploy\nDeploy instructions.",
    );

    let all_results = search(tmp.path(), "deploy", false).unwrap();
    let task_results = search(tmp.path(), "deploy", true).unwrap();

    assert_eq!(all_results.len(), 2);
    assert_eq!(task_results.len(), 1);
    assert_eq!(task_results[0].kind, SearchResultKind::Task);
}

#[test]
fn search_returns_empty_when_no_matches() {
    let tmp = setup();
    let store = TaskStore::new(tmp.path().to_path_buf()).unwrap();
    store.add("Some task", None).unwrap();

    let results = search(tmp.path(), "nonexistent_query_xyz", false).unwrap();
    assert!(results.is_empty());
}

#[test]
fn search_generates_snippets_with_highlight() {
    let tmp = setup();
    let store = TaskStore::new(tmp.path().to_path_buf()).unwrap();
    store.add("Fix the login page", None).unwrap();

    let results = search(tmp.path(), "login", false).unwrap();

    assert_eq!(results.len(), 1);
    assert!(results[0].snippet.contains("**login**"));
}

#[test]
fn search_prioritizes_title_matches_over_body_matches() {
    let tmp = setup();
    let store = TaskStore::new(tmp.path().to_path_buf()).unwrap();
    store.add("Background cleanup", None).unwrap();
    store.add("Login follow-up", None).unwrap();

    let body_match = store.get(1).unwrap();
    let body_match_path = body_match.file_path.unwrap();
    let body_match_content = std::fs::read_to_string(&body_match_path).unwrap();
    std::fs::write(
        &body_match_path,
        format!("{body_match_content}\nNeed to revisit the login rollout notes.\n"),
    )
    .unwrap();

    let results = search(tmp.path(), "login", false).unwrap();

    assert_eq!(results.len(), 2);
    assert_eq!(results[0].title, "Login follow-up");
    assert_eq!(results[0].kind, SearchResultKind::Task);
    assert_eq!(results[1].title, "Background cleanup");
}

#[test]
fn search_handles_special_characters_in_query() {
    let tmp = setup();
    let store = TaskStore::new(tmp.path().to_path_buf()).unwrap();
    store
        .add("Task with (parens) and [brackets]", None)
        .unwrap();

    // Should not panic or error on regex-special chars
    let results = search(tmp.path(), "(parens)", false).unwrap();
    assert_eq!(results.len(), 1);
}
