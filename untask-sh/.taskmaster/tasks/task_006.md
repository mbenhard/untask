# Task ID: 6

**Title:** Repair Command Implementation

**Status:** pending

**Dependencies:** 5

**Priority:** high

**Description:** Implement repair --check and --write functionality to detect and fix unindexed tasks, mismatched IDs, and normalize statuses with explicit reporting.

**Details:**

Create the repair subsystem:

1. Create `crates/untask-core/src/repair.rs`:
```rust
#[derive(Debug, Serialize)]
pub struct RepairReport {
    pub unindexed_tasks: Vec<UnindexedTask>,
    pub mismatched_ids: Vec<MismatchedId>,
    pub unknown_statuses: Vec<UnknownStatus>,
    pub actions_taken: Vec<RepairAction>,  // Only populated if --write
}

#[derive(Debug, Serialize)]
pub struct UnindexedTask {
    pub path: PathBuf,
    pub has_frontmatter_id: bool,
    pub title: String,
}

pub fn check(project_root: &Path) -> Result<RepairReport>;
pub fn repair(project_root: &Path) -> Result<RepairReport>;
```

2. Detection logic:
   - Find files without numeric prefix (unindexed)
   - Find files where filename ID ≠ frontmatter ID (mismatched)
   - Find tasks with statuses not matching any column ID or alias (unknown)

3. Repair logic (only with --write):
   - Assign sequential IDs to unindexed tasks
   - Rename files to `{id}-{slug}.md` format
   - Update frontmatter `id` to match filename
   - Normalize statuses to canonical column IDs
   - Report all changes made

4. Handle ambiguous cases:
   - If multiple tasks would get same slug, append ID to disambiguate
   - Report ambiguities instead of silently resolving

5. Lock acquisition:
   - `check` is read-only, no lock needed
   - `repair` with write acquires lock

**Test Strategy:**

Create `crates/untask-core/tests/repair_test.rs`:
1. Test check detects unindexed file without frontmatter ID.
2. Test check detects unindexed file with frontmatter ID.
3. Test check detects mismatched filename/frontmatter IDs.
4. Test check detects unknown statuses.
5. Test repair --write assigns IDs to unindexed tasks.
6. Test repair --write renames files correctly.
7. Test repair --write normalizes statuses.
8. Test repair --write aligns frontmatter ID with filename.
9. Test check doesn't modify any files.
10. Test repair handles duplicate slugs by disambiguating.
