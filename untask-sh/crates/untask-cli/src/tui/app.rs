use ratatui::crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
use ratatui::layout::{Constraint, Layout, Rect};
use ratatui::style::{Modifier, Style};
use ratatui::widgets::{Block, List, ListItem, ListState, Paragraph, Tabs};
use ratatui::Frame;

use untask_core::store::TaskStore;
use untask_core::task::Task;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum View {
    Kanban,
    List,
    Docs,
    TaskDetail(u32),
}

pub struct App {
    pub view: View,
    pub tasks: Vec<Task>,
    pub should_quit: bool,
    pub selected: usize,
    store: TaskStore,
}

impl App {
    pub fn new(store: TaskStore) -> untask_core::error::Result<Self> {
        let mut app = Self {
            view: View::List,
            tasks: Vec::new(),
            should_quit: false,
            selected: 0,
            store,
        };

        app.refresh()?;
        Ok(app)
    }

    pub fn refresh(&mut self) -> untask_core::error::Result<()> {
        self.tasks = self.store.list(None)?;
        Ok(())
    }

    pub fn handle_key(&mut self, key: KeyEvent) {
        // Quit
        if key.code == KeyCode::Char('q')
            || (key.code == KeyCode::Char('c') && key.modifiers.contains(KeyModifiers::CONTROL))
        {
            self.should_quit = true;
            return;
        }

        // Escape: go back from detail view
        if key.code == KeyCode::Esc {
            if matches!(self.view, View::TaskDetail(_)) {
                self.view = View::List;
            }
            return;
        }

        // View switching
        match key.code {
            KeyCode::Char('1') => {
                self.view = View::Kanban;
                return;
            }
            KeyCode::Char('2') => {
                self.view = View::List;
                return;
            }
            KeyCode::Char('3') => {
                self.view = View::Docs;
                return;
            }
            KeyCode::Tab => {
                self.view = match self.view {
                    View::Kanban => View::List,
                    View::List => View::Docs,
                    View::Docs => View::Kanban,
                    View::TaskDetail(_) => View::List,
                };
                return;
            }
            _ => {}
        }

        // View-specific navigation
        match self.view {
            View::List | View::Kanban => self.handle_list_nav(key),
            View::Docs | View::TaskDetail(_) => {}
        }
    }

    fn handle_list_nav(&mut self, key: KeyEvent) {
        let count = self.tasks.len();
        if count == 0 {
            return;
        }

        match key.code {
            KeyCode::Down | KeyCode::Char('j') => {
                self.selected = (self.selected + 1).min(count - 1);
            }
            KeyCode::Up | KeyCode::Char('k') => {
                self.selected = self.selected.saturating_sub(1);
            }
            KeyCode::Home | KeyCode::Char('g') => {
                self.selected = 0;
            }
            KeyCode::End | KeyCode::Char('G') => {
                self.selected = count - 1;
            }
            KeyCode::Enter => {
                if let Some(task) = self.tasks.get(self.selected) {
                    if let Some(id) = task.id {
                        self.view = View::TaskDetail(id);
                    }
                }
            }
            _ => {}
        }
    }

    pub fn draw(&mut self, frame: &mut Frame) {
        let [header_area, main_area, footer_area] = Layout::vertical([
            Constraint::Length(1),
            Constraint::Fill(1),
            Constraint::Length(1),
        ])
        .areas(frame.area());

        self.draw_tabs(frame, header_area);

        match self.view {
            View::Kanban => self.draw_kanban(frame, main_area),
            View::List => self.draw_list(frame, main_area),
            View::Docs => self.draw_docs(frame, main_area),
            View::TaskDetail(id) => self.draw_detail(frame, main_area, id),
        }

        self.draw_footer(frame, footer_area);
    }

    fn draw_tabs(&self, frame: &mut Frame, area: Rect) {
        let titles = ["1:Kanban", "2:List", "3:Docs"];
        let selected = match self.view {
            View::Kanban => 0,
            View::List => 1,
            View::Docs => 2,
            View::TaskDetail(_) => 1,
        };

        let tabs = Tabs::new(titles)
            .select(selected)
            .highlight_style(Style::default().add_modifier(Modifier::BOLD | Modifier::UNDERLINED));

        frame.render_widget(tabs, area);
    }

    fn draw_list(&mut self, frame: &mut Frame, area: Rect) {
        let items: Vec<ListItem> = self
            .tasks
            .iter()
            .map(|task| {
                let id_str = task.id.map(|id| format!("#{id}")).unwrap_or_default();
                ListItem::new(format!("{id_str} {title} [{status}]", title = task.title, status = task.status))
            })
            .collect();

        let mut state = ListState::default();
        if !self.tasks.is_empty() {
            state.select(Some(self.selected));
        }

        let list = List::new(items)
            .block(Block::bordered().title("Tasks"))
            .highlight_style(Style::default().add_modifier(Modifier::REVERSED));

        frame.render_stateful_widget(list, area, &mut state);
    }

    fn draw_kanban(&self, frame: &mut Frame, area: Rect) {
        let columns: Vec<String> = self
            .store
            .config()
            .columns
            .iter()
            .map(|c| c.id.clone())
            .collect();

        if columns.is_empty() {
            let placeholder = Paragraph::new("No columns configured")
                .block(Block::bordered().title("Kanban"));
            frame.render_widget(placeholder, area);
            return;
        }

        let constraints: Vec<Constraint> = columns
            .iter()
            .map(|_| Constraint::Fill(1))
            .collect();

        let col_areas = Layout::horizontal(constraints).split(area);

        for (i, col_id) in columns.iter().enumerate() {
            let col_tasks: Vec<&Task> = self
                .tasks
                .iter()
                .filter(|t| {
                    self.store
                        .config()
                        .normalize_status(&t.status)
                        .as_deref()
                        == Some(col_id)
                })
                .collect();

            let items: Vec<ListItem> = col_tasks
                .iter()
                .map(|t| {
                    let id_str = t.id.map(|id| format!("#{id} ")).unwrap_or_default();
                    ListItem::new(format!("{id_str}{}", t.title))
                })
                .collect();

            let title = format!("{col_id} ({})", col_tasks.len());
            let list = List::new(items).block(Block::bordered().title(title));

            frame.render_widget(list, col_areas[i]);
        }
    }

    fn draw_docs(&self, frame: &mut Frame, area: Rect) {
        let placeholder =
            Paragraph::new("Docs view — coming soon").block(Block::bordered().title("Docs"));
        frame.render_widget(placeholder, area);
    }

    fn draw_detail(&self, frame: &mut Frame, area: Rect, id: u32) {
        let task = self.tasks.iter().find(|t| t.id == Some(id));

        let content = match task {
            Some(t) => {
                let priority = t
                    .priority
                    .map(|p| format!("{p:?}"))
                    .unwrap_or_else(|| "none".into());
                let tags = if t.tags.is_empty() {
                    "none".into()
                } else {
                    t.tags.join(", ")
                };
                let body = if t.body.is_empty() {
                    "(no body)"
                } else {
                    &t.body
                };
                format!(
                    "#{id} {title}\nStatus: {status}\nPriority: {priority}\nTags: {tags}\n\n{body}",
                    title = t.title,
                    status = t.status,
                )
            }
            None => format!("Task #{id} not found"),
        };

        let detail = Paragraph::new(content).block(Block::bordered().title(format!("Task #{id}")));
        frame.render_widget(detail, area);
    }

    fn draw_footer(&self, frame: &mut Frame, area: Rect) {
        let help = match self.view {
            View::TaskDetail(_) => "esc:back  q:quit",
            _ => "\u{2191}\u{2193}/jk:navigate  enter:open  tab:next view  q:quit",
        };

        let footer = Paragraph::new(help).style(Style::default().add_modifier(Modifier::DIM));
        frame.render_widget(footer, area);
    }
}
