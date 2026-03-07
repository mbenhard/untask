use std::collections::{BTreeMap, HashSet};
use std::path::{Component, Path, PathBuf};

use serde::Serialize;

use crate::config::Config;
use crate::error::{Result, UntaskError};

#[derive(Debug, Clone)]
pub struct Doc {
    pub path: PathBuf,
    pub basename: String,
    pub content: String,
}

#[derive(Debug, Clone)]
pub struct DocRef {
    pub path: PathBuf,
    pub basename: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DocNodeKind {
    Root,
    Folder,
    Doc,
}

#[derive(Debug, Clone, Serialize)]
pub struct DocNode {
    pub node_path: String,
    pub relative_path: String,
    pub name: String,
    pub kind: DocNodeKind,
    pub children: Vec<DocNode>,
    pub can_create: bool,
    pub can_rename: bool,
    pub can_move: bool,
    pub can_delete: bool,
    pub read_only: bool,
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
        self.list_refs()?
            .into_iter()
            .map(|doc| {
                let content = std::fs::read_to_string(&doc.path)?;
                Ok(Doc {
                    path: doc.path,
                    basename: doc.basename,
                    content,
                })
            })
            .collect()
    }

    pub fn list_refs(&self) -> Result<Vec<DocRef>> {
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

                docs.push(DocRef { path, basename });
            }
        }

        docs.sort_by(|left, right| {
            self.relative_path(&left.path)
                .cmp(self.relative_path(&right.path))
        });

        Ok(docs)
    }

    pub fn list_tree(&self) -> Result<Vec<DocNode>> {
        let docs = self.list_refs()?;
        let mut roots = self.root_specs();
        let mut builders: Vec<RootTree> = roots.drain(..).map(RootTree::new).collect();

        for builder in &mut builders {
            builder.collect_existing_directories(&self.project_root)?;
        }

        for doc in &docs {
            let relative = self.relative_path(&doc.path);
            if let Some(index) = self.assign_root(relative, &builders) {
                builders[index].insert_doc(relative, doc);
            }
        }

        Ok(builders.into_iter().map(RootTree::into_node).collect())
    }

    pub fn get(&self, reference: &str) -> Result<Doc> {
        let docs = self.list_refs()?;
        let reference_path = Path::new(reference);

        if let Some(doc) = docs.iter().find(|doc| {
            doc.path == reference_path || self.relative_path(&doc.path) == reference_path
        }) {
            return Ok(Doc {
                path: doc.path.clone(),
                basename: doc.basename.clone(),
                content: std::fs::read_to_string(&doc.path)?,
            });
        }

        let matches: Vec<DocRef> = docs
            .into_iter()
            .filter(|d| d.basename == reference)
            .collect();

        match matches.len() {
            0 => Err(UntaskError::DocNotFound(reference.to_string())),
            1 => {
                let doc = matches.into_iter().next().unwrap();
                Ok(Doc {
                    path: doc.path.clone(),
                    basename: doc.basename,
                    content: std::fs::read_to_string(doc.path)?,
                })
            }
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

    pub fn create_doc(&self, parent_relative: &str, name: &str, content: &str) -> Result<DocRef> {
        let parent = normalize_relative_path(Path::new(parent_relative))?;
        self.ensure_writable_path(&parent)?;

        let filename = normalize_markdown_filename(name)?;
        let full_parent = self.project_root.join(&parent);
        std::fs::create_dir_all(&full_parent)?;

        if !full_parent.is_dir() {
            return Err(UntaskError::CommandFailed(format!(
                "document parent is not a directory: {}",
                parent.display()
            )));
        }

        let full_path = full_parent.join(&filename);
        if full_path.exists() {
            return Err(UntaskError::CommandFailed(format!(
                "path already exists: {}",
                self.relative_path(&full_path).display()
            )));
        }

        std::fs::write(&full_path, content)?;

        Ok(DocRef {
            basename: filename,
            path: full_path,
        })
    }

    pub fn create_folder(&self, parent_relative: &str, name: &str) -> Result<PathBuf> {
        let parent = normalize_relative_path(Path::new(parent_relative))?;
        self.ensure_writable_path(&parent)?;

        let folder_name = validate_folder_name(name)?;
        let full_parent = self.project_root.join(&parent);
        std::fs::create_dir_all(&full_parent)?;

        if !full_parent.is_dir() {
            return Err(UntaskError::CommandFailed(format!(
                "folder parent is not a directory: {}",
                parent.display()
            )));
        }

        let full_path = full_parent.join(&folder_name);
        if full_path.exists() {
            return Err(UntaskError::CommandFailed(format!(
                "path already exists: {}",
                self.relative_path(&full_path).display()
            )));
        }

        std::fs::create_dir_all(&full_path)?;
        Ok(self.relative_path(&full_path).to_path_buf())
    }

    pub fn rename_path(&self, relative_path: &str, new_name: &str) -> Result<PathBuf> {
        let path = normalize_relative_path(Path::new(relative_path))?;
        let root = self
            .matching_writable_root(&path)
            .ok_or_else(|| UntaskError::CommandFailed(format!(
                "path is not inside a writable docs root: {}",
                path.display()
            )))?;
        if path == root {
            return Err(UntaskError::CommandFailed(format!(
                "cannot rename docs root: {}",
                path.display()
            )));
        }

        let full_path = self.project_root.join(&path);
        if !full_path.exists() {
            return Err(UntaskError::CommandFailed(format!(
                "path not found: {}",
                path.display()
            )));
        }

        let target_name = if full_path.is_dir() {
            validate_folder_name(new_name)?
        } else {
            normalize_markdown_filename(new_name)?
        };

        let Some(parent) = path.parent() else {
            return Err(UntaskError::CommandFailed(format!(
                "cannot rename docs root: {}",
                path.display()
            )));
        };

        let target_relative = parent.join(&target_name);
        self.ensure_writable_path(&target_relative)?;
        let target_full = self.project_root.join(&target_relative);

        if target_full.exists() {
            return Err(UntaskError::CommandFailed(format!(
                "path already exists: {}",
                target_relative.display()
            )));
        }

        std::fs::rename(full_path, &target_full)?;
        Ok(target_relative)
    }

    pub fn move_path(&self, relative_path: &str, destination_parent: &str) -> Result<PathBuf> {
        let source = normalize_relative_path(Path::new(relative_path))?;
        let destination_parent = normalize_relative_path(Path::new(destination_parent))?;
        self.ensure_writable_path(&destination_parent)?;

        let source_root = self
            .matching_writable_root(&source)
            .ok_or_else(|| UntaskError::CommandFailed(format!(
                "path is not inside a writable docs root: {}",
                source.display()
            )))?;
        if source == source_root {
            return Err(UntaskError::CommandFailed(format!(
                "cannot move docs root: {}",
                source.display()
            )));
        }
        let destination_root = self
            .matching_writable_root(&destination_parent)
            .ok_or_else(|| UntaskError::CommandFailed(format!(
                "destination is not inside a writable docs root: {}",
                destination_parent.display()
            )))?;

        if source_root != destination_root {
            return Err(UntaskError::CommandFailed(format!(
                "cross-root moves are not supported in v1: {} -> {}",
                source_root.display(),
                destination_root.display()
            )));
        }

        let source_full = self.project_root.join(&source);
        if !source_full.exists() {
            return Err(UntaskError::CommandFailed(format!(
                "path not found: {}",
                source.display()
            )));
        }

        let destination_full = self.project_root.join(&destination_parent);
        if !destination_full.is_dir() {
            return Err(UntaskError::CommandFailed(format!(
                "destination folder not found: {}",
                destination_parent.display()
            )));
        }

        if source_full.is_dir() && destination_parent.starts_with(&source) {
            return Err(UntaskError::CommandFailed(format!(
                "cannot move a folder into itself: {}",
                source.display()
            )));
        }

        let name = source
            .file_name()
            .ok_or_else(|| UntaskError::CommandFailed(format!(
                "cannot move docs root: {}",
                source.display()
            )))?;
        let target_relative = destination_parent.join(name);
        let target_full = self.project_root.join(&target_relative);

        if target_full.exists() {
            return Err(UntaskError::CommandFailed(format!(
                "path already exists: {}",
                target_relative.display()
            )));
        }

        std::fs::rename(source_full, &target_full)?;
        Ok(target_relative)
    }

    pub fn delete_doc(&self, relative_path: &str) -> Result<()> {
        let path = normalize_relative_path(Path::new(relative_path))?;
        self.ensure_writable_path(&path)?;
        let full_path = self.project_root.join(&path);

        if !full_path.is_file() {
            return Err(UntaskError::CommandFailed(format!(
                "document not found: {}",
                path.display()
            )));
        }

        std::fs::remove_file(full_path)?;
        Ok(())
    }

    pub fn delete_folder(&self, relative_path: &str) -> Result<()> {
        let path = normalize_relative_path(Path::new(relative_path))?;
        let root = self
            .matching_writable_root(&path)
            .ok_or_else(|| UntaskError::CommandFailed(format!(
                "path is not inside a writable docs root: {}",
                path.display()
            )))?;

        if path == root {
            return Err(UntaskError::CommandFailed(format!(
                "cannot delete docs root: {}",
                path.display()
            )));
        }

        let full_path = self.project_root.join(&path);
        if !full_path.is_dir() {
            return Err(UntaskError::CommandFailed(format!(
                "folder not found: {}",
                path.display()
            )));
        }

        if std::fs::read_dir(&full_path)?.next().is_some() {
            return Err(UntaskError::CommandFailed(format!(
                "folder is not empty: {}",
                path.display()
            )));
        }

        std::fs::remove_dir(full_path)?;
        Ok(())
    }

    fn assign_root(&self, relative: &Path, roots: &[RootTree]) -> Option<usize> {
        let mut best_writable: Option<(usize, usize)> = None;

        for (index, root) in roots.iter().enumerate() {
            if let Some(base_dir) = root.spec.base_dir.as_ref()
                && relative.starts_with(base_dir)
            {
                let depth = base_dir.components().count();
                match best_writable {
                    Some((_, best_depth)) if best_depth >= depth => {}
                    _ => best_writable = Some((index, depth)),
                }
            }
        }

        if let Some((index, _)) = best_writable {
            return Some(index);
        }

        roots.iter()
            .enumerate()
            .find_map(|(index, root)| {
                if root.spec.base_dir.is_none() && matches_doc_pattern(relative, &root.spec.pattern) {
                    Some(index)
                } else {
                    None
                }
            })
    }

    fn ensure_writable_path(&self, relative: &Path) -> Result<()> {
        if self.matching_writable_root(relative).is_some() {
            Ok(())
        } else {
            Err(UntaskError::CommandFailed(format!(
                "path is not inside a writable docs root: {}",
                relative.display()
            )))
        }
    }

    fn matching_writable_root(&self, relative: &Path) -> Option<PathBuf> {
        self.root_specs()
            .into_iter()
            .filter_map(|root| root.base_dir)
            .filter(|root| relative.starts_with(root))
            .max_by_key(|root| root.components().count())
    }

    fn root_specs(&self) -> Vec<RootSpec> {
        let mut seen = HashSet::new();
        let mut writable = Vec::new();
        let mut browse_only = Vec::new();

        for pattern in self.doc_patterns() {
            if let Some(root_dir) = infer_writable_doc_root(pattern) {
                let key = display_path(&root_dir);
                if seen.insert(format!("root::{key}")) {
                    writable.push(RootSpec {
                        node_path: key.clone(),
                        relative_path: key.clone(),
                        display_name: key,
                        pattern: pattern.clone(),
                        base_dir: Some(root_dir),
                    });
                }
            } else if seen.insert(format!("pattern::{pattern}")) {
                browse_only.push(RootSpec {
                    node_path: format!("pattern::{pattern}"),
                    relative_path: pattern.clone(),
                    display_name: pattern.clone(),
                    pattern: pattern.clone(),
                    base_dir: None,
                });
            }
        }

        writable.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
        writable.extend(browse_only);
        writable
    }

    fn doc_patterns(&self) -> &[String] {
        &self.config.docs
    }

    fn relative_path<'a>(&self, path: &'a Path) -> &'a Path {
        path.strip_prefix(&self.project_root).unwrap_or(path)
    }
}

pub fn infer_writable_doc_root(pattern: &str) -> Option<PathBuf> {
    let normalized = pattern.replace('\\', "/");
    ["/**/*.md", "/*.md"].into_iter().find_map(|suffix| {
        let root = normalized.strip_suffix(suffix)?.trim_end_matches('/');
        if root.is_empty() || has_glob_meta(root) {
            None
        } else {
            Some(PathBuf::from(root))
        }
    })
}

pub fn matches_doc_pattern(relative_path: &Path, pattern: &str) -> bool {
    glob::Pattern::new(pattern)
        .map(|pattern| pattern.matches_path(relative_path))
        .unwrap_or(false)
}

#[derive(Debug, Clone)]
struct RootSpec {
    node_path: String,
    relative_path: String,
    display_name: String,
    pattern: String,
    base_dir: Option<PathBuf>,
}

struct RootTree {
    spec: RootSpec,
    tree: TreeFolder,
}

impl RootTree {
    fn new(spec: RootSpec) -> Self {
        Self {
            spec,
            tree: TreeFolder::default(),
        }
    }

    fn collect_existing_directories(&mut self, project_root: &Path) -> Result<()> {
        let Some(base_dir) = self.spec.base_dir.as_ref() else {
            return Ok(());
        };

        let base_full = project_root.join(base_dir);
        if !base_full.is_dir() {
            return Ok(());
        }

        let mut directories = Vec::new();
        collect_directories(&base_full, Path::new(""), &mut directories)?;
        for directory in directories {
            self.tree.insert_directory(&directory, base_dir);
        }
        Ok(())
    }

    fn insert_doc(&mut self, project_relative: &Path, doc: &DocRef) {
        let (relative_under_root, actual_base) = if let Some(base_dir) = self.spec.base_dir.as_ref() {
            (
                project_relative
                    .strip_prefix(base_dir)
                    .unwrap_or(project_relative),
                base_dir.as_path(),
            )
        } else {
            (project_relative, Path::new(""))
        };

        self.tree
            .insert_doc(relative_under_root, actual_base, &doc.basename, self.spec.base_dir.is_none());
    }

    fn into_node(self) -> DocNode {
        DocNode {
            node_path: self.spec.node_path,
            relative_path: self.spec.relative_path,
            name: self.spec.display_name,
            kind: DocNodeKind::Root,
            children: self.tree.into_children(self.spec.base_dir.is_none()),
            can_create: self.spec.base_dir.is_some(),
            can_rename: false,
            can_move: false,
            can_delete: false,
            read_only: self.spec.base_dir.is_none(),
        }
    }
}

#[derive(Default)]
struct TreeFolder {
    folders: BTreeMap<String, TreeFolderEntry>,
    docs: Vec<DocNode>,
}

struct TreeFolderEntry {
    name: String,
    actual_relative_path: PathBuf,
    folder: TreeFolder,
}

impl TreeFolder {
    fn insert_directory(&mut self, relative_under_root: &Path, actual_base: &Path) {
        let mut current = self;
        let mut actual_path = PathBuf::from(actual_base);

        for segment in path_segments(relative_under_root) {
            actual_path.push(&segment);
            let entry = current
                .folders
                .entry(segment.clone())
                .or_insert_with(|| TreeFolderEntry {
                    name: segment.clone(),
                    actual_relative_path: actual_path.clone(),
                    folder: TreeFolder::default(),
                });
            current = &mut entry.folder;
        }
    }

    fn insert_doc(
        &mut self,
        relative_under_root: &Path,
        actual_base: &Path,
        basename: &str,
        read_only: bool,
    ) {
        let segments = path_segments(relative_under_root);
        if segments.is_empty() {
            return;
        }

        let mut current = self;
        let mut actual_parent = PathBuf::from(actual_base);
        for segment in &segments[..segments.len() - 1] {
            actual_parent.push(segment);
            let entry = current
                .folders
                .entry(segment.clone())
                .or_insert_with(|| TreeFolderEntry {
                    name: segment.clone(),
                    actual_relative_path: actual_parent.clone(),
                    folder: TreeFolder::default(),
                });
            current = &mut entry.folder;
        }

        let mut actual_doc_path = PathBuf::from(actual_base);
        actual_doc_path.push(relative_under_root);
        current.docs.push(DocNode {
            node_path: display_path(&actual_doc_path),
            relative_path: display_path(&actual_doc_path),
            name: basename.to_string(),
            kind: DocNodeKind::Doc,
            children: Vec::new(),
            can_create: false,
            can_rename: !read_only,
            can_move: !read_only,
            can_delete: !read_only,
            read_only,
        });
    }

    fn into_children(self, read_only: bool) -> Vec<DocNode> {
        let mut children = Vec::new();

        for (_, entry) in self.folders {
            children.push(DocNode {
                node_path: display_path(&entry.actual_relative_path),
                relative_path: display_path(&entry.actual_relative_path),
                name: entry.name,
                kind: DocNodeKind::Folder,
                children: entry.folder.into_children(read_only),
                can_create: !read_only,
                can_rename: !read_only,
                can_move: !read_only,
                can_delete: !read_only,
                read_only,
            });
        }

        let mut docs = self.docs;
        docs.sort_by(|left, right| {
            left.name
                .cmp(&right.name)
                .then(left.relative_path.cmp(&right.relative_path))
        });
        children.extend(docs);
        children
    }
}

fn collect_directories(base_dir: &Path, current_relative: &Path, out: &mut Vec<PathBuf>) -> Result<()> {
    let current_dir = if current_relative.as_os_str().is_empty() {
        base_dir.to_path_buf()
    } else {
        base_dir.join(current_relative)
    };

    for entry in std::fs::read_dir(&current_dir)? {
        let entry = entry?;
        if entry.file_type()?.is_dir() {
            let next_relative = current_relative.join(entry.file_name());
            out.push(next_relative.clone());
            collect_directories(base_dir, &next_relative, out)?;
        }
    }

    out.sort();
    Ok(())
}

fn normalize_relative_path(path: &Path) -> Result<PathBuf> {
    if path.is_absolute() {
        return Err(UntaskError::InvalidConfig(format!(
            "absolute paths are not allowed: {}",
            path.display()
        )));
    }

    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::Normal(segment) => normalized.push(segment),
            Component::ParentDir => {
                return Err(UntaskError::InvalidConfig(format!(
                    "parent traversal is not allowed: {}",
                    path.display()
                )));
            }
            Component::Prefix(_) | Component::RootDir => {
                return Err(UntaskError::InvalidConfig(format!(
                    "absolute paths are not allowed: {}",
                    path.display()
                )));
            }
        }
    }
    Ok(normalized)
}

fn normalize_markdown_filename(name: &str) -> Result<String> {
    let normalized = validate_path_segment(name)?;
    if normalized.ends_with(".md") {
        Ok(normalized)
    } else if normalized.contains('.') {
        Err(UntaskError::CommandFailed(format!(
            "documents must use the .md extension: {normalized}"
        )))
    } else {
        Ok(format!("{normalized}.md"))
    }
}

fn validate_folder_name(name: &str) -> Result<String> {
    validate_path_segment(name)
}

fn validate_path_segment(name: &str) -> Result<String> {
    let normalized = name.trim();
    if normalized.is_empty() || normalized == "." || normalized == ".." {
        return Err(UntaskError::CommandFailed(format!(
            "invalid path segment: {name}"
        )));
    }

    if normalized.contains('/') || normalized.contains('\\') {
        return Err(UntaskError::CommandFailed(format!(
            "path separators are not allowed in names: {name}"
        )));
    }

    if normalized.chars().any(|c| matches!(c, '<' | '>' | ':' | '"' | '|' | '?' | '*')) {
        return Err(UntaskError::CommandFailed(format!(
            "invalid filename characters: {name}"
        )));
    }

    Ok(normalized.to_string())
}

fn path_segments(path: &Path) -> Vec<String> {
    path.components()
        .filter_map(|component| match component {
            Component::Normal(segment) => Some(segment.to_string_lossy().to_string()),
            _ => None,
        })
        .collect()
}

fn has_glob_meta(path: &str) -> bool {
    path.chars()
        .any(|ch| matches!(ch, '*' | '?' | '[' | ']' | '{' | '}'))
}

fn display_path(path: &Path) -> String {
    path.display().to_string()
}
