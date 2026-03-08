use untask_core::docs::{DocNode, DocNodeKind, DocsStore, infer_writable_doc_root};
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

fn write_config(tmp: &tempfile::TempDir, content: &str) {
    std::fs::write(tmp.path().join(".untask/config.yml"), content).unwrap();
}

fn find_node<'a>(nodes: &'a [DocNode], path: &str) -> Option<&'a DocNode> {
    for node in nodes {
        if node.relative_path == path || node.node_path == path {
            return Some(node);
        }
        if let Some(child) = find_node(&node.children, path) {
            return Some(child);
        }
    }
    None
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
fn list_uses_config_as_authoritative_source() {
    let tmp = setup();
    write_doc(&tmp, ".untask/docs/guide.md", "# Guide");
    write_doc(&tmp, "docs/architecture.md", "# Architecture");

    // Config only specifies docs/**/*.md — .untask/docs/ should NOT be searched
    let config_content = "docs:\n  - \"docs/**/*.md\"\n";
    std::fs::write(tmp.path().join(".untask/config.yml"), config_content).unwrap();

    let store = DocsStore::new(tmp.path().to_path_buf());
    let docs = store.list().unwrap();

    assert_eq!(docs.len(), 1);
    assert_eq!(docs[0].basename, "architecture.md");
}

#[test]
fn list_discovers_docs_folder_with_no_config() {
    let tmp = tempfile::TempDir::new().unwrap();
    write_doc(&tmp, "docs/readme.md", "# Readme");
    write_doc(&tmp, "docs/plans/roadmap.md", "# Roadmap");

    let store = DocsStore::new(tmp.path().to_path_buf());
    let docs = store.list().unwrap();

    assert_eq!(docs.len(), 2);
    let basenames: Vec<&str> = docs.iter().map(|d| d.basename.as_str()).collect();
    assert!(basenames.contains(&"readme.md"));
    assert!(basenames.contains(&"roadmap.md"));
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

// ── Tree / File Management ──────────────────────────────────────────

#[test]
fn infer_writable_doc_root_only_accepts_literal_directory_prefixes() {
    assert_eq!(
        infer_writable_doc_root("docs/**/*.md").unwrap(),
        std::path::PathBuf::from("docs")
    );
    assert_eq!(
        infer_writable_doc_root(".untask/docs/*.md").unwrap(),
        std::path::PathBuf::from(".untask/docs")
    );
    assert!(infer_writable_doc_root("**/notes/*.md").is_none());
    assert!(infer_writable_doc_root("docs/*/drafts/*.md").is_none());
}

#[test]
fn list_tree_includes_empty_writable_folders() {
    let tmp = setup();
    write_doc(&tmp, "docs/readme.md", "# Readme");
    std::fs::create_dir_all(tmp.path().join("docs/plans/empty")).unwrap();

    let store = DocsStore::new(tmp.path().to_path_buf());
    let tree = store.list_tree().unwrap();

    let docs_root = find_node(&tree, "docs").unwrap();
    assert_eq!(docs_root.kind, DocNodeKind::Root);
    assert!(!docs_root.read_only);
    assert!(find_node(&tree, "docs/readme.md").is_some());
    assert!(find_node(&tree, "docs/plans").is_some());
    assert!(find_node(&tree, "docs/plans/empty").is_some());
}

#[test]
fn list_tree_downgrades_unsupported_patterns_to_browse_only() {
    let tmp = setup();
    write_config(&tmp, "docs:\n  - \"**/notes/*.md\"\n");
    write_doc(&tmp, "guides/notes/idea.md", "# Idea");

    let store = DocsStore::new(tmp.path().to_path_buf());
    let tree = store.list_tree().unwrap();

    assert_eq!(tree.len(), 1);
    assert!(tree[0].read_only);
    assert_eq!(tree[0].kind, DocNodeKind::Root);
    assert_eq!(tree[0].relative_path, "**/notes/*.md");
    assert!(find_node(&tree, "guides/notes").is_some());
    assert!(find_node(&tree, "guides/notes/idea.md").is_some());
}

#[test]
fn create_doc_creates_missing_writable_root_and_appends_md() {
    let tmp = setup();
    write_config(&tmp, "docs:\n  - \"specs/**/*.md\"\n");

    let store = DocsStore::new(tmp.path().to_path_buf());
    let created = store
        .create_doc("specs", "overview", "# Overview\n")
        .unwrap();

    assert_eq!(created.basename, "overview.md");
    assert!(tmp.path().join("specs/overview.md").is_file());
    assert!(find_node(&store.list_tree().unwrap(), "specs/overview.md").is_some());
}

#[test]
fn move_path_rejects_cross_root_moves() {
    let tmp = setup();
    write_config(&tmp, "docs:\n  - \"docs/**/*.md\"\n  - \"specs/**/*.md\"\n");
    write_doc(&tmp, "docs/readme.md", "# Readme");
    std::fs::create_dir_all(tmp.path().join("specs")).unwrap();

    let store = DocsStore::new(tmp.path().to_path_buf());
    let err = store.move_path("docs/readme.md", "specs").unwrap_err();

    assert!(err.to_string().contains("cross-root"));
}

#[test]
fn delete_folder_rejects_non_empty_folder() {
    let tmp = setup();
    write_doc(&tmp, "docs/plans/roadmap.md", "# Roadmap");

    let store = DocsStore::new(tmp.path().to_path_buf());
    let err = store.delete_folder("docs/plans").unwrap_err();

    assert!(err.to_string().contains("not empty"));
}

#[test]
fn rename_path_rejects_docs_root() {
    let tmp = setup();

    let store = DocsStore::new(tmp.path().to_path_buf());
    let err = store.rename_path("docs", "notes").unwrap_err();

    assert!(err.to_string().contains("docs root"));
}

// ── DocType / frontmatter parsing ───────────────────────────────────

#[test]
fn list_parses_doc_type_from_frontmatter() {
    let tmp = setup();
    write_doc(
        &tmp,
        ".untask/docs/spec.md",
        "---\ntype: prd\n---\n# My PRD\nBuild this.",
    );
    write_doc(
        &tmp,
        ".untask/docs/notes.md",
        "# Just notes\nNo frontmatter.",
    );

    let store = DocsStore::new(tmp.path().to_path_buf());
    let docs = store.list().unwrap();

    assert_eq!(docs.len(), 2);
    let spec = docs.iter().find(|d| d.basename == "spec.md").unwrap();
    let notes = docs.iter().find(|d| d.basename == "notes.md").unwrap();

    assert_eq!(spec.doc_type, untask_core::docs::DocType::Prd);
    assert_eq!(notes.doc_type, untask_core::docs::DocType::Doc);
}

#[test]
fn list_parses_doc_type_defaults_to_doc() {
    let tmp = setup();
    write_doc(
        &tmp,
        ".untask/docs/guide.md",
        "---\ntitle: Guide\n---\n# Guide",
    );

    let store = DocsStore::new(tmp.path().to_path_buf());
    let docs = store.list().unwrap();

    assert_eq!(docs[0].doc_type, untask_core::docs::DocType::Doc);
}

#[test]
fn list_parses_explicit_doc_type() {
    let tmp = setup();
    write_doc(
        &tmp,
        ".untask/docs/notes.md",
        "---\ntype: doc\n---\n# Notes",
    );

    let store = DocsStore::new(tmp.path().to_path_buf());
    let docs = store.list().unwrap();

    assert_eq!(docs[0].doc_type, untask_core::docs::DocType::Doc);
}

#[test]
fn list_tree_includes_doc_type_on_doc_nodes() {
    let tmp = setup();
    write_doc(&tmp, ".untask/docs/spec.md", "---\ntype: prd\n---\n# Spec");
    write_doc(&tmp, ".untask/docs/notes.md", "# Notes");

    let store = DocsStore::new(tmp.path().to_path_buf());
    let tree = store.list_tree().unwrap();

    let spec_node = find_node(&tree, ".untask/docs/spec.md").unwrap();
    let notes_node = find_node(&tree, ".untask/docs/notes.md").unwrap();

    assert_eq!(spec_node.doc_type, Some(untask_core::docs::DocType::Prd));
    assert_eq!(notes_node.doc_type, Some(untask_core::docs::DocType::Doc));
}
