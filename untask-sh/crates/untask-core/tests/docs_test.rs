use untask_core::docs::DocsStore;
use untask_core::init::init;

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

// ── List ────────────────────────────────────────────────────────────

#[test]
fn list_discovers_files_from_default_docs_glob() {
    let tmp = setup();
    write_doc(&tmp, ".untask/docs/guide.md", "# Guide\nSome content.");

    let store = DocsStore::new(tmp.path().to_path_buf());
    let docs = store.list().unwrap();

    assert_eq!(docs.len(), 1);
    assert_eq!(docs[0].basename, "guide.md");
    assert!(docs[0].content.contains("# Guide"));
}

#[test]
fn list_discovers_nested_docs() {
    let tmp = setup();
    write_doc(&tmp, ".untask/docs/deep/nested/doc.md", "nested content");

    let store = DocsStore::new(tmp.path().to_path_buf());
    let docs = store.list().unwrap();

    assert_eq!(docs.len(), 1);
    assert_eq!(docs[0].basename, "doc.md");
}

#[test]
fn list_deduplicates_by_canonical_path() {
    let tmp = setup();
    write_doc(&tmp, ".untask/docs/unique.md", "only once");

    // Config with two globs that match the same file
    let config_content = "docs:\n  - \".untask/docs/**/*.md\"\n  - \".untask/docs/unique.md\"\n";
    std::fs::write(tmp.path().join(".untask/config.yml"), config_content).unwrap();

    let store = DocsStore::new(tmp.path().to_path_buf());
    let docs = store.list().unwrap();

    assert_eq!(docs.len(), 1);
}

#[test]
fn list_handles_missing_docs_directory() {
    let tmp = setup();
    // Don't create .untask/docs/ — it shouldn't exist yet
    let store = DocsStore::new(tmp.path().to_path_buf());
    let docs = store.list().unwrap();
    assert!(docs.is_empty());
}

#[test]
fn list_discovers_configured_globs_outside_default() {
    let tmp = setup();
    write_doc(&tmp, "docs/architecture.md", "# Architecture");

    let config_content = "docs:\n  - \".untask/docs/**/*.md\"\n  - \"docs/**/*.md\"\n";
    std::fs::write(tmp.path().join(".untask/config.yml"), config_content).unwrap();

    let store = DocsStore::new(tmp.path().to_path_buf());
    let docs = store.list().unwrap();

    assert_eq!(docs.len(), 1);
    assert_eq!(docs[0].basename, "architecture.md");
}

#[test]
fn list_always_includes_default_docs_glob() {
    let tmp = setup();
    write_doc(&tmp, ".untask/docs/guide.md", "# Guide");
    write_doc(&tmp, "docs/architecture.md", "# Architecture");

    let config_content = "docs:\n  - \"docs/**/*.md\"\n";
    std::fs::write(tmp.path().join(".untask/config.yml"), config_content).unwrap();

    let store = DocsStore::new(tmp.path().to_path_buf());
    let docs = store.list().unwrap();

    assert_eq!(docs.len(), 2);
    assert_eq!(
        docs.iter()
            .map(|doc| doc.basename.as_str())
            .collect::<Vec<_>>(),
        vec!["guide.md", "architecture.md"]
    );
}

// ── Get ─────────────────────────────────────────────────────────────

#[test]
fn get_by_unique_basename() {
    let tmp = setup();
    write_doc(&tmp, ".untask/docs/setup.md", "# Setup\nInstructions here.");

    let store = DocsStore::new(tmp.path().to_path_buf());
    let doc = store.get("setup.md").unwrap();

    assert_eq!(doc.basename, "setup.md");
    assert!(doc.content.contains("Instructions here"));
}

#[test]
fn get_ambiguous_basename_returns_error() {
    let tmp = setup();
    write_doc(&tmp, ".untask/docs/notes.md", "notes v1");
    write_doc(&tmp, ".untask/docs/sub/notes.md", "notes v2");

    let store = DocsStore::new(tmp.path().to_path_buf());
    let err = store.get("notes.md").unwrap_err();

    assert!(matches!(
        err,
        untask_core::error::UntaskError::Ambiguous(ref name, _) if name == "notes.md"
    ));

    // Error message should list both paths
    let msg = err.to_string();
    assert!(msg.contains(".untask/docs/"));
}

#[test]
fn get_not_found_returns_error() {
    let tmp = setup();
    let store = DocsStore::new(tmp.path().to_path_buf());
    let err = store.get("nonexistent.md").unwrap_err();
    assert!(matches!(
        err,
        untask_core::error::UntaskError::DocNotFound(_)
    ));
}

#[test]
fn get_by_relative_path_disambiguates() {
    let tmp = setup();
    write_doc(&tmp, ".untask/docs/notes.md", "root notes");
    write_doc(&tmp, ".untask/docs/sub/notes.md", "sub notes");

    let store = DocsStore::new(tmp.path().to_path_buf());
    let doc = store.get(".untask/docs/sub/notes.md").unwrap();

    assert!(doc.content.contains("sub notes"));
}

#[test]
fn get_is_case_sensitive() {
    let tmp = setup();
    write_doc(&tmp, ".untask/docs/README.md", "readme content");

    let store = DocsStore::new(tmp.path().to_path_buf());
    let err = store.get("readme.md").unwrap_err();
    assert!(matches!(
        err,
        untask_core::error::UntaskError::DocNotFound(_)
    ));
}
