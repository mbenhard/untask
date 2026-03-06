# Task ID: 12

**Title:** CLI Output Formatting and Contract Tests

**Status:** pending

**Dependencies:** 10, 11

**Priority:** medium

**Description:** Implement consistent output formatting with monochrome/color/plain modes, and add snapshot tests for JSON output stability.

**Details:**

Create robust output handling:

1. Create `crates/untask-cli/src/output.rs`:
```rust
pub enum OutputMode {
    Color,
    Monochrome,
    Plain,
}

impl OutputMode {
    pub fn detect(no_color: bool) -> Self {
        if no_color || std::env::var("NO_COLOR").is_ok() {
            Self::Monochrome
        } else if atty::is(atty::Stream::Stdout) {
            Self::Color
        } else {
            Self::Plain
        }
    }
}

pub struct Formatter {
    mode: OutputMode,
}

impl Formatter {
    pub fn task_row(&self, task: &Task) -> String;
    pub fn task_detail(&self, task: &Task) -> String;
    pub fn success(&self, msg: &str) -> String;
    pub fn error(&self, msg: &str) -> String;
    pub fn warning(&self, msg: &str) -> String;
}
```

2. Consistent formatting across commands:
   - list: tabular format with ID, title, status, priority, tags
   - show: full task details with body
   - search: results with snippets and context
   - next: markdown-style sections
   - repair: report format with actionable items

3. Add `insta` crate for snapshot testing.

4. Create snapshot tests for JSON output:
   - Capture actual JSON output from commands
   - Store as snapshots for regression testing
   - Test list, show, next, search, repair JSON payloads

**Test Strategy:**

Create `crates/untask-cli/tests/cli_snapshot_test.rs`:
1. Test NO_COLOR=1 produces monochrome output.
2. Test --no-color produces monochrome output.
3. Test piped output produces plain format.
4. Test TTY output produces colored format.
5. Snapshot test: list --json output structure.
6. Snapshot test: show --json output structure.
7. Snapshot test: next --json output structure.
8. Snapshot test: search --json output structure.
9. Snapshot test: repair --json output structure.
10. Verify JSON outputs are stable for AI agent consumption.
