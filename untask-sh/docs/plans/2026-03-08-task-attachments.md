# Task Attachments Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add file attachment support to tasks — users can attach, view, and remove files (images, PDFs, text, etc.) from the task detail modal, with files stored locally in `.untask/attachments/`. Supports three input methods: file dialog, drag-and-drop, and CMD+V clipboard paste for images.

**Architecture:** Attachment metadata (filename, MIME type, size, timestamp) lives in the task's YAML frontmatter as a `Vec<AttachmentRef>`. Actual files are copied into `.untask/attachments/{task_id}/{filename}`. Tauri commands handle file copy/delete, frontend uses a Svelte 5 component integrated into `TaskModal.svelte`. Image attachments get inline thumbnails; other file types show an icon + filename. Clipboard paste uses the browser's native `paste` event to capture image blobs, sends raw bytes to a dedicated `attach_file_bytes` Tauri command that writes directly to disk.

**Tech Stack:** Rust (untask-core), Tauri 2 IPC + file dialog, Svelte 5 + Bits UI, Tailwind CSS (monochrome design language)

---

## Key Decisions

### 1. Where to store attachment metadata

**Decision: YAML frontmatter on the Task struct.**

Rationale:
- Consistent with every other task field (tags, priority, owner, etc.)
- Atomic persistence — one `serialize_task()` call persists everything
- No separate metadata files to manage or keep in sync
- Serde handles serialization automatically

Alternative considered: Separate JSON metadata files per attachment. Rejected because it adds file management complexity with no benefit for the expected scale.

### 2. Where to store attachment files

**Decision: `.untask/attachments/{task_id}/{filename}` with collision handling.**

Layout:
```
.untask/attachments/
  42/
    screenshot.png
    error-log.txt
    screenshot-1.png      ← collision: appended suffix
```

Rationale:
- Per-task subdirectories keep things organized and simplify cleanup on task delete
- Original filenames are human-readable (important for git-tracked projects)
- `.untask/attachments/` directory already exists (created by `init.rs:19`)
- Collision handling appends `-1`, `-2`, etc. to the stem

Alternative considered: UUID-based filenames (`{uuid}.{ext}`). Rejected because it sacrifices human readability in the file system and in git diffs for no real benefit at this scale.

### 3. File size limits

**Decision: 25 MB per file, configurable later.**

Rationale:
- Tasks are local-first, git-tracked — huge files bloat the repo
- 25 MB covers screenshots, PDFs, logs, and small media
- Can be made configurable via `config.yml` later if needed

### 4. How to serve files for preview

**Decision: Use Tauri's `tauri::api::path` to resolve absolute paths, convert to `asset:` protocol URLs.**

Tauri 2 supports `asset:` protocol for serving local files to the webview. This avoids base64 encoding and keeps previews fast.

Alternative considered: Read file bytes via IPC command and create blob URLs. Viable fallback if `asset:` protocol has CORS issues.

### 5. Input methods: file dialog, drag-and-drop, clipboard paste

**Decision: Support all three.**
- **File dialog:** Use Tauri's `@tauri-apps/plugin-dialog` `open()` for the button. Returns file path(s) directly.
- **Drag-and-drop:** Tauri 2 has `dragDropEnabled: false` in config currently. Enable it selectively or use Tauri's `onDragDropEvent` listener. Passes file paths to the same Rust `attach_file` command.
- **CMD+V clipboard paste:** Use the browser's native `paste` event on the modal. When a user pastes an image, `event.clipboardData.items` gives us the blob. Since `attach_file` expects a file path (not bytes), we need a new Tauri command `attach_file_bytes` that accepts raw bytes + filename + MIME type, writes them to disk, and returns the `AttachmentRef`. This avoids the temp file dance on the frontend side.

### 6. Clipboard paste flow

**Decision: New `attach_file_bytes` Tauri command.**

Flow:
1. User presses CMD+V in the task modal
2. Browser `paste` event fires → check `clipboardData.items` for image types
3. If image found: read blob as `ArrayBuffer` → convert to `Uint8Array`
4. Call `attach_file_bytes(taskId, bytes, filename, mimeType)` via Tauri IPC
5. Rust side writes bytes to `.untask/attachments/{task_id}/{filename}`, creates `AttachmentRef`
6. Task frontmatter updated, UI refreshes

Generated filename pattern: `paste-{timestamp}.{ext}` (e.g., `paste-1709913600.png`)

No additional plugins needed — the browser's native Clipboard API works in Tauri's webview.

### 7. Attachment indicator on kanban cards

**Decision: Show a small paperclip icon with count.** Only when `attachments.len() > 0`. Monochrome, 10px, bottom-right of the card alongside existing indicators.

---

## Risks & Considerations

1. **Git bloat** — Binary attachments in `.untask/attachments/` will bloat the git repo. Consider adding `.untask/attachments/` to `.gitignore` by default, or at least documenting the trade-off. Could offer a config option `attachments.gitignore: true`.

2. **File watcher events** — The desktop app uses `notify` to watch `.untask/` for changes. Copying files into `attachments/` will trigger watcher events. Ensure the watcher doesn't cause unnecessary reloads or handle attachment file events gracefully.

2b. **Drag-drop disabled** — `tauri.conf.json` currently has `"dragDropEnabled": false`. We may need to enable this (or use Tauri's `onDragDropEvent` API) for OS-level file drops. Test that enabling it doesn't break existing kanban drag-and-drop behavior (which uses HTML5 DnD, not Tauri's drag-drop).

3. **Orphaned files** — If a task is deleted, its attachments should be cleaned up. The `TaskStore::delete()` method needs to also remove `.untask/attachments/{task_id}/`. If an attachment is removed from frontmatter, its file should also be deleted.

4. **Tauri asset protocol** — Need to register the asset scope in `tauri.conf.json` to allow the webview to access files in `.untask/attachments/`. This is a security-scoped access control in Tauri 2.

5. **Concurrent access** — The existing `ProjectLock` mechanism should be used when modifying attachments to prevent race conditions.

6. **MIME type detection** — Use file extension mapping rather than pulling in a heavy MIME detection library. A simple match on common extensions (png, jpg, pdf, txt, md, etc.) is sufficient.

---

## Affected Files

### New files
- `crates/untask-core/src/attachments.rs` — attachment CRUD operations
- `apps/desktop/src/lib/components/AttachmentList.svelte` — attachment list + drop zone UI

### Modified files
- `crates/untask-core/src/task.rs` — add `AttachmentRef` struct, `attachments` field
- `crates/untask-core/src/store.rs` — clean up attachments on task delete
- `crates/untask-core/src/lib.rs` — export `attachments` module
- `apps/desktop/src-tauri/src/commands.rs` — add `attach_file`, `attach_file_bytes`, `delete_attachment`, `get_attachment_path` commands; extend `TaskDto`
- `apps/desktop/src-tauri/src/lib.rs` — register new commands
- `apps/desktop/src/lib/api.ts` — add TypeScript types and API functions
- `apps/desktop/src/lib/components/TaskModal.svelte` — integrate AttachmentList
- `apps/desktop/src/lib/components/Kanban.svelte` — add attachment count indicator to cards

### Test files
- `crates/untask-core/tests/attachments_test.rs` — integration tests for attachment CRUD
- `apps/desktop/src-tauri/src/commands.rs` (existing tests module) — extend with attachment command tests

---

## Implementation Tasks

### Task 1: Add AttachmentRef struct and field to Task

**Files:**
- Modify: `crates/untask-core/src/task.rs`

**Step 1: Add the AttachmentRef struct**

Add after the `Task` struct definition:

```rust
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AttachmentRef {
    pub filename: String,
    pub mime_type: String,
    pub size: u64,
    pub created: DateTime<Utc>,
}
```

**Step 2: Add attachments field to Task struct**

Add to the `Task` struct:

```rust
#[serde(default, skip_serializing_if = "Vec::is_empty")]
pub attachments: Vec<AttachmentRef>,
```

**Step 3: Add attachments field to TaskFrontmatter struct**

Add to the `TaskFrontmatter` struct:

```rust
#[serde(default)]
attachments: Vec<AttachmentRef>,
```

**Step 4: Wire it through From<TaskFrontmatter>**

In the `From<TaskFrontmatter> for Task` impl, add:

```rust
attachments: frontmatter.attachments,
```

**Step 5: Verify serialization round-trips**

Run: `cargo test -p untask-core`

**Step 6: Commit**

```
feat: add AttachmentRef struct and attachments field to Task
```

---

### Task 2: Create attachments module with CRUD operations

**Files:**
- Create: `crates/untask-core/src/attachments.rs`
- Modify: `crates/untask-core/src/lib.rs`

**Step 1: Create the attachments module**

```rust
use std::path::{Path, PathBuf};
use chrono::Utc;
use crate::error::{Result, UntaskError};
use crate::task::AttachmentRef;

/// Directory for a task's attachments.
fn attachments_dir(project_root: &Path, task_id: u32) -> PathBuf {
    project_root.join(format!(".untask/attachments/{task_id}"))
}

/// Maximum attachment size (25 MB).
const MAX_ATTACHMENT_SIZE: u64 = 25 * 1024 * 1024;

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
        "zip" => "application/zip",
        "html" | "htm" => "text/html",
        _ => "application/octet-stream",
    }
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
    // Validate source exists
    if !source_path.is_file() {
        return Err(UntaskError::Io(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("file not found: {}", source_path.display()),
        )));
    }

    // Check file size
    let metadata = std::fs::metadata(source_path)?;
    if metadata.len() > MAX_ATTACHMENT_SIZE {
        return Err(UntaskError::InvalidConfig(format!(
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
    let filename = resolve_filename(&dir, original_name);

    let dest = dir.join(&filename);
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
pub fn remove_attachment(
    project_root: &Path,
    task_id: u32,
    filename: &str,
) -> Result<()> {
    let path = attachments_dir(project_root, task_id).join(filename);
    if path.is_file() {
        std::fs::remove_file(&path)?;
    }
    // Clean up empty directory
    let dir = attachments_dir(project_root, task_id);
    if dir.is_dir() {
        if std::fs::read_dir(&dir)?.next().is_none() {
            let _ = std::fs::remove_dir(&dir);
        }
    }
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
        return Err(UntaskError::InvalidConfig(format!(
            "data too large: {} bytes (max {} bytes)",
            data.len(),
            MAX_ATTACHMENT_SIZE
        )));
    }

    let dir = attachments_dir(project_root, task_id);
    std::fs::create_dir_all(&dir)?;

    let resolved = resolve_filename(&dir, filename);
    let dest = dir.join(&resolved);
    std::fs::write(&dest, data)?;

    Ok(AttachmentRef {
        filename: resolved,
        mime_type: mime_type.to_string(),
        size: data.len() as u64,
        created: Utc::now(),
    })
}

/// Get the absolute path to an attachment file.
pub fn attachment_path(
    project_root: &Path,
    task_id: u32,
    filename: &str,
) -> PathBuf {
    attachments_dir(project_root, task_id).join(filename)
}
```

**Step 2: Export the module in lib.rs**

Add `pub mod attachments;` to `crates/untask-core/src/lib.rs`.

**Step 3: Verify it compiles**

Run: `cargo check -p untask-core`

**Step 4: Commit**

```
feat: add attachments module with add, remove, and path operations
```

---

### Task 3: Wire attachment cleanup into TaskStore::delete

**Files:**
- Modify: `crates/untask-core/src/store.rs`

**Step 1: Import and call cleanup on delete**

In `TaskStore::delete()`, after `std::fs::remove_file(&path)?;`, add:

```rust
if let Some(id) = task.id {
    let _ = crate::attachments::remove_all_attachments(&self.project_root, id);
}
```

Also add cleanup in `delete_tasks_by_status()` for the same pattern.

**Step 2: Verify existing tests pass**

Run: `cargo test -p untask-core`

**Step 3: Commit**

```
fix: clean up attachment files when deleting tasks
```

---

### Task 4: Write integration tests for attachments

**Files:**
- Create: `crates/untask-core/tests/attachments_test.rs`

**Step 1: Write tests**

```rust
use std::fs;
use tempfile::TempDir;
use untask_core::attachments;

fn setup() -> TempDir {
    let tmp = TempDir::new().unwrap();
    untask_core::init::init(tmp.path(), None).unwrap();
    tmp
}

#[test]
fn add_and_remove_attachment() {
    let tmp = setup();
    let source = tmp.path().join("test-file.txt");
    fs::write(&source, "hello world").unwrap();

    let att = attachments::add_attachment(tmp.path(), 1, &source).unwrap();
    assert_eq!(att.filename, "test-file.txt");
    assert_eq!(att.mime_type, "text/plain");
    assert_eq!(att.size, 11);

    let stored = attachments::attachment_path(tmp.path(), 1, &att.filename);
    assert!(stored.is_file());

    attachments::remove_attachment(tmp.path(), 1, &att.filename).unwrap();
    assert!(!stored.exists());
}

#[test]
fn filename_collision_handling() {
    let tmp = setup();
    let source = tmp.path().join("file.png");
    fs::write(&source, "fake png 1").unwrap();

    let a1 = attachments::add_attachment(tmp.path(), 1, &source).unwrap();
    assert_eq!(a1.filename, "file.png");

    fs::write(&source, "fake png 2").unwrap();
    let a2 = attachments::add_attachment(tmp.path(), 1, &source).unwrap();
    assert_eq!(a2.filename, "file-1.png");
}

#[test]
fn rejects_oversized_file() {
    let tmp = setup();
    let source = tmp.path().join("huge.bin");
    // Create a file just over the limit
    let data = vec![0u8; 26 * 1024 * 1024];
    fs::write(&source, &data).unwrap();

    let result = attachments::add_attachment(tmp.path(), 1, &source);
    assert!(result.is_err());
}

#[test]
fn add_attachment_from_bytes() {
    let tmp = setup();
    let data = b"fake png data";

    let att = attachments::add_attachment_bytes(
        tmp.path(), 1, data, "paste-1234.png", "image/png",
    ).unwrap();

    assert_eq!(att.filename, "paste-1234.png");
    assert_eq!(att.mime_type, "image/png");
    assert_eq!(att.size, data.len() as u64);

    let stored = attachments::attachment_path(tmp.path(), 1, &att.filename);
    assert!(stored.is_file());
    assert_eq!(std::fs::read(&stored).unwrap(), data);
}

#[test]
fn remove_all_cleans_directory() {
    let tmp = setup();
    let s1 = tmp.path().join("a.txt");
    let s2 = tmp.path().join("b.txt");
    fs::write(&s1, "a").unwrap();
    fs::write(&s2, "b").unwrap();

    attachments::add_attachment(tmp.path(), 1, &s1).unwrap();
    attachments::add_attachment(tmp.path(), 1, &s2).unwrap();

    let dir = tmp.path().join(".untask/attachments/1");
    assert!(dir.is_dir());

    attachments::remove_all_attachments(tmp.path(), 1).unwrap();
    assert!(!dir.exists());
}
```

**Step 2: Run tests**

Run: `cargo test -p untask-core --test attachments_test`

**Step 3: Commit**

```
test: add integration tests for attachment CRUD operations
```

---

### Task 5: Add Tauri commands for attachments

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`

**Step 1: Extend TaskDto with attachments**

Add to `TaskDto`:

```rust
pub attachments: Vec<AttachmentRefDto>,
```

Add the DTO struct:

```rust
#[derive(Serialize)]
pub struct AttachmentRefDto {
    pub filename: String,
    pub mime_type: String,
    pub size: u64,
    pub created: DateTime<Utc>,
}
```

Update `From<Task> for TaskDto` to include:

```rust
attachments: task.attachments.iter().map(|a| AttachmentRefDto {
    filename: a.filename.clone(),
    mime_type: a.mime_type.clone(),
    size: a.size,
    created: a.created,
}).collect(),
```

**Step 2: Add attach_file command**

```rust
#[tauri::command]
pub fn attach_file(
    id: u32,
    file_path: String,
    state: State<'_, AppState>,
) -> Result<TaskDto, String> {
    let root = require_project(&state)?;
    let store = TaskStore::new(root.clone()).map_err(|e| e.to_string())?;
    let mut task = store.get(id).map_err(|e| e.to_string())?;

    let source = std::path::PathBuf::from(&file_path);
    let att = untask_core::attachments::add_attachment(&root, id, &source)
        .map_err(|e| e.to_string())?;

    task.attachments.push(att);

    // Persist updated attachment list
    let updated = store.update(id, TaskUpdate::default()).map_err(|e| e.to_string())?;
    // Need a way to persist attachments — see note below
    Ok(TaskDto::from(updated))
}
```

**NOTE:** The current `TaskUpdate` struct doesn't include an `attachments` field. Two options:
1. Add `attachments: Option<Vec<AttachmentRef>>` to `TaskUpdate` and handle it in `TaskStore::update()`.
2. Have `attach_file` directly modify the task file. Option 1 is cleaner.

Add to `TaskUpdate` in `store.rs`:

```rust
pub attachments: Option<Vec<crate::task::AttachmentRef>>,
```

And in `TaskStore::update()`:

```rust
if let Some(attachments) = updates.attachments {
    task.attachments = attachments;
}
```

Then the attach_file command becomes:

```rust
#[tauri::command]
pub fn attach_file(
    id: u32,
    file_path: String,
    state: State<'_, AppState>,
) -> Result<TaskDto, String> {
    let root = require_project(&state)?;
    let store = TaskStore::new(root.clone()).map_err(|e| e.to_string())?;
    let task = store.get(id).map_err(|e| e.to_string())?;

    let source = std::path::PathBuf::from(&file_path);
    let att = untask_core::attachments::add_attachment(&root, id, &source)
        .map_err(|e| e.to_string())?;

    let mut new_attachments = task.attachments.clone();
    new_attachments.push(att);

    let updated = store
        .update(id, TaskUpdate { attachments: Some(new_attachments), ..TaskUpdate::default() })
        .map_err(|e| e.to_string())?;
    Ok(TaskDto::from(updated))
}
```

**Step 3: Add attach_file_bytes command** (for clipboard paste)

```rust
#[tauri::command]
pub fn attach_file_bytes(
    id: u32,
    data: Vec<u8>,
    filename: String,
    mime_type: String,
    state: State<'_, AppState>,
) -> Result<TaskDto, String> {
    let root = require_project(&state)?;
    let store = TaskStore::new(root.clone()).map_err(|e| e.to_string())?;
    let task = store.get(id).map_err(|e| e.to_string())?;

    let att = untask_core::attachments::add_attachment_bytes(
        &root, id, &data, &filename, &mime_type,
    ).map_err(|e| e.to_string())?;

    let mut new_attachments = task.attachments.clone();
    new_attachments.push(att);

    let updated = store
        .update(id, TaskUpdate { attachments: Some(new_attachments), ..TaskUpdate::default() })
        .map_err(|e| e.to_string())?;
    Ok(TaskDto::from(updated))
}
```

**Step 4: Add delete_attachment command**

```rust
#[tauri::command]
pub fn delete_attachment(
    id: u32,
    filename: String,
    state: State<'_, AppState>,
) -> Result<TaskDto, String> {
    let root = require_project(&state)?;
    let store = TaskStore::new(root.clone()).map_err(|e| e.to_string())?;
    let task = store.get(id).map_err(|e| e.to_string())?;

    untask_core::attachments::remove_attachment(&root, id, &filename)
        .map_err(|e| e.to_string())?;

    let new_attachments: Vec<_> = task.attachments
        .into_iter()
        .filter(|a| a.filename != filename)
        .collect();

    let updated = store
        .update(id, TaskUpdate { attachments: Some(new_attachments), ..TaskUpdate::default() })
        .map_err(|e| e.to_string())?;
    Ok(TaskDto::from(updated))
}
```

**Step 5: Add get_attachment_path command** (for preview URLs)

```rust
#[tauri::command]
pub fn get_attachment_path(
    id: u32,
    filename: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let root = require_project(&state)?;
    let path = untask_core::attachments::attachment_path(&root, id, &filename);
    if !path.is_file() {
        return Err(format!("attachment not found: {filename}"));
    }
    Ok(path.display().to_string())
}
```

**Step 6: Register commands in lib.rs**

Add to the `generate_handler![]` macro:

```rust
commands::attach_file,
commands::attach_file_bytes,
commands::delete_attachment,
commands::get_attachment_path,
```

**Step 7: Verify it compiles**

Run: `cargo check -p untask-desktop`

**Step 8: Commit**

```
feat: add Tauri commands for attach_file, attach_file_bytes, delete_attachment, get_attachment_path
```

---

### Task 6: Add TypeScript API functions

**Files:**
- Modify: `apps/desktop/src/lib/api.ts`

**Step 1: Add AttachmentRef type**

```typescript
export interface AttachmentRefDto {
  filename: string;
  mime_type: string;
  size: number;
  created: string;
}
```

**Step 2: Extend TaskDto**

Add to the `TaskDto` interface:

```typescript
attachments: AttachmentRefDto[];
```

**Step 3: Add API functions**

```typescript
// ── Attachments ─────────────────────────────────────────────────────

export function attachFile(id: number, filePath: string): Promise<TaskDto> {
  return invoke("attach_file", { id, filePath });
}

export function attachFileBytes(
  id: number,
  data: number[],
  filename: string,
  mimeType: string,
): Promise<TaskDto> {
  return invoke("attach_file_bytes", { id, data, filename, mimeType });
}

export function deleteAttachment(id: number, filename: string): Promise<TaskDto> {
  return invoke("delete_attachment", { id, filename });
}

export function getAttachmentPath(id: number, filename: string): Promise<string> {
  return invoke("get_attachment_path", { id, filename });
}
```

Note: `data` is `number[]` because Tauri IPC serializes `Vec<u8>` from a JS array of numbers. Convert `Uint8Array` to `Array.from(uint8Array)` before calling.

**Step 4: Commit**

```
feat: add TypeScript API types and functions for attachments
```

---

### Task 7: Create AttachmentList.svelte component

**Files:**
- Create: `apps/desktop/src/lib/components/AttachmentList.svelte`

**Step 1: Build the component**

This component follows the exact same pattern as `SubtaskList.svelte`:
- Bordered section with header label
- Lists attachments as compact rows
- Each row shows: file icon or thumbnail, filename, size, delete button on hover
- Drop zone for drag-and-drop
- Button to open file dialog
- Uses `tauri-plugin-dialog` for native file picker

Key design language compliance:
- Header: "Attachments" in 10px uppercase mono
- Rows: 32px min-height, border-b border-border/40
- File size in 10px mono text-muted-foreground
- Delete button: opacity-0, group-hover:opacity-100
- Drop zone: dashed border when dragging over
- "+ attachment" button in 10px mono (matches "+ subtask" pattern)

For image previews: render a small thumbnail (32x32px, rounded-[4px]) using `convertFileSrc()` from `@tauri-apps/api/core`.

For non-images: render a small file icon (12x12 SVG).

```svelte
<script lang="ts">
  import { open } from "@tauri-apps/plugin-dialog";
  import { convertFileSrc } from "@tauri-apps/api/core";
  import {
    attachFile,
    attachFileBytes,
    deleteAttachment,
    getAttachmentPath,
    type AttachmentRefDto,
  } from "$lib/api";

  let {
    taskId,
    attachments,
    readonly = false,
    onTaskUpdated,
  }: {
    taskId: number;
    attachments: AttachmentRefDto[];
    readonly?: boolean;
    onTaskUpdated: () => void;
  } = $props();

  let draggingOver = $state(false);
  let uploading = $state(false);

  function isImage(mime: string): boolean {
    return mime.startsWith("image/");
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // Map MIME to extension for pasted images
  function extFromMime(mime: string): string {
    if (mime === "image/png") return "png";
    if (mime === "image/jpeg") return "jpg";
    if (mime === "image/gif") return "gif";
    if (mime === "image/webp") return "webp";
    return "png"; // fallback
  }

  async function handleAttach() {
    const selected = await open({
      multiple: true,
      title: "Attach files",
    });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    uploading = true;
    for (const filePath of paths) {
      try {
        await attachFile(taskId, filePath);
      } catch (e) {
        console.error("Failed to attach:", e);
      }
    }
    uploading = false;
    onTaskUpdated();
  }

  async function handleDelete(filename: string) {
    try {
      await deleteAttachment(taskId, filename);
      onTaskUpdated();
    } catch (e) {
      console.error("Failed to delete attachment:", e);
    }
  }

  /** Handle CMD+V paste — intercept image data from clipboard */
  export async function handlePaste(e: ClipboardEvent) {
    if (readonly) return;
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (!blob) continue;

        uploading = true;
        try {
          const buffer = await blob.arrayBuffer();
          const bytes = Array.from(new Uint8Array(buffer));
          const ext = extFromMime(item.type);
          const filename = `paste-${Date.now()}.${ext}`;
          await attachFileBytes(taskId, bytes, filename, item.type);
          onTaskUpdated();
        } catch (err) {
          console.error("Failed to paste attachment:", err);
        }
        uploading = false;
        return; // only handle the first image item
      }
    }
  }

  let visible = $derived(!readonly || attachments.length > 0);

  // Resolve thumbnail URLs
  let thumbnailUrls = $state<Record<string, string>>({});

  $effect(() => {
    const imageAttachments = attachments.filter(a => isImage(a.mime_type));
    for (const att of imageAttachments) {
      if (!thumbnailUrls[att.filename]) {
        getAttachmentPath(taskId, att.filename).then(path => {
          thumbnailUrls[att.filename] = convertFileSrc(path);
          thumbnailUrls = { ...thumbnailUrls };
        });
      }
    }
  });
</script>
```

Note the `export` on `handlePaste` — the parent `TaskModal` will call this from a `paste` event listener on the modal content, so clipboard paste works anywhere within the modal, not just when the attachment list is focused.

Template structure mirrors `SubtaskList.svelte`:
- Bordered container with header row
- Attachment rows with hover actions
- Add button at the bottom

**Step 2: Commit**

```
feat: create AttachmentList.svelte component
```

---

### Task 8: Integrate AttachmentList into TaskModal with CMD+V paste support

**Files:**
- Modify: `apps/desktop/src/lib/components/TaskModal.svelte`

**Step 1: Import AttachmentList**

Add import:

```typescript
import AttachmentList from "$lib/components/AttachmentList.svelte";
```

**Step 2: Add state for the component reference**

```typescript
let attachmentListRef = $state<{ handlePaste: (e: ClipboardEvent) => void } | null>(null);
```

**Step 3: Add AttachmentList to the modal body**

Place it after the SubtaskList and before the agent sections. In the template, after the `</SubtaskList>` block (around line 666):

```svelte
<!-- Attachments -->
{#if task.id != null}
  <AttachmentList
    bind:this={attachmentListRef}
    taskId={task.id}
    attachments={task.attachments ?? []}
    readonly={isUnindexed}
    onTaskUpdated={async () => {
      if (task?.id) {
        const loaded = await getTask(task.id);
        task = loaded;
      }
      onTaskUpdated();
    }}
  />
{/if}
```

**Step 4: Add paste event listener to the modal Dialog.Content**

On the `<Dialog.Content>` element, add a paste handler:

```svelte
<Dialog.Content
  class={contentClass}
  onInteractOutside={(e) => { e.preventDefault(); if (!closing) handleClose(); }}
  onEscapeKeydown={(e) => { ... }}
  onpaste={(e) => {
    // Only intercept if clipboard has image data (not text paste into editor)
    if (e.clipboardData?.items) {
      for (const item of e.clipboardData.items) {
        if (item.type.startsWith("image/")) {
          attachmentListRef?.handlePaste(e);
          return;
        }
      }
    }
  }}
>
```

This ensures CMD+V with an image anywhere in the modal (even while focused on the title or body editor) triggers the attachment paste, but normal text paste into the editor still works.

**Step 5: Verify the modal renders correctly and paste works**

Run: `pnpm tauri dev` (from `apps/desktop/`)
Test: Take a screenshot (CMD+Shift+4), then CMD+V in the task modal.

**Step 6: Commit**

```
feat: integrate AttachmentList into task modal with CMD+V paste support
```

---

### Task 9: Add attachment indicator to kanban cards

**Files:**
- Modify: `apps/desktop/src/lib/components/Kanban.svelte`

**Step 1: Find the card template in Kanban.svelte**

Look for where subtask progress and priority dots are rendered on the card.

**Step 2: Add attachment indicator**

After the existing card metadata (priority dot, subtask count), add:

```svelte
{#if task.attachments?.length > 0}
  <span class="inline-flex items-center gap-0.5 font-mono text-[9px] text-muted-foreground/50" title="{task.attachments.length} attachment{task.attachments.length > 1 ? 's' : ''}">
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
    </svg>
    {task.attachments.length}
  </span>
{/if}
```

Follows the design language: monochrome, tiny, mono font, muted.

**Step 3: Commit**

```
feat: show attachment count indicator on kanban cards
```

---

### Task 10: Handle Tauri asset protocol configuration

**Files:**
- Modify: `apps/desktop/src-tauri/tauri.conf.json` (or equivalent Tauri 2 config)

**Step 1: Check current Tauri config**

Look at `apps/desktop/src-tauri/tauri.conf.json` for existing security scope.

**Step 2: Add asset protocol scope**

In Tauri 2, the `asset` protocol needs to be configured to allow reading from the `.untask/attachments/` directory. This typically goes in the security section.

Alternatively, if using `convertFileSrc()`, check whether Tauri 2 requires explicit asset scope registration. If it does, the scope pattern should be:

```json
{
  "security": {
    "assetProtocol": {
      "scope": ["**/.untask/attachments/**"]
    }
  }
}
```

**Step 3: Test image preview in the modal**

Verify that `convertFileSrc()` produces a working URL for images.

**Step 4: Commit**

```
fix: configure Tauri asset protocol scope for attachment previews
```

---

### Task 11: Update .gitignore handling (optional, risk mitigation)

**Files:**
- Modify: `crates/untask-core/src/init.rs`

**Step 1: Consider adding attachments to .gitignore**

The current `.untask/.gitignore` contains `.lock\ncache/\n`. Consider adding `attachments/` to prevent binary files from bloating the git repo.

However, some users may *want* attachments tracked. This is a product decision — implement only if the user decides to exclude attachments from git by default.

If yes, change line 27 in `init.rs`:

```rust
atomic_write(&gitignore_path, b".lock\ncache/\nattachments/\n")?;
```

**Step 2: Commit**

```
fix: exclude attachments directory from git tracking by default
```

---

### Task 12: End-to-end testing and polish

**Step 1: Test the full flow**

1. Open a task in the modal
2. Click "+ attachment" — file dialog opens
3. Select a file — it appears in the attachment list
4. Verify image files show inline thumbnails
5. Verify non-image files show filename + size
6. Click delete on an attachment — it disappears
7. Close and reopen the modal — attachments persist
8. Delete the task — verify `.untask/attachments/{id}/` is cleaned up
9. Check kanban card shows attachment count icon
10. Take a screenshot (CMD+Shift+4), then CMD+V in the modal — image is attached
11. Copy an image from a browser, CMD+V in the modal — image is attached
12. CMD+V text while editing the body — should NOT intercept, text pastes normally

**Step 2: Edge cases to verify**

- Attaching the same file twice (collision handling)
- Attaching a file over 25 MB (error message)
- Opening a task that has attachments in frontmatter but missing files on disk
- Multiple rapid attachments
- CMD+V when no image in clipboard (should be a no-op)
- CMD+V while editing title (should paste image, not intercept text)

**Step 3: Final commit**

```
test: verify attachment feature end-to-end
```

---

## Serialization Example

After implementation, a task with attachments will serialize as:

```yaml
---
id: 42
title: Fix login modal
status: in-progress
priority: high
tags:
  - bugfix
  - frontend
attachments:
  - filename: screenshot.png
    mime_type: image/png
    size: 245782
    created: 2026-03-08T14:22:33.123456Z
  - filename: error-log.txt
    mime_type: text/plain
    size: 1024
    created: 2026-03-08T14:25:10.456789Z
---

Login modal not rendering on mobile. See screenshot and error log.
```

## Open Questions for User

1. **Should `.untask/attachments/` be gitignored by default?** Binary files will bloat the repo, but some users may want attachments tracked.
2. **Should drag-and-drop from OS file manager be supported in v1?** Tauri 2 has drag-drop disabled currently. File dialog + CMD+V paste cover the main UX. DnD can be added later.
3. **Should there be a max attachment count per task?** Probably not needed for v1.
