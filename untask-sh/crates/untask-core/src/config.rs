use std::path::{Component, Path};

use serde::{Deserialize, Serialize};

use crate::error::{Result, UntaskError};
use crate::fs::atomic_write;
use crate::types::Theme;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Column {
    pub id: String,
    #[serde(default)]
    pub aliases: Vec<String>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub done: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    #[serde(default)]
    pub auto_done: bool,
    #[serde(default = "default_max_parallel")]
    pub max_parallel: u32,
}

fn default_max_parallel() -> u32 {
    3
}

impl Default for AgentConfig {
    fn default() -> Self {
        Self {
            auto_done: false,
            max_parallel: default_max_parallel(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    #[serde(default = "default_columns")]
    pub columns: Vec<Column>,
    #[serde(default = "default_docs")]
    pub docs: Vec<String>,
    #[serde(default)]
    pub theme: Theme,
    #[serde(default)]
    pub agent: AgentConfig,
}

fn default_columns() -> Vec<Column> {
    preset_kanban()
}

/// Built-in column presets.
pub enum Preset {
    Simple,
    Kanban,
    BugTracking,
}

impl Preset {
    pub fn columns(&self) -> Vec<Column> {
        match self {
            Self::Simple => preset_simple(),
            Self::Kanban => preset_kanban(),
            Self::BugTracking => preset_bug_tracking(),
        }
    }
}

fn preset_simple() -> Vec<Column> {
    vec![
        Column {
            id: "todo".into(),
            aliases: vec!["to-do".into(), "pending".into()],
            done: false,
        },
        Column {
            id: "in-progress".into(),
            aliases: vec!["wip".into(), "doing".into()],
            done: false,
        },
        Column {
            id: "done".into(),
            aliases: vec!["complete".into(), "finished".into()],
            done: true,
        },
    ]
}

fn preset_kanban() -> Vec<Column> {
    vec![
        Column {
            id: "backlog".into(),
            aliases: vec![],
            done: false,
        },
        Column {
            id: "todo".into(),
            aliases: vec!["to-do".into(), "to do".into(), "pending".into()],
            done: false,
        },
        Column {
            id: "in-progress".into(),
            aliases: vec![
                "wip".into(),
                "in progress".into(),
                "doing".into(),
                "working".into(),
            ],
            done: false,
        },
        Column {
            id: "review".into(),
            aliases: vec!["reviewing".into(), "in review".into()],
            done: false,
        },
        Column {
            id: "done".into(),
            aliases: vec!["complete".into(), "finished".into(), "closed".into()],
            done: true,
        },
    ]
}

fn preset_bug_tracking() -> Vec<Column> {
    vec![
        Column {
            id: "reported".into(),
            aliases: vec!["new".into()],
            done: false,
        },
        Column {
            id: "confirmed".into(),
            aliases: vec!["triaged".into()],
            done: false,
        },
        Column {
            id: "fixing".into(),
            aliases: vec!["in-progress".into(), "wip".into()],
            done: false,
        },
        Column {
            id: "testing".into(),
            aliases: vec!["qa".into(), "verifying".into()],
            done: false,
        },
        Column {
            id: "resolved".into(),
            aliases: vec!["fixed".into(), "done".into(), "closed".into()],
            done: true,
        },
    ]
}

fn default_docs() -> Vec<String> {
    vec![".untask/docs/**/*.md".into(), "docs/**/*.md".into()]
}

impl Default for Config {
    fn default() -> Self {
        Self {
            columns: default_columns(),
            docs: default_docs(),
            theme: Theme::default(),
            agent: AgentConfig::default(),
        }
    }
}

impl Config {
    /// Required column IDs that define the core workflow.
    const REQUIRED_COLUMNS: &'static [&'static str] =
        &["backlog", "todo", "in-progress", "review", "done"];

    /// Create a config with specific columns (and default docs/theme).
    pub fn with_columns(columns: Vec<Column>) -> Self {
        Self {
            columns,
            ..Self::default()
        }
    }

    /// Load config from `.untask/config.yml`.
    /// Missing config falls back to defaults; invalid config also falls back for compatibility.
    pub fn load(project_root: &Path) -> Self {
        Self::load_strict(project_root).unwrap_or_default()
    }

    /// Load config from `.untask/config.yml`, surfacing invalid config as an error.
    pub fn load_strict(project_root: &Path) -> Result<Self> {
        let config_path = project_root.join(".untask/config.yml");
        let content = match std::fs::read_to_string(&config_path) {
            Ok(c) => c,
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(Self::default()),
            Err(err) => return Err(err.into()),
        };

        let config = serde_yaml::from_str::<Config>(&content)?;
        config.validate_doc_globs()?;
        Ok(config)
    }

    /// Validate doc globs: reject absolute paths and `../` traversal.
    pub fn validate_doc_globs(&self) -> Result<()> {
        for glob in &self.docs {
            if looks_like_windows_absolute(glob) || Path::new(glob).is_absolute() {
                return Err(UntaskError::InvalidConfig(format!(
                    "absolute doc glob path not allowed: {glob}"
                )));
            }

            let normalized = glob.replace('\\', "/");
            if Path::new(&normalized)
                .components()
                .any(|component| matches!(component, Component::ParentDir))
            {
                return Err(UntaskError::InvalidConfig(format!(
                    "parent traversal not allowed in doc glob: {glob}"
                )));
            }
        }
        Ok(())
    }

    /// Resolve a raw status string to a canonical column ID.
    pub fn normalize_status(&self, raw: &str) -> Option<String> {
        let normalized = raw.trim().to_lowercase();
        for col in &self.columns {
            if col.id == normalized {
                return Some(col.id.clone());
            }
            for alias in &col.aliases {
                if alias.to_lowercase() == normalized {
                    return Some(col.id.clone());
                }
            }
        }
        None
    }

    /// Return the first column ID (default status for new tasks).
    pub fn default_status(&self) -> String {
        self.columns
            .first()
            .map(|c| c.id.clone())
            .unwrap_or_else(|| "backlog".into())
    }

    /// Return the first terminal (done) column ID.
    pub fn done_status(&self) -> String {
        self.columns
            .iter()
            .find(|column| column.done)
            .map(|column| column.id.clone())
            .unwrap_or_else(|| "done".into())
    }

    /// Check if a status resolves to a terminal (done) column.
    pub fn is_done_status(&self, raw: &str) -> bool {
        self.normalize_status(raw)
            .and_then(|id| self.columns.iter().find(|c| c.id == id))
            .is_some_and(|c| c.done)
    }

    /// Save config to `.untask/config.yml`.
    pub fn save(&self, project_root: &Path) -> Result<()> {
        let config_path = project_root.join(".untask/config.yml");
        let content = serde_yaml::to_string(self)
            .map_err(|e| UntaskError::InvalidConfig(format!("failed to serialize config: {e}")))?;
        atomic_write(&config_path, content.as_bytes())?;
        Ok(())
    }

    // ── Column operations ────────────────────────────────────────

    /// Add a new column. Inserts after `after` if given, otherwise appends.
    /// Returns the canonical column ID.
    pub fn column_add(&mut self, name: &str, after: Option<&str>, done: bool) -> Result<String> {
        let id = validate_column_id(name)?;
        self.check_id_available(&id)?;

        let col = Column {
            id: id.clone(),
            aliases: vec![],
            done,
        };

        if let Some(after_id) = after {
            let pos = self.find_column_index(after_id)?;
            self.columns.insert(pos + 1, col);
        } else {
            self.columns.push(col);
        }
        Ok(id)
    }

    /// Rename a column. Old name becomes an alias.
    /// Returns `(old_id, new_id)` so callers can migrate tasks.
    pub fn column_rename(&mut self, old: &str, new: &str) -> Result<(String, String)> {
        let new_id = validate_column_id(new)?;
        self.check_id_available(&new_id)?;
        let idx = self.find_column_index(old)?;

        let old_id = self.columns[idx].id.clone();
        self.ensure_column_is_not_required(&old_id, "rename")?;
        self.columns[idx].aliases.push(old_id.clone());
        self.columns[idx].id = new_id.clone();
        Ok((old_id, new_id))
    }

    /// Move a column before or after another column.
    pub fn column_move(
        &mut self,
        name: &str,
        after: Option<&str>,
        before: Option<&str>,
    ) -> Result<()> {
        let idx = self.find_column_index(name)?;
        let col = self.columns.remove(idx);

        if let Some(after_id) = after {
            let target = self.find_column_index(after_id)?;
            self.columns.insert(target + 1, col);
        } else if let Some(before_id) = before {
            let target = self.find_column_index(before_id)?;
            self.columns.insert(target, col);
        } else {
            return Err(UntaskError::InvalidConfig(
                "column move requires --after or --before".into(),
            ));
        }
        Ok(())
    }

    /// Delete a column. Returns the list of task statuses that need migration.
    /// Caller must handle task migration/deletion before calling this.
    pub fn column_delete(&mut self, name: &str) -> Result<()> {
        if self.columns.len() <= 1 {
            return Err(UntaskError::InvalidConfig(
                "cannot delete the last column".into(),
            ));
        }
        let idx = self.find_column_index(name)?;
        let col_id = &self.columns[idx].id;
        self.ensure_column_is_not_required(col_id, "delete")?;
        self.columns.remove(idx);
        Ok(())
    }

    /// Find column index by ID (case-insensitive).
    fn find_column_index(&self, name: &str) -> Result<usize> {
        let lower = name.trim().to_lowercase();
        self.columns
            .iter()
            .position(|c| c.id == lower)
            .ok_or_else(|| UntaskError::InvalidConfig(format!("column not found: {name}")))
    }

    /// Check that a column ID doesn't collide with existing IDs or aliases.
    fn check_id_available(&self, id: &str) -> Result<()> {
        for col in &self.columns {
            if col.id == *id {
                return Err(UntaskError::InvalidConfig(format!(
                    "column already exists: {id}"
                )));
            }
            for alias in &col.aliases {
                if alias.to_lowercase() == *id {
                    return Err(UntaskError::InvalidConfig(format!(
                        "'{id}' conflicts with alias of column '{}'",
                        col.id
                    )));
                }
            }
        }
        Ok(())
    }

    fn ensure_column_is_not_required(&self, id: &str, action: &str) -> Result<()> {
        if Self::REQUIRED_COLUMNS.contains(&id) {
            return Err(UntaskError::InvalidConfig(format!(
                "cannot {action} required column: {id}"
            )));
        }
        Ok(())
    }
}

/// Validate and normalize a column ID to lowercase kebab-case.
fn validate_column_id(name: &str) -> Result<String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(UntaskError::InvalidConfig(
            "column name cannot be empty".into(),
        ));
    }
    let id: String = trimmed
        .to_lowercase()
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' {
                c
            } else {
                '-'
            }
        })
        .collect();
    // Collapse multiple hyphens and trim leading/trailing hyphens
    let id = id
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    if id.is_empty() {
        return Err(UntaskError::InvalidConfig(
            "column name must contain alphanumeric characters".into(),
        ));
    }
    Ok(id)
}

fn looks_like_windows_absolute(path: &str) -> bool {
    let bytes = path.as_bytes();
    bytes.len() > 2
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && matches!(bytes[2], b'/' | b'\\')
}
