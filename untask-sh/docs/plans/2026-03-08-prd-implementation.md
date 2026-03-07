# PRD Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add PRD (Product Requirements Document) as a first-class document type, enabling one-shot and task-breakdown workflows.

**Architecture:** PRDs are markdown docs with `type: prd` frontmatter. The docs system gains frontmatter parsing (new `DocType` enum, `DocFrontmatter` struct). Tasks gain an optional `prd` field linking back to their source PRD via relative path. The CLI gets a `--type` filter on `docs list` and a `--prd` flag on `add`. The desktop app shows PRD labels in the tree and linked task counts when viewing a PRD.

**Tech Stack:** Rust (untask-core, untask-cli), Tauri 2 IPC commands, Svelte 5 (desktop app)

**Key decision:** The `prd` field on tasks stores the **relative path** (e.g., `.untask/docs/my-project.md`), not just the basename. This avoids ambiguity when PRDs in different folders share a name.

---

### Task 1: Add `prd` field to Task struct and TaskStore::add

**Files:**
- Modify: `crates/untask-core/src/task.rs:8-61`
- Modify: `crates/untask-core/src/store.rs` (add method, TaskUpdate)
- Test: `crates/untask-core/tests/store_test.rs`

**Step 1: Write the failing tests**

Add to the bottom of `crates/untask-core/tests/store_test.rs`:

```rust
#[test]
fn add_task_preserves_prd_field_through_roundtrip() {
    let (tmp, store) = setup();
    let task = store.add("Setup boilerplate", None, None).unwrap();

    // Write prd field directly into the task file
    let path = task.file_path.unwrap();
    let updated_content = format!(
        "---\nid: {}\ntitle: Setup boilerplate\nstatus: backlog\nprd: .untask/docs/my-project.md\ncreated: 2026-03-08\nupdated: 2026-03-08T00:00:00Z\nposition: 1.0\n---\n",
        task.id.unwrap()
    );
    std::fs::write(&path, updated_content).unwrap();

    let loaded = store.get(task.id.unwrap()).unwrap();
    assert_eq!(loaded.prd.as_deref(), Some(".untask/docs/my-project.md"));
}

#[test]
fn add_task_with_prd_sets_field() {
    let (_tmp, store) = setup();
    let task = store.add("Task from PRD", None, Some(".untask/docs/spec.md")).unwrap();

    assert_eq!(task.prd.as_deref(), Some(".untask/docs/spec.md"));

    let loaded = store.get(task.id.unwrap()).unwrap();
    assert_eq!(loaded.prd.as_deref(), Some(".untask/docs/spec.md"));
}
```

**Step 2: Run tests to verify they fail**

Run: `cargo test -p untask-core --test store_test add_task_preserves_prd`
Expected: FAIL — `Task` has no field `prd`, `add` doesn't accept a third arg

**Step 3: Add `prd` field to Task, TaskFrontmatter, and TaskUpdate**

In `crates/untask-core/src/task.rs`, add to `Task` struct (after `tags`):

```rust
#[serde(default, skip_serializing_if = "Option::is_none")]
pub prd: Option<String>,
```

Add to `TaskFrontmatter` struct (after `tags`):

```rust
#[serde(default)]
prd: Option<String>,
```

Update the `From<TaskFrontmatter> for Task` impl to include:

```rust
prd: frontmatter.prd,
```

In `crates/untask-core/src/store.rs`, add `prd` to `TaskUpdate`:

```rust
pub struct TaskUpdate {
    pub title: Option<String>,
    pub status: Option<String>,
    pub priority: Option<Option<crate::types::Priority>>,
    pub tags: Option<Vec<String>>,
    pub body: Option<String>,
    pub position: Option<f64>,
    pub prd: Option<Option<String>>,
}
```

Update `TaskStore::add` to accept `prd`:

```rust
pub fn add(&self, title: &str, status: Option<&str>, prd: Option<&str>) -> Result<Task> {
    // ... existing code ...
    let task = Task {
        // ... existing fields ...
        prd: prd.map(|s| s.to_string()),
        ..Task::default()
    };
    // ... rest unchanged ...
}
```

Update `TaskStore::update` to handle `prd`:

```rust
if let Some(prd) = updates.prd {
    task.prd = prd;
}
```

**Step 4: Fix all existing callers of `store.add()`**

All existing callers pass two args. Add `None` as the third argument:
- `crates/untask-core/src/store.rs` — `add(title, status)` → `add(title, status, None)` (in tests or internal calls if any)
- `crates/untask-cli/src/commands/add.rs` — update the call
- `apps/desktop/src-tauri/src/commands.rs` — update `add_task` command
- `crates/untask-core/tests/store_test.rs` — all existing `store.add(...)` calls

**Step 5: Run tests to verify they pass**

Run: `cargo test -p untask-core`
Expected: All tests pass

**Step 6: Commit**

```bash
git add crates/untask-core/src/task.rs crates/untask-core/src/store.rs crates/untask-core/tests/store_test.rs crates/untask-cli/src/commands/add.rs apps/desktop/src-tauri/src/commands.rs
git commit -m "feat: add prd field to Task, TaskUpdate, and TaskStore::add"
```

---

### Task 2: Add `DocType` enum and frontmatter parsing to docs

**Files:**
- Modify: `crates/untask-core/src/docs.rs:1-20`
- Test: `crates/untask-core/tests/docs_test.rs`

**Step 1: Write the failing tests**

Add to the bottom of `crates/untask-core/tests/docs_test.rs`:

```rust
#[test]
fn list_parses_doc_type_from_frontmatter() {
    let tmp = setup();
    write_doc(&tmp, ".untask/docs/spec.md", "---\ntype: prd\n---\n# My PRD\nBuild this.");
    write_doc(&tmp, ".untask/docs/notes.md", "# Just notes\nNo frontmatter.");

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
    write_doc(&tmp, ".untask/docs/guide.md", "---\ntitle: Guide\n---\n# Guide");

    let store = DocsStore::new(tmp.path().to_path_buf());
    let docs = store.list().unwrap();

    assert_eq!(docs[0].doc_type, untask_core::docs::DocType::Doc);
}

#[test]
fn list_parses_explicit_doc_type() {
    let tmp = setup();
    write_doc(&tmp, ".untask/docs/notes.md", "---\ntype: doc\n---\n# Notes");

    let store = DocsStore::new(tmp.path().to_path_buf());
    let docs = store.list().unwrap();

    assert_eq!(docs[0].doc_type, untask_core::docs::DocType::Doc);
}
```

**Step 2: Run tests to verify they fail**

Run: `cargo test -p untask-core --test docs_test list_parses`
Expected: FAIL — `DocType` doesn't exist, `Doc` has no `doc_type` field

**Step 3: Add DocType, DocFrontmatter, and parsing**

In `crates/untask-core/src/docs.rs`, update imports:

```rust
use serde::{Deserialize, Serialize};
```

(Replace the existing `use serde::Serialize;`)

Add after the imports, before the `Doc` struct:

```rust
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DocType {
    #[default]
    Doc,
    Prd,
}

#[derive(Debug, Default, Deserialize)]
struct DocFrontmatter {
    #[serde(default, rename = "type")]
    doc_type: DocType,
}

/// Parse doc type from file content by reading YAML frontmatter.
pub fn parse_doc_type(content: &str) -> DocType {
    let trimmed = content.trim_start();
    if !trimmed.starts_with("---") {
        return DocType::Doc;
    }

    let after_open = match trimmed[3..].find('\n') {
        Some(i) => 3 + i + 1,
        None => return DocType::Doc,
    };

    if let Some(close_pos) = trimmed[after_open..].find("\n---") {
        let fm_str = &trimmed[after_open..after_open + close_pos];
        serde_yaml::from_str::<DocFrontmatter>(fm_str)
            .map(|fm| fm.doc_type)
            .unwrap_or_default()
    } else {
        DocType::Doc
    }
}
```

Add `doc_type` field to `Doc` struct:

```rust
pub struct Doc {
    pub path: PathBuf,
    pub basename: String,
    pub content: String,
    pub doc_type: DocType,
}
```

**Important:** Do NOT add `doc_type` to `DocRef`. `DocRef` stays lightweight (no content reading). Only `Doc` (which reads content) gets `doc_type`.

Update `DocsStore::list()` to parse doc type:

```rust
pub fn list(&self) -> Result<Vec<Doc>> {
    self.list_refs()?
        .into_iter()
        .map(|doc| {
            let content = std::fs::read_to_string(&doc.path)?;
            let doc_type = parse_doc_type(&content);
            Ok(Doc {
                path: doc.path,
                basename: doc.basename,
                content,
                doc_type,
            })
        })
        .collect()
}
```

Update all `Ok(Doc { ... })` returns in `get()` to include `doc_type`:

```rust
// In get(), for each place that constructs a Doc, add:
let content = std::fs::read_to_string(&doc.path)?;
let doc_type = parse_doc_type(&content);
Ok(Doc {
    path: doc.path.clone(),
    basename: doc.basename.clone(),
    content,
    doc_type,
})
```

**Step 4: Run tests to verify they pass**

Run: `cargo test -p untask-core --test docs_test list_parses`
Expected: PASS

**Step 5: Run full test suite**

Run: `cargo test -p untask-core`
Expected: All tests pass

**Step 6: Commit**

```bash
git add crates/untask-core/src/docs.rs crates/untask-core/tests/docs_test.rs
git commit -m "feat: add DocType enum and frontmatter parsing to docs"
```

---

### Task 3: Add `doc_type` to DocNode for tree view

**Files:**
- Modify: `crates/untask-core/src/docs.rs` (DocNode struct, tree building)
- Test: `crates/untask-core/tests/docs_test.rs`

**Step 1: Write the failing test**

Add to `crates/untask-core/tests/docs_test.rs`:

```rust
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
```

**Step 2: Run test to verify it fails**

Run: `cargo test -p untask-core --test docs_test list_tree_includes_doc_type`
Expected: FAIL — `DocNode` has no `doc_type` field

**Step 3: Add `doc_type` to DocNode and wire through tree building**

Add to `DocNode` struct in `crates/untask-core/src/docs.rs`:

```rust
#[serde(skip_serializing_if = "Option::is_none")]
pub doc_type: Option<DocType>,
```

Set `doc_type: None` for folder/root nodes in `into_children` and `into_node`.

For doc nodes, the tree needs doc type info. Since `DocRef` doesn't have it, change `list_tree` to use `list()` (which reads content and has `doc_type`) instead of `list_refs()`:

```rust
pub fn list_tree(&self) -> Result<Vec<DocNode>> {
    let docs = self.list()?;
    let mut roots = self.root_specs();
    let mut builders: Vec<RootTree> = roots.drain(..).map(RootTree::new).collect();

    for builder in &mut builders {
        builder.collect_existing_directories(&self.project_root)?;
    }

    for doc in &docs {
        let relative = self.relative_path(&doc.path);
        if let Some(index) = self.assign_root(relative, &builders) {
            builders[index].insert_doc(relative, &doc.basename, doc.doc_type);
        }
    }

    Ok(builders.into_iter().map(RootTree::into_node).collect())
}
```

Update `RootTree::insert_doc` signature to accept basename and doc_type directly instead of `&DocRef`:

```rust
fn insert_doc(&mut self, project_relative: &Path, basename: &str, doc_type: DocType) {
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
        .insert_doc(relative_under_root, actual_base, basename, self.spec.base_dir.is_none(), doc_type);
}
```

Update `TreeFolder::insert_doc` to accept and use `doc_type`:

```rust
fn insert_doc(
    &mut self,
    relative_under_root: &Path,
    actual_base: &Path,
    basename: &str,
    read_only: bool,
    doc_type: DocType,
) {
    // ... existing traversal code unchanged ...
    current.docs.push(DocNode {
        // ... existing fields ...
        doc_type: Some(doc_type),
    });
}
```

**Step 4: Run test to verify it passes**

Run: `cargo test -p untask-core --test docs_test list_tree_includes_doc_type`
Expected: PASS

**Step 5: Run full test suite**

Run: `cargo test -p untask-core`
Expected: All tests pass

**Step 6: Commit**

```bash
git add crates/untask-core/src/docs.rs crates/untask-core/tests/docs_test.rs
git commit -m "feat: expose doc_type on DocNode for tree view"
```

---

### Task 4: Add `count_by_prd` to TaskStore

**Files:**
- Modify: `crates/untask-core/src/store.rs`
- Test: `crates/untask-core/tests/store_test.rs`

**Step 1: Write the failing tests**

Add to `crates/untask-core/tests/store_test.rs`:

```rust
#[test]
fn count_by_prd_returns_done_and_total() {
    let (tmp, store) = setup();

    // Create tasks linked to a PRD
    let t1 = store.add("Task 1", None, Some(".untask/docs/my-project.md")).unwrap();
    let t2 = store.add("Task 2", None, Some(".untask/docs/my-project.md")).unwrap();
    let t3 = store.add("Task 3", None, Some(".untask/docs/my-project.md")).unwrap();
    let _t4 = store.add("Unrelated task", None, None).unwrap();

    // Mark t1 as done
    store.mark_done(t1.id.unwrap()).unwrap();

    let (done, total) = store.count_by_prd(".untask/docs/my-project.md").unwrap();
    assert_eq!(total, 3);
    assert_eq!(done, 1);
}

#[test]
fn count_by_prd_returns_zero_when_no_tasks_linked() {
    let (_tmp, store) = setup();
    store.add("Unlinked task", None, None).unwrap();

    let (done, total) = store.count_by_prd("nonexistent.md").unwrap();
    assert_eq!(total, 0);
    assert_eq!(done, 0);
}
```

**Step 2: Run tests to verify they fail**

Run: `cargo test -p untask-core --test store_test count_by_prd`
Expected: FAIL — `TaskStore` has no method `count_by_prd`

**Step 3: Implement `count_by_prd`**

Add to `TaskStore` in `crates/untask-core/src/store.rs`:

```rust
/// Count tasks linked to a PRD by relative path. Returns (done, total).
pub fn count_by_prd(&self, prd_path: &str) -> Result<(u32, u32)> {
    let tasks = self.list(None)?;
    let mut done = 0u32;
    let mut total = 0u32;

    for task in &tasks {
        if task.prd.as_deref() == Some(prd_path) {
            total += 1;
            if self.config.is_done_status(&task.status) {
                done += 1;
            }
        }
    }

    Ok((done, total))
}
```

**Step 4: Run tests to verify they pass**

Run: `cargo test -p untask-core --test store_test count_by_prd`
Expected: PASS

**Step 5: Commit**

```bash
git add crates/untask-core/src/store.rs crates/untask-core/tests/store_test.rs
git commit -m "feat: add count_by_prd to TaskStore for PRD task counts"
```

---

### Task 5: Add `--type` filter and `--prd` flag to CLI

**Files:**
- Modify: `crates/untask-cli/src/cli.rs:136-160` (DocsCommands::List, Commands::Add)
- Modify: `crates/untask-cli/src/commands/docs.rs:8-36` (list function)
- Modify: `crates/untask-cli/src/commands/add.rs`
- Modify: `crates/untask-cli/src/main.rs:115-127` (dispatch)

**Step 1: Add `--type` flag to DocsCommands::List**

In `crates/untask-cli/src/cli.rs`, update `DocsCommands::List`:

```rust
/// List all docs
List {
    /// Filter by type (doc, prd)
    #[arg(short = 't', long = "type")]
    doc_type: Option<String>,
},
```

**Step 2: Add `--prd` flag to Commands::Add**

In `crates/untask-cli/src/cli.rs`, update `Commands::Add`:

```rust
/// Add a new task
Add {
    /// Task title
    title: String,

    /// Initial status
    #[arg(short, long)]
    status: Option<String>,

    /// Link to a PRD (relative path)
    #[arg(long)]
    prd: Option<String>,
},
```

**Step 3: Update docs list handler to filter**

In `crates/untask-cli/src/commands/docs.rs`, update `list` signature:

```rust
pub fn list(root: &Path, doc_type: Option<&str>, json: bool) -> Result<()> {
    let store = DocsStore::new(root.to_path_buf());
    let mut docs = store.list()?;

    if let Some(type_filter) = doc_type {
        let filter_type = match type_filter {
            "prd" => untask_core::docs::DocType::Prd,
            "doc" => untask_core::docs::DocType::Doc,
            other => return Err(UntaskError::InvalidConfig(format!("unknown doc type: {other}"))),
        };
        docs.retain(|d| d.doc_type == filter_type);
    }

    // ... rest of existing function body unchanged ...
}
```

**Step 4: Update the dispatch in `main.rs`**

In `crates/untask-cli/src/main.rs`, update lines 115-127. The current dispatch:

```rust
Commands::Docs { cmd: subcmd } => match subcmd {
    // ...
    Some(DocsCommands::List) | None => commands::docs::list(&root, cli.json),
},
```

Must become:

```rust
Commands::Docs { cmd: subcmd } => match subcmd {
    Some(DocsCommands::Show { name }) => {
        commands::docs::show(&root, name, cli.json)
    }
    Some(DocsCommands::Paths) => commands::docs::paths(&root, cli.json),
    Some(DocsCommands::AddPath { pattern }) => {
        commands::docs::add_path(&root, pattern, cli.json)
    }
    Some(DocsCommands::RemovePath { pattern }) => {
        commands::docs::remove_path(&root, pattern, cli.json)
    }
    Some(DocsCommands::List { doc_type }) => {
        commands::docs::list(&root, doc_type.as_deref(), cli.json)
    }
    None => commands::docs::list(&root, None, cli.json),
},
```

Also update the `Add` dispatch to pass `prd`:

```rust
Commands::Add { title, status, prd } => {
    commands::add(&store, title, status.as_deref(), prd.as_deref(), cli.json)
}
```

And update `commands/add.rs` to accept and pass through `prd`.

**Step 5: Run CLI tests**

Run: `cargo test -p untask-cli`
Expected: All tests pass

**Step 6: Test manually**

Run: `cargo run -p untask -- docs list --type prd`
Expected: Lists only PRD docs (or "No docs found." if none)

Run: `cargo run -p untask -- add "My task" --prd .untask/docs/spec.md`
Expected: Creates a task with `prd` field

**Step 7: Commit**

```bash
git add crates/untask-cli/src/cli.rs crates/untask-cli/src/commands/docs.rs crates/untask-cli/src/commands/add.rs crates/untask-cli/src/main.rs
git commit -m "feat: add --type filter to docs list and --prd flag to add command"
```

---

### Task 6: Update Tauri IPC layer for PRD support

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs:12-41`
- Modify: `apps/desktop/src/lib/api.ts`

**Step 1: Update Rust DTOs**

In `apps/desktop/src-tauri/src/commands.rs`:

Add `doc_type` to `DocInfo` and `DocDetail` using the `DocType` enum directly (not a string):

```rust
use untask_core::docs::DocType;

#[derive(Serialize)]
pub struct DocInfo {
    pub path: String,
    pub basename: String,
    pub doc_type: DocType,
}

#[derive(Serialize)]
pub struct DocDetail {
    pub path: String,
    pub basename: String,
    pub content: String,
    pub doc_type: DocType,
}
```

`DocType` derives `Serialize` with `rename_all = "lowercase"`, so it serializes to `"doc"` or `"prd"` automatically.

Add `prd` to `TaskDto`:

```rust
pub prd: Option<String>,
```

Update `From<Task> for TaskDto` to include `prd: task.prd`.

Update `doc_info_from_ref` — this helper takes a `DocRef` which does NOT have `doc_type`. Since `list_docs` now needs type info, change it to use `list()` instead of `list_refs()`:

```rust
#[tauri::command]
pub fn list_docs(state: State<'_, AppState>) -> Result<Vec<DocInfo>, String> {
    let root = require_project(&state)?;
    let docs_store = DocsStore::new(root.clone());
    let docs = docs_store.list().map_err(|e| e.to_string())?;
    Ok(docs
        .into_iter()
        .map(|doc| DocInfo {
            path: relative_project_path(&root, &doc.path),
            basename: doc.basename,
            doc_type: doc.doc_type,
        })
        .collect())
}
```

Update `read_doc` to include `doc_type`:

```rust
#[tauri::command]
pub fn read_doc(path: String, state: State<'_, AppState>) -> Result<DocDetail, String> {
    let root = require_project(&state)?;
    let docs_store = DocsStore::new(root.clone());
    let doc = docs_store.get(&path).map_err(|e| e.to_string())?;
    Ok(DocDetail {
        path: relative_project_path(&root, &doc.path),
        basename: doc.basename,
        content: doc.content,
        doc_type: doc.doc_type,
    })
}
```

Update `create_doc` — the returned `DocRef` doesn't have type, so parse it from the content that was just written:

```rust
#[tauri::command]
pub fn create_doc(
    parent_path: String,
    name: String,
    content: Option<String>,
    state: State<'_, AppState>,
) -> Result<DocInfo, String> {
    let root = require_project(&state)?;
    let docs_store = DocsStore::new(root.clone());
    let content_str = content.as_deref().unwrap_or("");
    let doc = docs_store
        .create_doc(&parent_path, &name, content_str)
        .map_err(|e| e.to_string())?;
    let doc_type = untask_core::docs::parse_doc_type(content_str);
    Ok(DocInfo {
        path: relative_project_path(&root, &doc.path),
        basename: doc.basename,
        doc_type,
    })
}
```

Update `TaskUpdateDto` to include `prd`:

```rust
#[derive(Deserialize)]
pub struct TaskUpdateDto {
    pub title: Option<String>,
    pub status: Option<String>,
    #[serde(default, deserialize_with = "deserialize_double_option")]
    pub priority: Option<Option<Priority>>,
    pub tags: Option<Vec<String>>,
    pub body: Option<String>,
    pub position: Option<f64>,
    #[serde(default, deserialize_with = "deserialize_double_option")]
    pub prd: Option<Option<String>>,
}
```

Update `update_task` to pass through `prd`:

```rust
TaskUpdate {
    title: updates.title,
    status: updates.status,
    priority: updates.priority,
    tags: updates.tags,
    body: updates.body,
    position: updates.position,
    prd: updates.prd,
}
```

`DocNode` already gets `doc_type` from core (Task 3) — `DocNode` is serialized directly from `untask_core::docs::DocNode`, so the new field appears automatically in `list_docs_tree`. No changes needed.

Add a new command for PRD task counts:

```rust
#[tauri::command]
pub fn get_prd_task_counts(
    prd_path: String,
    state: State<'_, AppState>,
) -> Result<(u32, u32), String> {
    let root = require_project(&state)?;
    let store = TaskStore::new(root).map_err(|e| e.to_string())?;
    store.count_by_prd(&prd_path).map_err(|e| e.to_string())
}
```

**Step 2: Register new command in lib.rs**

In `apps/desktop/src-tauri/src/lib.rs`, add to the `generate_handler!` macro (after `commands::delete_doc_folder`):

```rust
commands::get_prd_task_counts,
```

**Step 3: Update TypeScript types and API functions**

In `apps/desktop/src/lib/api.ts`:

Update `DocInfo`:

```typescript
export interface DocInfo {
  path: string;
  basename: string;
  doc_type: string;
}
```

Update `DocDetail`:

```typescript
export interface DocDetail {
  path: string;
  basename: string;
  content: string;
  doc_type: string;
}
```

Update `DocNode`:

```typescript
export interface DocNode {
  node_path: string;
  relative_path: string;
  name: string;
  kind: DocNodeKind;
  children: DocNode[];
  can_create: boolean;
  can_rename: boolean;
  can_move: boolean;
  can_delete: boolean;
  read_only: boolean;
  doc_type: string | null;
}
```

Update `TaskDto`:

```typescript
export interface TaskDto {
  id: number | null;
  title: string;
  status: string;
  priority: Priority | null;
  tags: string[];
  created: string | null;
  updated: string | null;
  completed: string | null;
  body: string;
  subtask_done: number;
  subtask_total: number;
  position: number | null;
  prd: string | null;
}
```

Update `TaskUpdateDto`:

```typescript
export interface TaskUpdateDto {
  title?: string;
  status?: string;
  priority?: Priority | null;
  tags?: string[];
  body?: string;
  position?: number;
  prd?: string | null;
}
```

Add API function:

```typescript
export function getPrdTaskCounts(
  prdPath: string,
): Promise<[number, number]> {
  return invoke("get_prd_task_counts", { prdPath });
}
```

**Step 4: Build and verify**

Run: `cd apps/desktop && pnpm tauri dev`
Expected: App compiles and launches. No runtime errors.

**Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/commands.rs apps/desktop/src-tauri/src/lib.rs apps/desktop/src/lib/api.ts
git commit -m "feat: expose PRD type and task counts through Tauri IPC"
```

---

### Task 7: PRD visual distinction in Docs view

**Files:**
- Modify: `apps/desktop/src/lib/components/DocsViewer.svelte`

**Step 1: Add PRD label to tree items**

In `DocsViewer.svelte`, find the tree item name span (around line 563):

```svelte
<span class="min-w-0 flex-1 truncate text-left text-[12px] text-foreground">{item.node.name}</span>
```

Add a PRD indicator after it:

```svelte
<span class="min-w-0 flex-1 truncate text-left text-[12px] text-foreground">{item.node.name}</span>

{#if item.node.doc_type === "prd"}
  <span class="ml-1 shrink-0 rounded-[3px] border border-border/60 px-1 font-mono text-[9px] leading-[14px] text-muted-foreground">
    PRD
  </span>
{/if}
```

Also add the same label in the folder children list (around line 743):

```svelte
<span class="min-w-0 flex-1 truncate text-[12px] text-foreground">{child.name}</span>

{#if child.doc_type === "prd"}
  <span class="ml-1 shrink-0 rounded-[3px] border border-border/60 px-1 font-mono text-[9px] leading-[14px] text-muted-foreground">
    PRD
  </span>
{/if}
```

**Step 2: Show linked task count when viewing a PRD**

Import the API function at the top of the script:

```typescript
import {
  createDoc,
  createDocFolder,
  deleteDocFolder,
  deleteDocPath,
  getPrdTaskCounts,
  moveDocPath,
  renameDocPath,
  type DocInfo,
  type DocNode,
} from "$lib/api";
```

Add state for PRD task counts:

```typescript
let prdTaskCounts = $state<[number, number] | null>(null);
```

Add an effect that loads counts when a PRD doc is selected:

```typescript
$effect(() => {
  if (selectedDoc && selectedNode?.doc_type === "prd") {
    getPrdTaskCounts(selectedDoc.path).then((counts) => {
      prdTaskCounts = counts;
    }).catch(() => {
      prdTaskCounts = null;
    });
  } else {
    prdTaskCounts = null;
  }
});
```

Note: Uses `selectedDoc.path` (the relative path), not `basename`, because the `prd` field on tasks stores the relative path.

Show the count line in the header bar next to the breadcrumb path (around line 582), after the relative path `<p>`:

```svelte
<div class="min-w-0">
  <p class="truncate font-mono text-[10px] text-muted-foreground">
    {selectedNode.relative_path}
  </p>
</div>

{#if prdTaskCounts && prdTaskCounts[1] > 0}
  <span class="font-mono text-[10px] text-muted-foreground">
    {prdTaskCounts[1]} tasks · {prdTaskCounts[0]} done
  </span>
{/if}
```

**Step 3: Test visually**

Run: `cd apps/desktop && pnpm tauri dev`

1. Create a doc with `---\ntype: prd\n---` frontmatter in `.untask/docs/`
2. Verify PRD label appears in the tree
3. Verify the header shows task count info when viewing a PRD with linked tasks
4. Create a regular doc, verify no PRD label

**Step 4: Commit**

```bash
git add apps/desktop/src/lib/components/DocsViewer.svelte
git commit -m "feat: PRD label in docs tree and linked task counts"
```

---

### Task 8: Update the "New doc" flow to support PRD type

**Files:**
- Modify: `apps/desktop/src/lib/components/DocsViewer.svelte`

**Step 1: Add doc type selector to new-doc action**

Add state:

```typescript
let newDocType = $state<"doc" | "prd">("doc");
```

Reset it in `startNewDoc`:

```typescript
function startNewDoc() {
    actionMode = "new-doc";
    draftName = "untitled.md";
    newDocType = "doc";
    actionError = null;
}
```

In the action bar template (around line 638), the current structure is:

```svelte
{#if actionMode === "move"}
  <select ...>
{:else if actionMode === "delete"}
  <span ...>
{:else}
  <input ...>
{/if}
```

Change to add a `new-doc` branch before the catch-all `{:else}`:

```svelte
{#if actionMode === "move"}
  <select ...>
{:else if actionMode === "delete"}
  <span ...>
{:else if actionMode === "new-doc"}
  <select
    bind:value={newDocType}
    class="rounded-[4px] border border-border/60 bg-background px-2 py-1 font-mono text-[11px] text-foreground outline-none focus:border-ring"
  >
    <option value="doc">Doc</option>
    <option value="prd">PRD</option>
  </select>
  <input
    bind:value={draftName}
    class="min-w-[220px] rounded-[4px] border border-border/60 bg-background px-2 py-1 font-mono text-[11px] text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-ring"
    placeholder="untitled.md"
  />
{:else}
  <input ...>
{/if}
```

Update `submitAction` for `new-doc` to inject frontmatter when type is PRD:

```typescript
if (actionMode === "new-doc") {
    const initialContent = newDocType === "prd"
        ? `---\ntype: prd\n---\n`
        : "";
    const created = await createDoc(selectedNode.relative_path, draftName, initialContent);
    selectedPath = created.path;
    openDoc = created;
    openDocMissing = false;
    editorKey = created.path;
    await refreshDocs();
}
```

**Step 2: Test visually**

Run: `cd apps/desktop && pnpm tauri dev`

1. Click "New doc" on a folder
2. Select "PRD" from the dropdown
3. Enter a name and save
4. Verify the created doc has `type: prd` frontmatter
5. Verify the PRD label appears in the tree after refresh

**Step 3: Commit**

```bash
git add apps/desktop/src/lib/components/DocsViewer.svelte
git commit -m "feat: support PRD type selection in new doc creation flow"
```

---

### Task 9: Final integration test and cleanup

**Step 1: Run full test suite**

Run: `cargo test`
Expected: All Rust tests pass

**Step 2: Run desktop app**

Run: `cd apps/desktop && pnpm tauri dev`

Verify end-to-end:
1. Create a PRD doc from the app — PRD label appears in tree
2. Create tasks with `prd` linkage: `cargo run -p untask -- add "Build feature" --prd .untask/docs/spec.md`
3. View the PRD in the app — linked task count appears (e.g., "1 tasks · 0 done")
4. Mark task done: `cargo run -p untask -- done 1`
5. Refresh — count updates to "1 tasks · 1 done"
6. Run `cargo run -p untask -- docs list --type prd` — shows only PRDs
7. Run `cargo run -p untask -- docs list --type doc` — shows only regular docs

**Step 3: Commit any fixups**

```bash
git add -A
git commit -m "fix: integration polish for PRD support"
```
