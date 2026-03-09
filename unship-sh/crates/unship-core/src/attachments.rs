use std::path::{Component, Path, PathBuf};

use chrono::Utc;

use crate::error::{Result, UnshipError};
use crate::task::AttachmentRef;

/// Directory for a task's attachments.
pub fn attachments_dir(project_root: &Path, task_id: u32) -> PathBuf {
    project_root.join(format!(".unship/attachments/{task_id}"))
}

/// Maximum attachment size (25 MB).
pub const MAX_ATTACHMENT_SIZE: u64 = 25 * 1024 * 1024;

/// Guess MIME type from file extension.
fn mime_from_ext(ext: &str) -> &'static str {
    match ext.to_lowercase().as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "pdf" => "application/pdf",
        "txt" => "text/plain",
        "md" => "text/markdown",
        "json" => "application/json",
        "csv" => "text/csv",
        "log" => "text/plain",
        "yaml" | "yml" => "application/yaml",
        "xml" => "application/xml",
        "zip" => "application/zip",
        "html" | "htm" => "text/html",
        _ => "application/octet-stream",
    }
}

/// Validate an attachment filename so it always stays a single basename.
pub fn validate_attachment_filename(filename: &str) -> Result<String> {
    let trimmed = filename.trim();
    if trimmed.is_empty() || trimmed == "." || trimmed == ".." {
        return Err(UnshipError::InvalidConfig(format!(
            "invalid attachment filename: {filename}"
        )));
    }

    let path = Path::new(trimmed);
    let mut components = path.components();
    let first = components.next();
    let has_extra = components.next().is_some();
    let only_normal = matches!(first, Some(Component::Normal(_))) && !has_extra;
    let basename_matches = path
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name == trimmed);

    if !only_normal || !basename_matches || trimmed.contains(['/', '\\']) {
        return Err(UnshipError::InvalidConfig(format!(
            "invalid attachment filename: {filename}"
        )));
    }

    Ok(trimmed.to_string())
}

/// Resolve a collision-free filename in the target directory.
fn resolve_filename(dir: &Path, original: &str) -> String {
    if !dir.join(original).exists() {
        return original.to_string();
    }
    let stem = Path::new(original)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(original);
    let ext = Path::new(original)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("");
    for i in 1..1000 {
        let candidate = if ext.is_empty() {
            format!("{stem}-{i}")
        } else {
            format!("{stem}-{i}.{ext}")
        };
        if !dir.join(&candidate).exists() {
            return candidate;
        }
    }
    // Fallback: timestamp-based
    let ts = Utc::now().timestamp_millis();
    if ext.is_empty() {
        format!("{stem}-{ts}")
    } else {
        format!("{stem}-{ts}.{ext}")
    }
}

/// Copy a file into the task's attachments directory.
/// Returns the AttachmentRef for the new attachment.
pub fn add_attachment(
    project_root: &Path,
    task_id: u32,
    source_path: &Path,
) -> Result<AttachmentRef> {
    if !source_path.is_file() {
        return Err(UnshipError::Io(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("file not found: {}", source_path.display()),
        )));
    }

    let metadata = std::fs::metadata(source_path)?;
    if metadata.len() > MAX_ATTACHMENT_SIZE {
        return Err(UnshipError::InvalidConfig(format!(
            "file too large: {} bytes (max {} bytes)",
            metadata.len(),
            MAX_ATTACHMENT_SIZE
        )));
    }

    let dir = attachments_dir(project_root, task_id);
    std::fs::create_dir_all(&dir)?;

    let original_name = source_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("attachment");
    let original_name = validate_attachment_filename(original_name)?;
    let filename = resolve_filename(&dir, &original_name);

    let dest = attachment_path(project_root, task_id, &filename)?;
    std::fs::copy(source_path, &dest)?;

    let ext = source_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");

    Ok(AttachmentRef {
        filename,
        mime_type: mime_from_ext(ext).to_string(),
        size: metadata.len(),
        created: Utc::now(),
    })
}

/// Delete an attachment file from disk.
pub fn remove_attachment(project_root: &Path, task_id: u32, filename: &str) -> Result<()> {
    let path = attachment_path(project_root, task_id, filename)?;
    if path.is_file() {
        std::fs::remove_file(&path)?;
    }
    cleanup_attachments_dir(project_root, task_id)?;
    Ok(())
}

/// Delete all attachments for a task (used when deleting a task).
pub fn remove_all_attachments(project_root: &Path, task_id: u32) -> Result<()> {
    let dir = attachments_dir(project_root, task_id);
    if dir.is_dir() {
        std::fs::remove_dir_all(&dir)?;
    }
    Ok(())
}

/// Write raw bytes as an attachment (used for clipboard paste).
/// Returns the AttachmentRef for the new attachment.
pub fn add_attachment_bytes(
    project_root: &Path,
    task_id: u32,
    data: &[u8],
    filename: &str,
    mime_type: &str,
) -> Result<AttachmentRef> {
    if data.len() as u64 > MAX_ATTACHMENT_SIZE {
        return Err(UnshipError::InvalidConfig(format!(
            "data too large: {} bytes (max {} bytes)",
            data.len(),
            MAX_ATTACHMENT_SIZE
        )));
    }

    let dir = attachments_dir(project_root, task_id);
    std::fs::create_dir_all(&dir)?;

    let validated = validate_attachment_filename(filename)?;
    let resolved = resolve_filename(&dir, &validated);
    let dest = attachment_path(project_root, task_id, &resolved)?;
    std::fs::write(&dest, data)?;

    Ok(AttachmentRef {
        filename: resolved,
        mime_type: mime_type.to_string(),
        size: data.len() as u64,
        created: Utc::now(),
    })
}

/// Get the absolute path to an attachment file.
pub fn attachment_path(project_root: &Path, task_id: u32, filename: &str) -> Result<PathBuf> {
    let filename = validate_attachment_filename(filename)?;
    let dir = attachments_dir(project_root, task_id);
    let path = dir.join(&filename);
    if !path.starts_with(&dir) || path.parent() != Some(dir.as_path()) {
        return Err(UnshipError::InvalidConfig(format!(
            "invalid attachment filename: {filename}"
        )));
    }
    Ok(path)
}

/// Remove the task attachment directory when it becomes empty.
pub fn cleanup_attachments_dir(project_root: &Path, task_id: u32) -> Result<()> {
    let dir = attachments_dir(project_root, task_id);
    if dir.is_dir() && std::fs::read_dir(&dir)?.next().is_none() {
        let _ = std::fs::remove_dir(&dir);
    }
    Ok(())
}
