# Task ID: 5

**Title:** Store Layer CRUD Operations

**Status:** pending

**Dependencies:** 3, 4

**Priority:** high

**Description:** Implement the task store with add, list, get, update, delete, and status-change operations ensuring reads are side-effect free and writes are atomic.

**Details:**

Create the core storage layer:

1. Create `crates/untask-core/src/store.rs`:
```rust
pub struct TaskStore {
    project_root: PathBuf,
    config: Config,
}

impl TaskStore {
    pub fn new(project_root: PathBuf) -> Result<Self>;
    
    // READ operations - NO side effects
    pub fn list(&self, filter: Option<TaskFilter>) -> Result<Vec<Task>>;
    pub fn get(&self, id: u32) -> Result<Task>;
    pub fn get_by_ref(&self, reference: &str) -> Result<Task>; // id or slug
    
    // WRITE operations - acquire lock, atomic writes
    pub fn add(&self, title: &str, status: Option<&str>) -> Result<Task>;
    pub fn update(&self, id: u32, updates: TaskUpdate) -> Result<Task>;
    pub fn delete(&self, id: u32) -> Result<()>;
    pub fn set_status(&self, id: u32, status: &str) -> Result<Task>;
    pub fn mark_done(&self, id: u32) -> Result<Task>;
}
```

2. ID allocation:
   - Scan existing files to find max ID
   - Allocate next sequential ID (gap-tolerant)
   - Never reuse deleted IDs

3. Write behavior:
   - Acquire `.untask/.lock` before any mutation
   - Normalize status to canonical column ID
   - Refresh `updated` timestamp
   - On `done` transition: set `completed` timestamp
   - On un-done transition: clear `completed` timestamp
   - Use atomic write (temp + rename)

4. Read behavior:
   - NEVER rename or modify files during list/get
   - Parse all .md files in `.untask/tasks/`
   - Classify as managed/unindexed but don't fix

**Test Strategy:**

Create `crates/untask-core/tests/store_test.rs`:
1. Test add creates file with correct filename format (001-slug.md).
2. Test list returns all tasks without modifying files.
3. Test get by ID returns correct task.
4. Test get by reference (slug) returns correct task.
5. Test update modifies frontmatter and refreshes `updated`.
6. Test delete removes file.
7. Test set_status normalizes aliases to canonical IDs.
8. Test mark_done sets `completed` timestamp.
9. Test moving task out of done clears `completed`.
10. Verify reads don't rename files (create unindexed file, list, verify filename unchanged).
11. Add concurrency tests for `add`, `status`, and `delete` showing writes serialize under the project lock.
