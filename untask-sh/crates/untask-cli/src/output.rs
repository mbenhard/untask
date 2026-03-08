use std::fmt::Write;

use colored::Colorize;
use untask_core::task::Task;
/// How to render CLI output depending on terminal capabilities and user preferences.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OutputMode {
    /// Full ANSI color (interactive TTY, no NO_COLOR).
    Color,
    /// Structured text but no ANSI codes (NO_COLOR or --no-color).
    Monochrome,
    /// Minimal plain output (piped / non-TTY stdout).
    Plain,
}

impl OutputMode {
    pub fn detect(no_color_flag: bool) -> Self {
        Self::from_context(
            no_color_flag,
            std::env::var_os("NO_COLOR").is_some(),
            atty::is(atty::Stream::Stdout),
        )
    }

    fn from_context(no_color_flag: bool, no_color_env_present: bool, stdout_is_tty: bool) -> Self {
        if no_color_flag || no_color_env_present {
            Self::Monochrome
        } else if stdout_is_tty {
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
    pub fn new(mode: OutputMode) -> Self {
        Self { mode }
    }

    // ── Task list row ───────────────────────────────────────────────

    pub fn task_row(&self, task: &Task, id_width: usize) -> String {
        let id_str = task
            .id
            .map(|id| format!("{id:>width$}", width = id_width))
            .unwrap_or_else(|| " ".repeat(id_width));

        let progress = if task.subtask_progress.1 > 0 {
            format!(" [{}/{}]", task.subtask_progress.0, task.subtask_progress.1)
        } else {
            String::new()
        };

        let tags = if task.tags.is_empty() {
            String::new()
        } else {
            format!(" [{}]", task.tags.join(", "))
        };

        match self.mode {
            OutputMode::Color => {
                let padded_status = format!("{:<12}", task.status);
                let status_colored = colorize_status(&task.status, &padded_status);
                format!(
                    "  #{id_str}  {status_colored}  {title}{tags}{progress}",
                    title = task.title,
                )
            }
            OutputMode::Monochrome | OutputMode::Plain => {
                format!(
                    "  #{id_str}  {status:<12}  {title}{tags}{progress}",
                    status = task.status,
                    title = task.title,
                )
            }
        }
    }

    // ── Task detail ─────────────────────────────────────────────────

    pub fn task_detail(&self, task: &Task) -> String {
        let mut out = String::new();
        let id_str = task
            .id
            .map(|id| format!("#{id}"))
            .unwrap_or_else(|| "?".into());

        match self.mode {
            OutputMode::Color => {
                let _ = writeln!(out, "{} {}", id_str.bold(), task.title.bold());
                let _ = writeln!(
                    out,
                    "Status: {}",
                    colorize_status(&task.status, &task.status)
                );
            }
            _ => {
                let _ = writeln!(out, "{id_str} {}", task.title);
                let _ = writeln!(out, "Status: {}", task.status);
            }
        }

        if !task.tags.is_empty() {
            let _ = writeln!(out, "Tags: {}", task.tags.join(", "));
        }
        if let Some(created) = task.created {
            let _ = writeln!(out, "Created: {created}");
        }
        if let Some(updated) = task.updated {
            let _ = writeln!(out, "Updated: {}", updated.format("%Y-%m-%d %H:%M"));
        }
        if let Some(completed) = task.completed {
            let _ = writeln!(out, "Completed: {}", completed.format("%Y-%m-%d %H:%M"));
        }
        if task.subtask_progress.1 > 0 {
            let _ = writeln!(
                out,
                "Progress: {}/{}",
                task.subtask_progress.0, task.subtask_progress.1
            );
        }
        if !task.attachments.is_empty() {
            let _ = writeln!(out, "Attachments:");
            for attachment in &task.attachments {
                let _ = writeln!(
                    out,
                    "  - {} ({}, {} bytes)",
                    attachment.filename, attachment.mime_type, attachment.size
                );
            }
        }
        if !task.body.is_empty() {
            let _ = writeln!(out);
            out.push_str(&task.body);
            if !task.body.ends_with('\n') {
                out.push('\n');
            }
        }
        out
    }

    pub fn completed_task_row(&self, task: &Task, id_width: usize) -> String {
        let mut row = self.task_row(task, id_width);
        if let Some(completed) = task.completed {
            let _ = write!(row, " ({})", completed.format("%Y-%m-%d"));
        }
        row
    }

    pub fn heading(&self, title: &str) -> String {
        let text = format!("## {title}");
        match self.mode {
            OutputMode::Color => text.bold().to_string(),
            _ => text,
        }
    }

    pub fn section_title(&self, title: &str) -> String {
        let text = format!("{title}:");
        match self.mode {
            OutputMode::Color => text.bold().to_string(),
            _ => text,
        }
    }

    pub fn search_result(
        &self,
        kind_label: &str,
        title: &str,
        location: &str,
        snippet: &str,
    ) -> String {
        let mut out = String::new();
        match self.mode {
            OutputMode::Color => {
                let _ = writeln!(out, "{} {}", colorize_kind(kind_label), title.bold());
                let _ = writeln!(out, "  {}", location.dimmed());
            }
            _ => {
                let _ = writeln!(out, "[{kind_label}] {title}");
                let _ = writeln!(out, "  {location}");
            }
        }
        let _ = writeln!(out, "  {snippet}");
        out.push('\n');
        out
    }

    pub fn path_detail(&self, path: &str, detail: &str) -> String {
        match self.mode {
            OutputMode::Color => format!("  {} - {}", path.dimmed(), detail),
            _ => format!("  {path} - {detail}"),
        }
    }

    pub fn bullet(&self, text: &str) -> String {
        format!("  - {text}")
    }

    // ── Message helpers ─────────────────────────────────────────────

    pub fn success(&self, msg: &str) -> String {
        match self.mode {
            OutputMode::Color => format!("{}", msg.green()),
            _ => msg.to_string(),
        }
    }

    pub fn error(&self, msg: &str) -> String {
        match self.mode {
            OutputMode::Color => format!("{}", msg.red()),
            _ => msg.to_string(),
        }
    }

    pub fn warning(&self, msg: &str) -> String {
        match self.mode {
            OutputMode::Color => format!("{}", msg.yellow()),
            _ => msg.to_string(),
        }
    }
}

fn colorize_status(status: &str, text: &str) -> String {
    match status {
        "done" => text.green().to_string(),
        "in-progress" => text.cyan().to_string(),
        "review" => text.magenta().to_string(),
        "todo" => text.yellow().to_string(),
        "backlog" => text.dimmed().to_string(),
        _ => text.to_string(),
    }
}

fn colorize_kind(kind_label: &str) -> String {
    match kind_label {
        "task" => "[task]".cyan().to_string(),
        "doc" => "[doc]".blue().to_string(),
        _ => format!("[{kind_label}]"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn monochrome_mode_when_no_color_flag() {
        let mode = OutputMode::detect(true);
        assert_eq!(mode, OutputMode::Monochrome);
    }

    #[test]
    fn monochrome_mode_when_no_color_env_is_present() {
        let mode = OutputMode::from_context(false, true, true);
        assert_eq!(mode, OutputMode::Monochrome);
    }

    #[test]
    fn color_mode_when_stdout_is_tty() {
        let mode = OutputMode::from_context(false, false, true);
        assert_eq!(mode, OutputMode::Color);
    }

    #[test]
    fn plain_mode_when_stdout_is_not_tty() {
        let mode = OutputMode::from_context(false, false, false);
        assert_eq!(mode, OutputMode::Plain);
    }

    #[test]
    fn formatter_success_monochrome_has_no_ansi() {
        let fmt = Formatter::new(OutputMode::Monochrome);
        assert_eq!(fmt.success("ok"), "ok");
    }

    #[test]
    fn formatter_error_monochrome_has_no_ansi() {
        let fmt = Formatter::new(OutputMode::Monochrome);
        assert_eq!(fmt.error("fail"), "fail");
    }

    #[test]
    fn formatter_warning_monochrome_has_no_ansi() {
        let fmt = Formatter::new(OutputMode::Monochrome);
        assert_eq!(fmt.warning("warn"), "warn");
    }

    #[test]
    fn color_task_rows_keep_plain_alignment_after_stripping_ansi() {
        let fmt = Formatter::new(OutputMode::Color);
        let task = Task {
            id: Some(7),
            title: "Implement auth".into(),
            status: "in-progress".into(),
            tags: vec!["backend".into()],
            subtask_progress: (1, 2),
            ..Task::default()
        };

        assert_eq!(
            strip_ansi(&fmt.task_row(&task, 2)),
            "  # 7  in-progress   Implement auth [backend] [1/2]"
        );
    }

    fn strip_ansi(input: &str) -> String {
        let mut out = String::new();
        let mut chars = input.chars().peekable();

        while let Some(ch) = chars.next() {
            if ch == '\u{1b}' && chars.peek() == Some(&'[') {
                chars.next();
                for next in chars.by_ref() {
                    if next.is_ascii_alphabetic() {
                        break;
                    }
                }
                continue;
            }

            out.push(ch);
        }

        out
    }
}
