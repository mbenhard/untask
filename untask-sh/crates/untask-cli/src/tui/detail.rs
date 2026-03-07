use ratatui::Frame;
use ratatui::layout::{Constraint, Layout, Rect};
use ratatui::style::{Modifier, Style};
use ratatui::widgets::{Block, Gauge, Paragraph, Wrap};

use untask_core::task::Task;
use untask_core::types::Priority;

fn format_priority(priority: Option<Priority>) -> &'static str {
    match priority {
        Some(Priority::Urgent) => "urgent",
        Some(Priority::High) => "high",
        Some(Priority::Medium) => "medium",
        Some(Priority::Low) => "low",
        None => "none",
    }
}

pub fn draw(tasks: &[Task], id: u32, frame: &mut Frame, area: Rect) {
    let task = tasks.iter().find(|t| t.id == Some(id));

    let Some(task) = task else {
        let msg = Paragraph::new(format!("Task #{id} not found"))
            .block(Block::bordered().title(format!("Task #{id}")));
        frame.render_widget(msg, area);
        return;
    };

    let has_progress = task.subtask_progress.1 > 0;

    // Layout: metadata + optional progress bar + body
    let constraints = if has_progress {
        vec![
            Constraint::Length(7), // metadata lines
            Constraint::Length(1), // progress bar
            Constraint::Fill(1),   // body
        ]
    } else {
        vec![
            Constraint::Length(7), // metadata lines
            Constraint::Fill(1),   // body
        ]
    };

    let chunks = Layout::vertical(constraints).split(area);

    // Metadata section
    let priority = format_priority(task.priority);
    let tags = if task.tags.is_empty() {
        "none".to_string()
    } else {
        task.tags.join(", ")
    };
    let created = task
        .created
        .map(|d| d.to_string())
        .unwrap_or_else(|| "-".into());
    let updated = task
        .updated
        .map(|d| d.format("%Y-%m-%d %H:%M").to_string())
        .unwrap_or_else(|| "-".into());
    let completed = task
        .completed
        .map(|d| d.format("%Y-%m-%d %H:%M").to_string());

    let mut meta = format!(
        " #{id} {title}\n Status: {status}\n Priority: {priority}\n Tags: {tags}\n Created: {created}\n Updated: {updated}",
        title = task.title,
        status = task.status,
    );

    if let Some(ref completed) = completed {
        meta.push_str(&format!("\n Completed: {completed}"));
    }

    let meta_widget = Paragraph::new(meta).block(Block::bordered().title(format!("Task #{id}")));
    frame.render_widget(meta_widget, chunks[0]);

    // Progress bar (if subtasks exist)
    let body_idx = if has_progress {
        let (done, total) = task.subtask_progress;
        let ratio = if total > 0 {
            done as f64 / total as f64
        } else {
            0.0
        };
        let label = format!("subtasks: {done}/{total}");
        let gauge = Gauge::default()
            .ratio(ratio)
            .label(label)
            .style(Style::default().add_modifier(Modifier::DIM));
        frame.render_widget(gauge, chunks[1]);
        2
    } else {
        1
    };

    // Body section
    let body_text = if task.body.is_empty() {
        "(no body)".to_string()
    } else {
        task.body.clone()
    };

    let body_widget = Paragraph::new(body_text)
        .block(Block::bordered().title("Body"))
        .wrap(Wrap { trim: false });
    frame.render_widget(body_widget, chunks[body_idx]);
}
