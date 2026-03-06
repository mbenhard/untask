# Task ID: 17

**Title:** Desktop Backend Commands and App State

**Status:** pending

**Dependencies:** 16, 8

**Priority:** high

**Description:** Implement Tauri commands for project operations, task CRUD, docs, search, next, repair, and recent project persistence.

**Details:**

Create backend command layer:

1. Create `apps/desktop/src-tauri/src/state.rs`:
```rust
use std::sync::Mutex;
use tauri::State;

pub struct AppState {
    pub current_project: Mutex<Option<PathBuf>>,
    pub store: Mutex<Option<TaskStore>>,
}

#[derive(Serialize, Deserialize)]
pub struct RecentProject {
    pub path: PathBuf,
    pub name: String,
    pub last_opened: DateTime<Utc>,
}
```

2. Implement commands in `src-tauri/src/lib.rs`:
```rust
#[tauri::command]
async fn open_project(path: String, state: State<'_, AppState>) -> Result<ProjectInfo, String>;

#[tauri::command]
async fn init_project(path: String) -> Result<(), String>;

#[tauri::command]
async fn list_tasks(state: State<'_, AppState>) -> Result<Vec<Task>, String>;

#[tauri::command]
async fn get_task(id: u32, state: State<'_, AppState>) -> Result<Task, String>;

#[tauri::command]
async fn add_task(title: String, status: Option<String>) -> Result<Task, String>;

#[tauri::command]
async fn update_task(id: u32, updates: TaskUpdate) -> Result<Task, String>;

#[tauri::command]
async fn delete_task(id: u32) -> Result<(), String>;

#[tauri::command]
async fn list_docs() -> Result<Vec<Doc>, String>;

#[tauri::command]
async fn read_doc(path: String) -> Result<String, String>;

#[tauri::command]
async fn save_doc(path: String, content: String) -> Result<(), String>;

#[tauri::command]
async fn search(query: String) -> Result<Vec<SearchResult>, String>;

#[tauri::command]
async fn get_next() -> Result<NextSummary, String>;

#[tauri::command]
async fn get_repair_summary() -> Result<RepairReport, String>;

#[tauri::command]
async fn get_recent_projects() -> Result<Vec<RecentProject>, String>;

#[tauri::command]
async fn get_last_project() -> Result<Option<RecentProject>, String>;
```

`list_docs`, `read_doc`, and `save_doc` must honor configured `config.docs` globs through the shared docs discovery layer rather than assuming `.untask/docs/` only.

3. Persist data to `~/Library/Application Support/Untask/`:
   - `recent_projects.json`
   - `last_project.json`

4. Handle missing remembered project gracefully.

**Test Strategy:**

Create Rust tests in `apps/desktop/src-tauri/tests/`:
1. Test open_project loads store correctly.
2. Test list_tasks returns tasks from store.
3. Test add_task creates task and returns it.
4. Test update_task modifies task.
5. Test delete_task removes task.
6. Test recent projects persistence.
7. Test last project restore.
8. Test missing project path returns clean error.
9. Manual test: open project → close → reopen → verify restore.
