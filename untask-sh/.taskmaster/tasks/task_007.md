# Task ID: 7

**Title:** Docs Discovery and Search Implementation

**Status:** done

**Dependencies:** 5

**Priority:** medium

**Description:** Implement doc discovery honoring config.docs globs, duplicate basename handling with disambiguation, and search across tasks and docs.

**Details:**

Create docs and search functionality:

1. Create `crates/untask-core/src/docs.rs`:
```rust
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
    pub fn list(&self) -> Result<Vec<Doc>>;
    pub fn get(&self, reference: &str) -> Result<Doc>;
}
```

2. Doc discovery:
   - Resolve globs from `config.docs` relative to project root
   - Deduplicate by canonical path
   - Include `.untask/docs/**/*.md` by default
   - Handle duplicate basenames: return Ambiguous error with all matching paths

3. Create `crates/untask-core/src/search.rs`:
```rust
pub struct SearchResult {
    pub kind: SearchResultKind,  // Task or Doc
    pub path: PathBuf,
    pub title: String,
    pub snippet: String,
    pub line_number: u32,
}

pub fn search(
    project_root: &Path,
    query: &str,
    tasks_only: bool,
) -> Result<Vec<SearchResult>>;
```

4. Search implementation:
   - Case-insensitive substring search
   - Search task titles, bodies, and tags
   - Search doc content
   - Return contextual snippets with match highlighting
   - Respect `tasks_only` flag

**Test Strategy:**

Create `crates/untask-core/tests/docs_test.rs` and `search_test.rs`:
1. Test doc list discovers files from config.docs globs.
2. Test doc list deduplicates by canonical path.
3. Test doc get by unique basename succeeds.
4. Test doc get by ambiguous basename returns Ambiguous error with paths.
5. Test doc get by relative path succeeds for disambiguation.
6. Test configured doc globs outside `.untask/docs` are discovered.
7. Test search finds matches in task titles.
8. Test search finds matches in task bodies.
9. Test search finds matches in docs.
10. Test search with tasks_only excludes docs.
11. Test search returns contextual snippets.
