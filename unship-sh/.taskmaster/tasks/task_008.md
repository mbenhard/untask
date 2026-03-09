# Task ID: 8

**Title:** Git Summary and Next Command Implementation

**Status:** pending

**Dependencies:** 5, 6

**Priority:** medium

**Description:** Implement git summary with graceful fallback and the 'next' command that aggregates recent commits, open tasks, completed tasks, and cleanup hints.

**Details:**

Create git integration and next summary:

1. Create `crates/unship-core/src/git.rs`:
```rust
pub struct GitSummary {
    pub recent_commits: Vec<Commit>,
    pub branch: String,
    pub has_uncommitted_changes: bool,
}

pub struct Commit {
    pub hash: String,
    pub message: String,
    pub author: String,
    pub timestamp: DateTime<Utc>,
}

pub fn get_summary(project_root: &Path, limit: usize) -> Option<GitSummary>;
```

2. Git implementation:
   - Use `git log --oneline -n {limit}` for recent commits
   - Use `git branch --show-current` for branch name
   - Use `git status --porcelain` for uncommitted changes
   - Return `None` gracefully if git unavailable or not a repo
   - Handle empty history (new repos)

3. Create `crates/unship-core/src/next.rs`:
```rust
pub struct NextSummary {
    pub git: Option<GitSummary>,
    pub open_tasks: Vec<Task>,
    pub recently_completed: Vec<Task>,
    pub cleanup_hints: Vec<CleanupHint>,
}

pub struct CleanupHint {
    pub kind: CleanupKind,  // Unindexed, UnmatchedStatus
    pub path: PathBuf,
    pub message: String,
}

pub fn generate_next(project_root: &Path) -> Result<NextSummary>;
```

4. Next logic:
   - Include recent git commits (last 5-10)
   - Open tasks sorted by priority then updated date
   - Recently completed tasks using `completed` timestamp (last 7 days)
   - Cleanup hints from repair check
   - Omit empty sections in output

**Test Strategy:**

Create `crates/unship-core/tests/next_test.rs`:
1. Test git summary returns None when not in git repo.
2. Test git summary returns commits when available.
3. Test next includes open tasks sorted by priority.
4. Test next includes recently completed tasks using completed timestamp.
5. Test next omits empty sections.
6. Test next includes cleanup hints for unindexed tasks.
7. Test next includes cleanup hints for unmatched statuses.
8. Test recently completed filter respects time window.
9. Test next works in non-git directory (git section omitted).
