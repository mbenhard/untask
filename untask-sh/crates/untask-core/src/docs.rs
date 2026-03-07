use std::collections::HashSet;
use std::path::{Path, PathBuf};

use crate::config::Config;
use crate::error::{Result, UntaskError};

#[derive(Debug, Clone)]
pub struct Doc {
    pub path: PathBuf,
    pub basename: String,
    pub content: String,
}

pub struct DocsStore {
    project_root: PathBuf,
    config: Config,
}

impl DocsStore {
    pub fn new(project_root: PathBuf) -> Self {
        let config = Config::load(&project_root);
        Self {
            project_root,
            config,
        }
    }

    pub fn list(&self) -> Result<Vec<Doc>> {
        let mut seen = HashSet::new();
        let mut docs = Vec::new();

        for pattern in self.doc_patterns() {
            let full_pattern = self.project_root.join(pattern);
            let full_pattern_str = full_pattern.to_string_lossy();

            let entries = glob::glob(&full_pattern_str)
                .map_err(|e| UntaskError::InvalidConfig(format!("invalid glob pattern: {e}")))?;

            for entry in entries {
                let path = entry.map_err(|e| e.into_error())?;

                if !path.is_file() {
                    continue;
                }

                let canonical = path.canonicalize()?;
                if !seen.insert(canonical) {
                    continue;
                }

                let basename = path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();

                let content = std::fs::read_to_string(&path)?;

                docs.push(Doc {
                    path,
                    basename,
                    content,
                });
            }
        }

        docs.sort_by(|left, right| {
            self.relative_path(&left.path)
                .cmp(self.relative_path(&right.path))
        });

        Ok(docs)
    }

    pub fn get(&self, reference: &str) -> Result<Doc> {
        let docs = self.list()?;
        let reference_path = Path::new(reference);

        if let Some(doc) = docs.iter().find(|doc| {
            doc.path == reference_path || self.relative_path(&doc.path) == reference_path
        }) {
            return Ok(doc.clone());
        }

        let matches: Vec<Doc> = docs
            .into_iter()
            .filter(|d| d.basename == reference)
            .collect();

        match matches.len() {
            0 => Err(UntaskError::DocNotFound(reference.to_string())),
            1 => Ok(matches.into_iter().next().unwrap()),
            _ => {
                let paths: Vec<String> = matches
                    .iter()
                    .map(|d| self.relative_path(&d.path).display().to_string())
                    .collect();
                Err(UntaskError::Ambiguous(
                    reference.to_string(),
                    paths.join(", "),
                ))
            }
        }
    }

    fn doc_patterns(&self) -> &[String] {
        &self.config.docs
    }

    fn relative_path<'a>(&self, path: &'a Path) -> &'a Path {
        path.strip_prefix(&self.project_root).unwrap_or(path)
    }
}
