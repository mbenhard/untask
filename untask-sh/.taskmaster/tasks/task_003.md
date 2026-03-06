# Task ID: 3

**Title:** Task Parsing, Serialization, and Metadata Rules

**Status:** pending

**Dependencies:** 2

**Priority:** high

**Description:** Implement task parsing from markdown frontmatter, slug generation, subtask counting, and proper handling of managed vs unindexed tasks.

**Details:**

Create the task model and parsing logic:

1. Create `crates/untask-core/src/slug.rs`:
   - Implement `generate_slug(title: &str) -> String` using lowercase, replacing spaces/special chars with hyphens, removing consecutive hyphens, trimming
   - Keep slugs stable (never regenerate for existing tasks)

2. Create `crates/untask-core/src/task.rs`:
```rust
use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: Option<u32>,           // From filename prefix or frontmatter
    pub title: String,
    pub status: String,
    pub priority: Option<Priority>,
    pub tags: Vec<String>,
    pub created: Option<NaiveDate>,
    pub updated: Option<DateTime<Utc>>,
    pub completed: Option<DateTime<Utc>>,
    pub body: String,              // Markdown body after frontmatter
    pub file_path: Option<PathBuf>,
    pub subtask_progress: (u32, u32), // (completed, total)
}

#[derive(Debug, Clone, Copy)]
pub enum TaskKind {
    Managed,              // Has numeric filename prefix
    UnindexedWithId,      // No prefix but has frontmatter id
    UnindexedWithoutId,   // No prefix, no frontmatter id
}
```

3. Implement parsing:
   - Extract YAML frontmatter between `---` markers
   - Parse body markdown after frontmatter
   - Count checklist items: `- [ ]` (incomplete) and `- [x]` (complete)
   - Count only top-level checklist items for v1 progress math; ignore nested subtasks
   - Handle malformed frontmatter gracefully (preserve body, use defaults)
   - Parse filename for ID: `001-fix-login-bug.md` → id=1

4. Implement serialization:
   - Write frontmatter + body back to markdown
   - Preserve body content exactly as parsed

**Test Strategy:**

Create `crates/untask-core/tests/task_test.rs`:
1. Test parsing minimal task (title + status only).
2. Test parsing rich task with all fields.
3. Test malformed frontmatter falls back to body-only with defaults.
4. Test subtask counting: mix of `- [ ]` and `- [x]` items.
5. Test `completed` timestamp round-trip (set and cleared).
6. Test `updated` timestamp serialization.
7. Test classification of managed vs unindexed tasks.
8. Test slug generation produces stable, clean slugs.
9. Test filename ID extraction: `001-fix-bug.md` → id=1.
