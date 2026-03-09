use std::fs;
use tempfile::TempDir;
use unship_core::config::Config;
use unship_core::error::UnshipError;

#[test]
fn default_config_has_five_columns() {
    let config = Config::default();
    assert_eq!(config.columns.len(), 5);
    let ids: Vec<&str> = config.columns.iter().map(|c| c.id.as_str()).collect();
    assert_eq!(
        ids,
        vec!["backlog", "todo", "in-progress", "review", "done"]
    );
}

#[test]
fn default_config_has_correct_aliases() {
    let config = Config::default();
    let todo = &config.columns[1];
    assert!(todo.aliases.contains(&"pending".to_string()));
    let done = &config.columns[4];
    assert!(done.aliases.contains(&"complete".to_string()));
    assert!(done.aliases.contains(&"finished".to_string()));
    assert!(done.aliases.contains(&"closed".to_string()));
}

#[test]
fn load_valid_config() {
    let dir = TempDir::new().unwrap();
    let unship_dir = dir.path().join(".unship");
    fs::create_dir_all(&unship_dir).unwrap();
    fs::write(
        unship_dir.join("config.yml"),
        r#"
columns:
  - id: open
    aliases: [new]
  - id: closed
    aliases: [done]
docs:
  - docs/**/*.md
theme: color
"#,
    )
    .unwrap();

    let config = Config::load(dir.path());
    assert_eq!(config.columns.len(), 2);
    assert_eq!(config.columns[0].id, "open");
    assert_eq!(config.columns[1].id, "closed");
    assert_eq!(config.docs, vec!["docs/**/*.md"]);
}

#[test]
fn invalid_config_falls_back_to_defaults() {
    let dir = TempDir::new().unwrap();
    let unship_dir = dir.path().join(".unship");
    fs::create_dir_all(&unship_dir).unwrap();
    fs::write(unship_dir.join("config.yml"), "not: [valid: yaml: {{").unwrap();

    let config = Config::load(dir.path());
    assert_eq!(config.columns.len(), 5);
}

#[test]
fn invalid_doc_globs_in_config_fall_back_to_defaults() {
    let dir = TempDir::new().unwrap();
    let unship_dir = dir.path().join(".unship");
    fs::create_dir_all(&unship_dir).unwrap();
    fs::write(
        unship_dir.join("config.yml"),
        r#"
docs:
  - /tmp/outside-project/**/*.md
"#,
    )
    .unwrap();

    let config = Config::load(dir.path());
    assert_eq!(config.columns.len(), 5);
    assert_eq!(config.docs, vec![".unship/docs/**/*.md", "docs/**/*.md"]);
}

#[test]
fn missing_config_returns_defaults() {
    let dir = TempDir::new().unwrap();
    let config = Config::load(dir.path());
    assert_eq!(config.columns.len(), 5);
}

#[test]
fn absolute_doc_glob_rejected() {
    let config = Config {
        docs: vec!["/etc/docs/**/*.md".into()],
        ..Config::default()
    };
    let err = config.validate_doc_globs().unwrap_err();
    assert!(matches!(err, UnshipError::InvalidConfig(_)));
}

#[test]
fn parent_traversal_doc_glob_rejected() {
    let config = Config {
        docs: vec!["../other-repo/docs/**/*.md".into()],
        ..Config::default()
    };
    let err = config.validate_doc_globs().unwrap_err();
    assert!(matches!(err, UnshipError::InvalidConfig(_)));
}

#[test]
fn windows_style_absolute_doc_glob_rejected() {
    let config = Config {
        docs: vec![r"C:\docs\**\*.md".into()],
        ..Config::default()
    };
    let err = config.validate_doc_globs().unwrap_err();
    assert!(matches!(err, UnshipError::InvalidConfig(_)));
}

#[test]
fn valid_relative_doc_globs_accepted() {
    let config = Config {
        docs: vec![
            "docs/**/*.md".into(),
            ".unship/docs/**/*.md".into(),
            "plans/**/*.md".into(),
        ],
        ..Config::default()
    };
    assert!(config.validate_doc_globs().is_ok());
}

#[test]
fn normalize_status_canonical() {
    let config = Config::default();
    assert_eq!(config.normalize_status("todo"), Some("todo".into()));
    assert_eq!(config.normalize_status("done"), Some("done".into()));
}

#[test]
fn normalize_status_alias() {
    let config = Config::default();
    assert_eq!(config.normalize_status("pending"), Some("todo".into()));
    assert_eq!(config.normalize_status("WIP"), Some("in-progress".into()));
    assert_eq!(config.normalize_status("complete"), Some("done".into()));
}

#[test]
fn normalize_status_unknown_returns_none() {
    let config = Config::default();
    assert_eq!(config.normalize_status("archived"), None);
}

#[test]
fn cannot_delete_required_columns() {
    let mut config = Config::default();
    let err = config.column_delete("review").unwrap_err();
    assert!(matches!(err, UnshipError::InvalidConfig(_)));
    assert!(
        err.to_string()
            .contains("cannot delete required column: review")
    );
}

#[test]
fn cannot_rename_required_columns() {
    let mut config = Config::default();
    let err = config.column_rename("review", "qa").unwrap_err();
    assert!(matches!(err, UnshipError::InvalidConfig(_)));
    assert!(
        err.to_string()
            .contains("cannot rename required column: review")
    );
}

#[test]
fn can_rename_custom_columns() {
    let mut config = Config::default();
    config.column_add("blocked", Some("review"), false).unwrap();

    let (old_id, new_id) = config.column_rename("blocked", "qa").unwrap();

    assert_eq!(old_id, "blocked");
    assert_eq!(new_id, "qa");
    assert!(config.columns.iter().any(|column| column.id == "qa"));
}
