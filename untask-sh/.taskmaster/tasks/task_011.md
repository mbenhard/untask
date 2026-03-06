# Task ID: 11

**Title:** Docs, Search, Next, Repair, and Skill CLI Commands

**Status:** pending

**Dependencies:** 6, 7, 8, 10

**Priority:** medium

**Description:** Implement remaining CLI commands: docs list/show, search, next, repair --check/--write, skill install, and open for macOS app launch.

**Details:**

Implement secondary commands:

1. **docs** command:
```rust
// docs (list all)
// docs show <name> - show specific doc, handle ambiguity
pub fn docs_list(json: bool) -> Result<()>;
pub fn docs_show(reference: &str, json: bool) -> Result<()>;
```

2. **search** command:
```rust
pub fn search(query: &str, tasks_only: bool, json: bool) -> Result<()> {
    let results = search::search(&root, query, tasks_only)?;
    // Format as list with snippets or JSON array
}
```

3. **next** command:
```rust
pub fn next(json: bool) -> Result<()> {
    let summary = next::generate_next(&root)?;
    if json {
        println!("{}", serde_json::to_string_pretty(&summary)?);
    } else {
        // Render as markdown sections
    }
}
```

4. **repair** command:
```rust
pub fn repair(check: bool, write: bool, json: bool) -> Result<()> {
    let report = if write {
        repair::repair(&root)?
    } else {
        repair::check(&root)?
    };
    // Output report
}
```

5. **skill install** command:
   - Ship bundled `skill/untask.md`
   - Teach agents to start sessions with `untask next`, set status before work, mark done after work, and write docs/plans into tracked project locations
   - Detect the primary target agent config path first and copy the bundled skill there
   - Print fallback instructions if the target path is missing or unsupported

6. **open** command:
   - On macOS: `open -a Untask .`
   - Fail clearly with message if app not installed

**Test Strategy:**

1. Test docs list shows all discovered docs.
2. Test docs show displays doc content.
3. Test docs show with ambiguous name returns helpful error.
4. Test search returns matching results.
5. Test search --json outputs valid JSON.
6. Test next outputs formatted summary.
7. Test next --json outputs valid JSON.
8. Test repair --check reports issues without modifying files.
9. Test repair --write fixes issues and reports changes.
10. Test repair --json outputs valid JSON report.
11. Test skill install prints instructions when path not found.
12. Test open fails gracefully when app not installed.
