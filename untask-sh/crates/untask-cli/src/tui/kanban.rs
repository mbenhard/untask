use ratatui::Frame;
use ratatui::layout::{Constraint, Layout, Rect};
use ratatui::style::{Modifier, Style};
use ratatui::widgets::{Block, List, ListItem, Paragraph};

use untask_core::config::Config;
use untask_core::task::{Task, TaskKind};
use untask_core::types::Priority;

pub struct KanbanState {
    pub col: usize,
    pub row: usize,
}

impl KanbanState {
    pub fn new() -> Self {
        Self { col: 0, row: 0 }
    }

    pub fn clamp(&mut self, col_count: usize, row_counts: &[usize]) {
        if col_count == 0 {
            self.col = 0;
            self.row = 0;
            return;
        }
        self.col = self.col.min(col_count - 1);
        let rows = row_counts.get(self.col).copied().unwrap_or(0);
        if rows == 0 {
            self.row = 0;
        } else {
            self.row = self.row.min(rows - 1);
        }
    }

    pub fn move_left(&mut self) {
        self.col = self.col.saturating_sub(1);
        self.row = 0;
    }

    pub fn move_right(&mut self, col_count: usize) {
        if col_count > 0 {
            self.col = (self.col + 1).min(col_count - 1);
            self.row = 0;
        }
    }

    pub fn move_up(&mut self) {
        self.row = self.row.saturating_sub(1);
    }

    pub fn move_down(&mut self, row_count: usize) {
        if row_count > 0 {
            self.row = (self.row + 1).min(row_count - 1);
        }
    }
}

struct Column {
    id: String,
    tasks: Vec<usize>, // indices into the task list
}

fn build_columns(tasks: &[Task], config: &Config) -> Vec<Column> {
    let col_ids: Vec<String> = config.columns.iter().map(|c| c.id.clone()).collect();

    let mut columns: Vec<Column> = col_ids
        .iter()
        .map(|id| Column {
            id: id.clone(),
            tasks: Vec::new(),
        })
        .collect();

    let mut unmatched_indices = Vec::new();
    let mut unindexed_indices = Vec::new();

    for (i, task) in tasks.iter().enumerate() {
        if task.kind() != TaskKind::Managed {
            unindexed_indices.push(i);
            continue;
        }

        let canonical = config.normalize_status(&task.status);
        if let Some(ref status) = canonical
            && let Some(col) = columns.iter_mut().find(|c| &c.id == status)
        {
            col.tasks.push(i);
            continue;
        }
        unmatched_indices.push(i);
    }

    // Add unmatched column if there are any
    if !unmatched_indices.is_empty() {
        columns.push(Column {
            id: "unmatched".into(),
            tasks: unmatched_indices,
        });
    }

    if !unindexed_indices.is_empty() {
        columns.push(Column {
            id: "unindexed".into(),
            tasks: unindexed_indices,
        });
    }

    columns
}

fn priority_marker(priority: Option<Priority>) -> &'static str {
    match priority {
        Some(Priority::Urgent) => "!",
        Some(Priority::High) => "*",
        Some(Priority::Medium) => "\u{b7}",
        Some(Priority::Low) | None => " ",
    }
}

fn format_card(task: &Task) -> String {
    let marker = priority_marker(task.priority);
    let id_str = task.id.map(|id| format!("#{id} ")).unwrap_or_default();
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
    let unindexed = if task.kind() == TaskKind::UnindexedWithoutId {
        " ~"
    } else {
        ""
    };
    format!("{marker} {id_str}{}{progress}{tags}{unindexed}", task.title)
}

fn selected_task_index(tasks: &[Task], config: &Config, state: &KanbanState) -> Option<usize> {
    let columns = build_columns(tasks, config);
    columns
        .get(state.col)
        .and_then(|col| col.tasks.get(state.row))
        .copied()
}

pub fn selected_task<'a>(
    tasks: &'a [Task],
    config: &Config,
    state: &KanbanState,
) -> Option<&'a Task> {
    selected_task_index(tasks, config, state).map(|idx| &tasks[idx])
}

pub fn column_count(tasks: &[Task], config: &Config) -> usize {
    build_columns(tasks, config).len()
}

pub fn row_counts(tasks: &[Task], config: &Config) -> Vec<usize> {
    build_columns(tasks, config)
        .iter()
        .map(|c| c.tasks.len())
        .collect()
}

pub fn draw(tasks: &[Task], config: &Config, state: &KanbanState, frame: &mut Frame, area: Rect) {
    let columns = build_columns(tasks, config);

    if columns.is_empty() {
        let placeholder =
            Paragraph::new("No columns configured").block(Block::bordered().title("Kanban"));
        frame.render_widget(placeholder, area);
        return;
    }

    let constraints: Vec<Constraint> = columns.iter().map(|_| Constraint::Fill(1)).collect();
    let col_areas = Layout::horizontal(constraints).split(area);

    for (ci, col) in columns.iter().enumerate() {
        let is_selected_col = ci == state.col;

        let items: Vec<ListItem> = col
            .tasks
            .iter()
            .enumerate()
            .map(|(ri, &task_idx)| {
                let task = &tasks[task_idx];
                let text = format_card(task);
                let is_selected = is_selected_col && ri == state.row;
                ListItem::new(text).style(if is_selected {
                    Style::default().add_modifier(Modifier::REVERSED)
                } else {
                    Style::default()
                })
            })
            .collect();

        let title = format!("{} ({})", col.id, col.tasks.len());
        let block = if is_selected_col {
            Block::bordered()
                .title(title)
                .border_style(Style::default().add_modifier(Modifier::BOLD))
        } else {
            Block::bordered().title(title)
        };

        let list = List::new(items).block(block);
        frame.render_widget(list, col_areas[ci]);
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::{KanbanState, build_columns, selected_task};
    use untask_core::config::Config;
    use untask_core::task::Task;

    fn task(path: &str, id: Option<u32>, title: &str, status: &str) -> Task {
        Task {
            id,
            title: title.into(),
            status: status.into(),
            file_path: Some(PathBuf::from(path)),
            ..Task::default()
        }
    }

    #[test]
    fn builds_unmatched_and_unindexed_columns_separately() {
        let config = Config::default();
        let tasks = vec![
            task("001-managed.md", Some(1), "Managed todo", "todo"),
            task("002-weird.md", Some(2), "Managed weird", "blocked"),
            task("legacy-task.md", Some(9), "Legacy", "todo"),
            task("loose-note.md", None, "Loose", "todo"),
        ];

        let columns = build_columns(&tasks, &config);

        let todo = columns.iter().find(|column| column.id == "todo").unwrap();
        assert_eq!(todo.tasks, vec![0]);

        let unmatched = columns
            .iter()
            .find(|column| column.id == "unmatched")
            .unwrap();
        assert_eq!(unmatched.tasks, vec![1]);

        let unindexed = columns
            .iter()
            .find(|column| column.id == "unindexed")
            .unwrap();
        assert_eq!(unindexed.tasks, vec![2, 3]);
    }

    #[test]
    fn selected_task_helpers_follow_the_selected_column_and_row() {
        let config = Config::default();
        let tasks = vec![
            task("001-managed.md", Some(1), "Managed todo", "todo"),
            task("legacy-task.md", Some(9), "Legacy", "todo"),
        ];
        let state = KanbanState { col: 5, row: 0 };

        let task = selected_task(&tasks, &config, &state).unwrap();
        assert_eq!(task.title, "Legacy");
        assert_eq!(task.id, Some(9));
    }
}
