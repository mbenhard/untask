use std::path::{Path, PathBuf};
use std::process::Command;

use ratatui::Frame;
use ratatui::crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
use ratatui::layout::{Constraint, Layout, Rect};
use ratatui::style::{Modifier, Style};
use ratatui::widgets::{Paragraph, Tabs};

use untask_core::docs::DocsStore;
use untask_core::store::TaskStore;
use untask_core::task::Task;

use super::detail;
use super::docs::DocsViewState;
use super::kanban::{self, KanbanState};
use super::list::{self, ListViewState};

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
    pub message: Option<String>,

    pub kanban: KanbanState,
    pub list: ListViewState,
    pub docs_state: DocsViewState,

    store: TaskStore,
    docs_store: DocsStore,
    project_root: PathBuf,
    detail_return_view: View,
}

impl App {
    pub fn new(store: TaskStore, project_root: PathBuf) -> untask_core::error::Result<Self> {
        let docs_store = DocsStore::new(project_root.clone());
        let mut app = Self {
            view: View::List,
            tasks: Vec::new(),
            should_quit: false,
            message: None,
            kanban: KanbanState::new(),
            list: ListViewState::new(),
            docs_state: DocsViewState::new(),
            store,
            docs_store,
            project_root,
            detail_return_view: View::List,
        };

        app.refresh()?;
        Ok(app)
    }

    pub fn refresh(&mut self) -> untask_core::error::Result<()> {
        self.tasks = self.store.list(None)?;

        // Clamp kanban selection
        let row_counts = kanban::row_counts(&self.tasks, self.store.config());
        self.kanban.clamp(
            kanban::column_count(&self.tasks, self.store.config()),
            &row_counts,
        );

        // Clamp list selection
        let visible = list::filtered_tasks(&self.tasks, &self.list, self.store.config());
        if visible.is_empty() {
            self.list.selected = 0;
        } else {
            self.list.selected = self.list.selected.min(visible.len() - 1);
        }

        // Refresh docs
        self.docs_state.docs = self.docs_store.list().unwrap_or_default();
        self.docs_state.clamp();

        // Exit stale detail view
        if let View::TaskDetail(id) = self.view
            && !self.tasks.iter().any(|task| task.id == Some(id))
        {
            self.exit_detail_view();
        }

        Ok(())
    }

    pub fn handle_key(&mut self, key: KeyEvent) {
        // Handle filter input mode first
        if self.list.editing_filter {
            self.handle_filter_input(key);
            return;
        }

        // Quit
        if key.code == KeyCode::Char('q')
            || (key.code == KeyCode::Char('c') && key.modifiers.contains(KeyModifiers::CONTROL))
        {
            self.should_quit = true;
            return;
        }

        // Escape: go back from detail or clear filter
        if key.code == KeyCode::Esc {
            match self.view {
                View::TaskDetail(_) => {
                    self.exit_detail_view();
                    return;
                }
                View::List if self.list.has_active_filter() => {
                    self.list.clear_filters();
                    return;
                }
                _ => return,
            }
        }

        // View switching (number keys)
        match key.code {
            KeyCode::Char('1') => {
                self.set_main_view(View::Kanban);
                return;
            }
            KeyCode::Char('2') => {
                self.set_main_view(View::List);
                return;
            }
            KeyCode::Char('3') => {
                self.set_main_view(View::Docs);
                return;
            }
            KeyCode::Tab if !matches!(self.view, View::TaskDetail(_)) => {
                self.cycle_view();
                return;
            }
            _ => {}
        }

        // View-specific input
        match self.view {
            View::Kanban => self.handle_kanban_key(key),
            View::List => self.handle_list_key(key),
            View::Docs => self.handle_docs_key(key),
            View::TaskDetail(id) => self.handle_detail_key(key, id),
        }
    }

    fn cycle_view(&mut self) {
        let next_view = match self.view {
            View::Kanban => View::List,
            View::List => View::Docs,
            View::Docs => View::Kanban,
            View::TaskDetail(_) => View::List,
        };
        self.set_main_view(next_view);
    }

    fn set_main_view(&mut self, view: View) {
        debug_assert!(!matches!(view, View::TaskDetail(_)));
        self.detail_return_view = view;
        self.view = view;
    }

    fn exit_detail_view(&mut self) {
        self.view = self.detail_return_view;
    }

    fn open_task_detail(&mut self, id: u32) {
        self.detail_return_view = match self.view {
            View::TaskDetail(_) => self.detail_return_view,
            view => view,
        };
        self.view = View::TaskDetail(id);
    }

    pub(super) fn refresh_or_message(&mut self) {
        if let Err(err) = self.refresh() {
            self.message = Some(format!("Refresh failed: {err}"));
        }
    }

    fn show_missing_id_message(&mut self) {
        self.message = Some("Unindexed task has no ID; run untask repair --check.".into());
    }

    fn open_task_or_message(&mut self, id: Option<u32>) {
        if let Some(id) = id {
            self.open_task_detail(id);
        } else {
            self.show_missing_id_message();
        }
    }

    fn mark_task_done(&mut self, id: Option<u32>) {
        let Some(id) = id else {
            self.show_missing_id_message();
            return;
        };

        match self.store.mark_done(id) {
            Ok(_) => {
                self.message = Some(format!("Task #{id} marked done"));
                self.refresh_or_message();
            }
            Err(err) => {
                self.message = Some(format!("Failed to mark task #{id} done: {err}"));
            }
        }
    }

    fn open_path_in_editor(&mut self, path: &Path) {
        match self.open_in_editor(path) {
            Ok(()) => self.refresh_or_message(),
            Err(err) => {
                self.message = Some(format!(
                    "Failed to open editor for {}: {err}",
                    path.display()
                ));
            }
        }
    }

    // ── Kanban input ──────────────────────────────────────────────

    fn handle_kanban_key(&mut self, key: KeyEvent) {
        let config = self.store.config();
        let col_count = kanban::column_count(&self.tasks, config);
        let row_counts = kanban::row_counts(&self.tasks, config);
        let current_rows = row_counts.get(self.kanban.col).copied().unwrap_or(0);

        match key.code {
            KeyCode::Left | KeyCode::Char('h') => self.kanban.move_left(),
            KeyCode::Right | KeyCode::Char('l') => self.kanban.move_right(col_count),
            KeyCode::Up | KeyCode::Char('k') => self.kanban.move_up(),
            KeyCode::Down | KeyCode::Char('j') => self.kanban.move_down(current_rows),
            KeyCode::Enter => {
                let id = kanban::selected_task(&self.tasks, config, &self.kanban)
                    .and_then(|task| task.id);
                self.open_task_or_message(id);
            }
            KeyCode::Char('d') => {
                self.mark_selected_done_kanban();
            }
            _ => {}
        }
    }

    fn mark_selected_done_kanban(&mut self) {
        let config = self.store.config();
        let id = kanban::selected_task(&self.tasks, config, &self.kanban).and_then(|task| task.id);
        self.mark_task_done(id);
    }

    // ── List input ────────────────────────────────────────────────

    fn handle_list_key(&mut self, key: KeyEvent) {
        let visible_count =
            list::filtered_tasks(&self.tasks, &self.list, self.store.config()).len();

        match key.code {
            KeyCode::Down | KeyCode::Char('j') => {
                if visible_count > 0 {
                    self.list.selected = (self.list.selected + 1).min(visible_count - 1);
                }
            }
            KeyCode::Up | KeyCode::Char('k') => {
                self.list.selected = self.list.selected.saturating_sub(1);
            }
            KeyCode::Home | KeyCode::Char('g') => {
                self.list.selected = 0;
            }
            KeyCode::End | KeyCode::Char('G') => {
                if visible_count > 0 {
                    self.list.selected = visible_count - 1;
                }
            }
            KeyCode::Enter => {
                self.open_selected_list_task();
            }
            KeyCode::Char('d') => {
                self.mark_selected_done_list();
            }
            KeyCode::Char('s') => {
                self.list.sort_field = self.list.sort_field.cycle();
            }
            KeyCode::Char('f') | KeyCode::Char('/') => {
                self.list.editing_filter = true;
                self.list.filter_input.clear();
            }
            _ => {}
        }
    }

    fn handle_filter_input(&mut self, key: KeyEvent) {
        match key.code {
            KeyCode::Esc => {
                self.list.editing_filter = false;
                self.list.filter_input.clear();
            }
            KeyCode::Enter => {
                self.list.apply_filter(self.store.config());
            }
            KeyCode::Tab => {
                self.list.filter_field = self.list.filter_field.cycle();
            }
            KeyCode::Backspace => {
                self.list.filter_input.pop();
            }
            KeyCode::Char(ch) => {
                self.list.filter_input.push(ch);
            }
            _ => {}
        }
    }

    fn open_selected_list_task(&mut self) {
        let visible = list::filtered_tasks(&self.tasks, &self.list, self.store.config());
        let id = visible.get(self.list.selected).and_then(|task| task.id);
        self.open_task_or_message(id);
    }

    fn mark_selected_done_list(&mut self) {
        let visible = list::filtered_tasks(&self.tasks, &self.list, self.store.config());
        let id = visible.get(self.list.selected).and_then(|task| task.id);
        self.mark_task_done(id);
    }

    // ── Docs input ────────────────────────────────────────────────

    fn handle_docs_key(&mut self, key: KeyEvent) {
        match key.code {
            KeyCode::Down | KeyCode::Char('j') => self.docs_state.move_down(),
            KeyCode::Up | KeyCode::Char('k') => self.docs_state.move_up(),
            KeyCode::Enter => {
                self.open_selected_doc();
            }
            _ => {}
        }
    }

    fn open_selected_doc(&mut self) {
        if let Some(doc) = self.docs_state.selected_doc() {
            let path = doc.path.clone();
            self.open_path_in_editor(&path);
        }
    }

    // ── Detail input ──────────────────────────────────────────────

    fn handle_detail_key(&mut self, key: KeyEvent, id: u32) {
        match key.code {
            KeyCode::Char('e') => {
                if let Some(task) = self.tasks.iter().find(|t| t.id == Some(id))
                    && let Some(ref path) = task.file_path
                {
                    let path = path.clone();
                    self.open_path_in_editor(&path);
                }
            }
            KeyCode::Char('s') => {
                self.cycle_status(id);
            }
            _ => {}
        }
    }

    fn cycle_status(&mut self, id: u32) {
        let columns: Vec<String> = self
            .store
            .config()
            .columns
            .iter()
            .map(|c| c.id.clone())
            .collect();

        if columns.is_empty() {
            return;
        }

        if let Some(task) = self.tasks.iter().find(|t| t.id == Some(id)) {
            let current = self
                .store
                .config()
                .normalize_status(&task.status)
                .unwrap_or_default();
            let current_idx = columns.iter().position(|c| *c == current).unwrap_or(0);
            let next_idx = (current_idx + 1) % columns.len();
            let next_status = &columns[next_idx];

            match self.store.set_status(id, next_status) {
                Ok(_) => {
                    self.message = Some(format!("Task #{id} -> {next_status}"));
                    self.refresh_or_message();
                }
                Err(err) => {
                    self.message = Some(format!("Failed to update task #{id}: {err}"));
                }
            }
        }
    }

    // ── Editor ────────────────────────────────────────────────────

    fn open_in_editor(&mut self, path: &Path) -> std::io::Result<()> {
        let (editor, args) = resolve_editor();

        // Temporarily restore terminal before spawning editor
        ratatui::restore();

        let status = Command::new(&editor).args(&args).arg(path).status();

        // Re-initialize terminal after editor exits
        ratatui::init();

        match status {
            Ok(status) if status.success() => Ok(()),
            Ok(status) => {
                let description = match status.code() {
                    Some(code) => format!("editor exited with status {code}"),
                    None => "editor terminated by signal".to_string(),
                };
                Err(std::io::Error::other(description))
            }
            Err(err) => Err(err),
        }
    }

    // ── Drawing ───────────────────────────────────────────────────

    pub fn draw(&mut self, frame: &mut Frame) {
        let footer_height = if self.message.is_some() { 2 } else { 1 };

        let [header_area, main_area, footer_area] = Layout::vertical([
            Constraint::Length(1),
            Constraint::Fill(1),
            Constraint::Length(footer_height),
        ])
        .areas(frame.area());

        self.draw_tabs(frame, header_area);

        match self.view {
            View::Kanban => {
                kanban::draw(
                    &self.tasks,
                    self.store.config(),
                    &self.kanban,
                    frame,
                    main_area,
                );
            }
            View::List => {
                list::draw(
                    &self.tasks,
                    &self.list,
                    self.store.config(),
                    frame,
                    main_area,
                );
            }
            View::Docs => {
                super::docs::draw(&self.docs_state, &self.project_root, frame, main_area);
            }
            View::TaskDetail(id) => {
                detail::draw(&self.tasks, id, frame, main_area);
            }
        }

        self.draw_footer(frame, footer_area);
    }

    fn draw_tabs(&self, frame: &mut Frame, area: Rect) {
        let titles = ["1:Kanban", "2:List", "3:Docs"];
        let selected = match self.view {
            View::Kanban => 0,
            View::List => 1,
            View::Docs => 2,
            View::TaskDetail(_) => match self.detail_return_view {
                View::Kanban => 0,
                View::List => 1,
                View::Docs => 2,
                View::TaskDetail(_) => 1,
            },
        };

        let tabs = Tabs::new(titles)
            .select(selected)
            .highlight_style(Style::default().add_modifier(Modifier::BOLD | Modifier::UNDERLINED));

        frame.render_widget(tabs, area);
    }

    fn draw_footer(&mut self, frame: &mut Frame, area: Rect) {
        let chunks = if self.message.is_some() {
            let parts =
                Layout::vertical([Constraint::Length(1), Constraint::Length(1)]).split(area);
            // Message line
            if let Some(ref msg) = self.message {
                let msg_widget = Paragraph::new(msg.as_str())
                    .style(Style::default().add_modifier(Modifier::DIM));
                frame.render_widget(msg_widget, parts[0]);
            }
            parts[1]
        } else {
            area
        };

        let help = match self.view {
            View::TaskDetail(_) => "e:edit  s:cycle status  esc:back  q:quit",
            View::Docs => {
                "\u{2191}\u{2193}/jk:navigate  enter:open in editor  tab:next view  q:quit"
            }
            View::List if self.list.editing_filter => {
                "type to filter  tab:switch field  enter:apply  esc:cancel"
            }
            View::List => {
                "\u{2191}\u{2193}/jk:navigate  enter:open  d:done  f:filter  s:sort  q:quit"
            }
            View::Kanban => {
                "\u{2190}\u{2191}\u{2193}\u{2192}/hjkl:navigate  enter:open  d:done  q:quit"
            }
        };

        let footer = Paragraph::new(help).style(Style::default().add_modifier(Modifier::DIM));
        frame.render_widget(footer, chunks);
    }
}

fn resolve_editor() -> (String, Vec<String>) {
    for key in ["EDITOR", "VISUAL"] {
        if let Ok(val) = std::env::var(key) {
            let val = val.trim().to_string();
            if !val.is_empty()
                && let Some(mut parts) = shlex::split(&val)
                && !parts.is_empty()
            {
                let program = parts.remove(0);
                return (program, parts);
            }
        }
    }
    ("vi".to_string(), Vec::new())
}

#[cfg(test)]
mod tests {
    use std::fs;

    use ratatui::crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
    use tempfile::TempDir;

    use super::{App, View};
    use untask_core::{init, store::TaskStore};

    fn key(code: KeyCode) -> KeyEvent {
        KeyEvent::new(code, KeyModifiers::NONE)
    }

    fn make_app() -> (TempDir, App) {
        let tmp = TempDir::new().unwrap();
        init::init(tmp.path()).unwrap();

        let store = TaskStore::new(tmp.path().to_path_buf()).unwrap();
        store.add("Alpha task", None).unwrap();
        store.add("Bravo task", Some("done")).unwrap();

        let app = App::new(
            TaskStore::new(tmp.path().to_path_buf()).unwrap(),
            tmp.path().to_path_buf(),
        )
        .unwrap();
        (tmp, app)
    }

    #[test]
    fn quits_on_q_and_ctrl_c() {
        let (_tmp, mut app) = make_app();
        app.handle_key(key(KeyCode::Char('q')));
        assert!(app.should_quit);

        let (_tmp, mut app) = make_app();
        app.handle_key(KeyEvent::new(KeyCode::Char('c'), KeyModifiers::CONTROL));
        assert!(app.should_quit);
    }

    #[test]
    fn tab_and_number_keys_switch_views() {
        let (_tmp, mut app) = make_app();

        assert_eq!(app.view, View::List);

        app.handle_key(key(KeyCode::Tab));
        assert_eq!(app.view, View::Docs);

        app.handle_key(key(KeyCode::Tab));
        assert_eq!(app.view, View::Kanban);

        app.handle_key(key(KeyCode::Char('2')));
        assert_eq!(app.view, View::List);

        app.handle_key(key(KeyCode::Char('1')));
        assert_eq!(app.view, View::Kanban);

        app.handle_key(key(KeyCode::Char('3')));
        assert_eq!(app.view, View::Docs);
    }

    #[test]
    fn enter_opens_selected_task_and_escape_returns_to_list() {
        let (_tmp, mut app) = make_app();
        app.list.selected = 1;

        app.handle_key(key(KeyCode::Enter));
        assert_eq!(app.view, View::TaskDetail(2));

        app.handle_key(key(KeyCode::Esc));
        assert_eq!(app.view, View::List);
    }

    #[test]
    fn escape_returns_to_the_previous_main_view() {
        let (_tmp, mut app) = make_app();
        app.handle_key(key(KeyCode::Char('1')));
        assert_eq!(app.view, View::Kanban);

        app.handle_key(key(KeyCode::Enter));
        assert_eq!(app.view, View::TaskDetail(1));

        app.handle_key(key(KeyCode::Esc));
        assert_eq!(app.view, View::Kanban);
    }

    #[test]
    fn refresh_clamps_selection_after_task_removal() {
        let (_tmp, mut app) = make_app();
        app.list.selected = 1;

        let task_path = app.tasks[1].file_path.clone().unwrap();
        fs::remove_file(task_path).unwrap();

        app.refresh().unwrap();

        assert_eq!(app.list.selected, 0);
        assert_eq!(app.tasks.len(), 1);
    }

    #[test]
    fn refresh_exits_detail_when_selected_task_disappears() {
        let (_tmp, mut app) = make_app();
        app.list.selected = 1;
        app.handle_key(key(KeyCode::Enter));
        assert_eq!(app.view, View::TaskDetail(2));

        let task_path = app.tasks[1].file_path.clone().unwrap();
        fs::remove_file(task_path).unwrap();

        app.refresh().unwrap();

        assert_eq!(app.view, View::List);
        assert_eq!(app.list.selected, 0);
    }

    #[test]
    fn kanban_navigation() {
        let (_tmp, mut app) = make_app();
        app.view = View::Kanban;

        // Navigate right between columns
        app.handle_key(key(KeyCode::Right));
        assert!(app.kanban.col < app.store.config().columns.len());

        // Navigate down within column
        app.handle_key(key(KeyCode::Down));
        // Navigate back up
        app.handle_key(key(KeyCode::Up));
    }

    #[test]
    fn list_sort_cycles() {
        let (_tmp, mut app) = make_app();
        use super::super::list::SortField;

        assert_eq!(app.list.sort_field, SortField::Id);

        app.handle_key(key(KeyCode::Char('s')));
        assert_eq!(app.list.sort_field, SortField::Priority);

        app.handle_key(key(KeyCode::Char('s')));
        assert_eq!(app.list.sort_field, SortField::Updated);

        app.handle_key(key(KeyCode::Char('s')));
        assert_eq!(app.list.sort_field, SortField::Title);

        app.handle_key(key(KeyCode::Char('s')));
        assert_eq!(app.list.sort_field, SortField::Id);
    }

    #[test]
    fn filter_input_mode() {
        let (_tmp, mut app) = make_app();

        // Enter filter mode
        app.handle_key(key(KeyCode::Char('f')));
        assert!(app.list.editing_filter);

        // Type filter value
        app.handle_key(key(KeyCode::Char('d')));
        app.handle_key(key(KeyCode::Char('o')));
        app.handle_key(key(KeyCode::Char('n')));
        app.handle_key(key(KeyCode::Char('e')));
        assert_eq!(app.list.filter_input, "done");

        // Apply filter
        app.handle_key(key(KeyCode::Enter));
        assert!(!app.list.editing_filter);
        assert!(app.list.filter_status.is_some());
    }

    #[test]
    fn mark_done_from_list() {
        let (_tmp, mut app) = make_app();
        // First task is in default status (not done)
        let id = app.tasks[0].id.unwrap();
        assert_ne!(app.tasks[0].status, "done");

        app.list.selected = 0;
        app.handle_key(key(KeyCode::Char('d')));

        // Task should now be done
        let updated = app.tasks.iter().find(|t| t.id == Some(id)).unwrap();
        assert_eq!(updated.status, "done");
        assert!(app.message.is_some());
    }

    #[test]
    fn detail_view_cycle_status() {
        let (_tmp, mut app) = make_app();
        let id = app.tasks[0].id.unwrap();
        let initial_status = app.tasks[0].status.clone();

        app.view = View::TaskDetail(id);
        app.handle_key(key(KeyCode::Char('s')));

        let updated = app.tasks.iter().find(|t| t.id == Some(id)).unwrap();
        assert_ne!(updated.status, initial_status);
        assert!(app.message.is_some());
    }

    #[test]
    fn escape_clears_list_filter() {
        let (_tmp, mut app) = make_app();

        // Set a filter
        app.list.filter_status = Some("done".to_string());
        assert!(app.list.has_active_filter());

        // Escape clears it
        app.handle_key(key(KeyCode::Esc));
        assert!(!app.list.has_active_filter());
    }

    #[test]
    fn enter_on_unindexed_task_without_id_shows_guidance() {
        let tmp = TempDir::new().unwrap();
        init::init(tmp.path()).unwrap();

        fs::write(
            tmp.path().join(".untask/tasks/loose-note.md"),
            "---\ntitle: Loose note\nstatus: todo\n---\nbody\n",
        )
        .unwrap();

        let mut app = App::new(
            TaskStore::new(tmp.path().to_path_buf()).unwrap(),
            tmp.path().to_path_buf(),
        )
        .unwrap();

        app.list.selected = app.tasks.iter().position(|task| task.id.is_none()).unwrap();
        app.handle_key(key(KeyCode::Enter));

        assert_eq!(app.view, View::List);
        assert_eq!(
            app.message.as_deref(),
            Some("Unindexed task has no ID; run untask repair --check.")
        );
    }
}
