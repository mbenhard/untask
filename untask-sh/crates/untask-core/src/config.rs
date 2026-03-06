use std::path::{Component, Path};

use serde::{Deserialize, Serialize};

use crate::error::{Result, UntaskError};
use crate::types::Theme;

pub const DEFAULT_DOC_GLOB: &str = ".untask/docs/**/*.md";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Column {
    pub id: String,
    #[serde(default)]
    pub aliases: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    #[serde(default = "default_columns")]
    pub columns: Vec<Column>,
    #[serde(default = "default_docs")]
    pub docs: Vec<String>,
    #[serde(default)]
    pub theme: Theme,
}

fn default_columns() -> Vec<Column> {
    vec![
        Column {
            id: "backlog".into(),
            aliases: vec![],
        },
        Column {
            id: "todo".into(),
            aliases: vec!["to-do".into(), "to do".into(), "pending".into()],
        },
        Column {
            id: "in-progress".into(),
            aliases: vec![
                "wip".into(),
                "in progress".into(),
                "doing".into(),
                "working".into(),
            ],
        },
        Column {
            id: "review".into(),
            aliases: vec!["reviewing".into(), "in review".into()],
        },
        Column {
            id: "done".into(),
            aliases: vec!["complete".into(), "finished".into(), "closed".into()],
        },
    ]
}

fn default_docs() -> Vec<String> {
    vec![DEFAULT_DOC_GLOB.into()]
}

impl Default for Config {
    fn default() -> Self {
        Self {
            columns: default_columns(),
            docs: default_docs(),
            theme: Theme::default(),
        }
    }
}

impl Config {
    /// Load config from `.untask/config.yml`. Falls back to defaults on missing or invalid file.
    pub fn load(project_root: &Path) -> Self {
        let config_path = project_root.join(".untask/config.yml");
        let content = match std::fs::read_to_string(&config_path) {
            Ok(c) => c,
            Err(_) => return Self::default(),
        };

        match serde_yaml::from_str::<Config>(&content) {
            Ok(config) if config.validate_doc_globs().is_ok() => config,
            Ok(_) | Err(_) => Self::default(),
        }
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
}

fn looks_like_windows_absolute(path: &str) -> bool {
    let bytes = path.as_bytes();
    bytes.len() > 2
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && matches!(bytes[2], b'/' | b'\\')
}
