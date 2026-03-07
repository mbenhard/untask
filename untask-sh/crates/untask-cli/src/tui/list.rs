use ratatui::Frame;
use ratatui::layout::{Constraint, Layout, Rect};
use ratatui::style::{Modifier, Style};
use ratatui::widgets::{Block, Cell, Paragraph, Row, Table, TableState};

use untask_core::config::Config;
use untask_core::task::Task;
use untask_core::types::Priority;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SortField {
    Id,
    Priority,
    Updated,
    Title,
}

impl SortField {
    pub fn label(self) -> &'static str {
        match self {
            Self::Id => "id",
            Self::Priority => "priority",
            Self::Updated => "updated",
            Self::Title => "title",
        }
    }

    pub fn cycle(self) -> Self {
        match self {
            Self::Id => Self::Priority,
            Self::Priority => Self::Updated,
            Self::Updated => Self::Title,
            Self::Title => Self::Id,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FilterField {
    Status,
    Tag,
    Priority,
}

impl FilterField {
    pub fn label(self) -> &'static str {
        match self {
            Self::Status => "status",
            Self::Tag => "tag",
            Self::Priority => "priority",
        }
    }

    pub fn cycle(self) -> Self {
        match self {
            Self::Status => Self::Tag,
            Self::Tag => Self::Priority,
            Self::Priority => Self::Status,
        }
    }
}

pub struct ListViewState {
    pub selected: usize,
    pub sort_field: SortField,
    pub filter_status: Option<String>,
    pub filter_tag: Option<String>,
    pub filter_priority: Option<Priority>,
    pub editing_filter: bool,
    pub filter_field: FilterField,
    pub filter_input: String,
}

impl ListViewState {
    pub fn new() -> Self {
        Self {
            selected: 0,
            sort_field: SortField::Id,
            filter_status: None,
            filter_tag: None,
            filter_priority: None,
            editing_filter: false,
            filter_field: FilterField::Status,
            filter_input: String::new(),
        }
    }

    pub fn has_active_filter(&self) -> bool {
        self.filter_status.is_some() || self.filter_tag.is_some() || self.filter_priority.is_some()
    }

    pub fn clear_filters(&mut self) {
        self.filter_status = None;
        self.filter_tag = None;
        self.filter_priority = None;
        self.editing_filter = false;
        self.filter_input.clear();
    }

    pub fn apply_filter(&mut self, config: &Config) {
        let input = self.filter_input.trim().to_string();
        if input.is_empty() {
            match self.filter_field {
                FilterField::Status => self.filter_status = None,
                FilterField::Tag => self.filter_tag = None,
                FilterField::Priority => self.filter_priority = None,
            }
        } else {
            match self.filter_field {
                FilterField::Status => {
                    self.filter_status = config.normalize_status(&input).or(Some(input));
                }
                FilterField::Tag => {
                    self.filter_tag = Some(input);
                }
                FilterField::Priority => {
                    self.filter_priority = parse_priority(&input);
                }
            }
        }
        self.editing_filter = false;
        self.filter_input.clear();
        self.selected = 0;
    }
}

fn parse_priority(s: &str) -> Option<Priority> {
    match s.to_lowercase().as_str() {
        "low" | "l" => Some(Priority::Low),
        "medium" | "med" | "m" => Some(Priority::Medium),
        "high" | "h" => Some(Priority::High),
        "urgent" | "u" => Some(Priority::Urgent),
        _ => None,
    }
}

fn priority_marker(priority: Option<Priority>) -> &'static str {
    match priority {
        Some(Priority::Urgent) => "!",
        Some(Priority::High) => "*",
        Some(Priority::Medium) => "\u{b7}",
        Some(Priority::Low) | None => " ",
    }
}

fn format_priority_label(priority: Option<Priority>) -> &'static str {
    match priority {
        Some(Priority::Urgent) => "urgent",
        Some(Priority::High) => "high",
        Some(Priority::Medium) => "medium",
        Some(Priority::Low) => "low",
        None => "",
    }
}

pub fn filtered_tasks<'a>(
    tasks: &'a [Task],
    state: &ListViewState,
    config: &Config,
) -> Vec<&'a Task> {
    let mut result: Vec<&Task> = tasks.iter().collect();

    if let Some(ref status) = state.filter_status {
        let canonical = config.normalize_status(status).unwrap_or_default();
        result.retain(|t| config.normalize_status(&t.status).unwrap_or_default() == canonical);
    }
    if let Some(ref tag) = state.filter_tag {
        let tag_lower = tag.to_lowercase();
        result.retain(|t| t.tags.iter().any(|t| t.to_lowercase() == tag_lower));
    }
    if let Some(priority) = state.filter_priority {
        result.retain(|t| t.priority == Some(priority));
    }

    // Sort
    match state.sort_field {
        SortField::Id => {} // already sorted by id from store
        SortField::Priority => result.sort_by(|a, b| a.priority.cmp(&b.priority).reverse()),
        SortField::Updated => result.sort_by(|a, b| b.updated.cmp(&a.updated)),
        SortField::Title => {
            result.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()))
        }
    }

    result
}

pub fn draw(tasks: &[Task], state: &ListViewState, config: &Config, frame: &mut Frame, area: Rect) {
    let visible = filtered_tasks(tasks, state, config);

    // Layout: optional filter bar + table
    let areas = if state.editing_filter || state.has_active_filter() {
        let chunks = Layout::vertical([Constraint::Length(1), Constraint::Fill(1)]).split(area);
        draw_filter_bar(state, frame, chunks[0]);
        chunks[1]
    } else {
        area
    };

    if visible.is_empty() {
        let msg = if state.has_active_filter() {
            "No tasks match filter"
        } else {
            "No tasks"
        };
        let placeholder = Paragraph::new(msg).block(Block::bordered().title("Tasks"));
        frame.render_widget(placeholder, areas);
        return;
    }

    let id_width = visible
        .iter()
        .filter_map(|t| t.id)
        .map(|id| id.to_string().len())
        .max()
        .unwrap_or(2)
        .max(2);

    let header = Row::new(vec![
        Cell::new(" "),
        Cell::new("ID"),
        Cell::new("Title"),
        Cell::new("Status"),
        Cell::new("Pri"),
        Cell::new("Tags"),
        Cell::new("Progress"),
    ])
    .style(Style::default().add_modifier(Modifier::BOLD | Modifier::DIM));

    let rows: Vec<Row> = visible
        .iter()
        .map(|task| {
            let id_str = task
                .id
                .map(|id| format!("{id:>width$}", width = id_width))
                .unwrap_or_else(|| " ".repeat(id_width));
            let progress = if task.subtask_progress.1 > 0 {
                format!("{}/{}", task.subtask_progress.0, task.subtask_progress.1)
            } else {
                String::new()
            };
            let tags = task.tags.join(", ");

            Row::new(vec![
                Cell::new(priority_marker(task.priority)),
                Cell::new(id_str),
                Cell::new(task.title.as_str()),
                Cell::new(task.status.as_str()),
                Cell::new(format_priority_label(task.priority)),
                Cell::new(tags),
                Cell::new(progress),
            ])
        })
        .collect();

    let widths = [
        Constraint::Length(1),
        Constraint::Length(id_width as u16 + 1),
        Constraint::Fill(1),
        Constraint::Length(12),
        Constraint::Length(7),
        Constraint::Length(12),
        Constraint::Length(5),
    ];

    let sort_label = state.sort_field.label();
    let title = format!("Tasks [sort:{sort_label}]");

    let table = Table::new(rows, widths)
        .header(header)
        .block(Block::bordered().title(title))
        .row_highlight_style(Style::default().add_modifier(Modifier::REVERSED));

    let mut table_state = TableState::default();
    table_state.select(Some(state.selected));

    frame.render_stateful_widget(table, areas, &mut table_state);
}

fn draw_filter_bar(state: &ListViewState, frame: &mut Frame, area: Rect) {
    let mut parts = Vec::new();

    if let Some(ref s) = state.filter_status {
        parts.push(format!("status:{s}"));
    }
    if let Some(ref t) = state.filter_tag {
        parts.push(format!("tag:{t}"));
    }
    if let Some(p) = state.filter_priority {
        parts.push(format!("priority:{}", format_priority_label(Some(p))));
    }

    let text = if state.editing_filter {
        let field = state.filter_field.label();
        let existing = if parts.is_empty() {
            String::new()
        } else {
            format!(" | {}", parts.join(" "))
        };
        format!(" filter {field}:{}{existing}", state.filter_input)
    } else {
        format!(" filter: {}", parts.join(" | "))
    };

    let bar = Paragraph::new(text).style(Style::default().add_modifier(Modifier::DIM));
    frame.render_widget(bar, area);
}
