use ratatui::Frame;
use ratatui::layout::Rect;
use ratatui::style::{Modifier, Style};
use ratatui::widgets::{Block, List, ListItem, ListState, Paragraph};

use std::path::Path;

use untask_core::docs::Doc;

pub struct DocsViewState {
    pub selected: usize,
    pub docs: Vec<Doc>,
}

impl DocsViewState {
    pub fn new() -> Self {
        Self {
            selected: 0,
            docs: Vec::new(),
        }
    }

    pub fn clamp(&mut self) {
        if self.docs.is_empty() {
            self.selected = 0;
        } else {
            self.selected = self.selected.min(self.docs.len() - 1);
        }
    }

    pub fn selected_doc(&self) -> Option<&Doc> {
        self.docs.get(self.selected)
    }

    pub fn move_up(&mut self) {
        self.selected = self.selected.saturating_sub(1);
    }

    pub fn move_down(&mut self) {
        if !self.docs.is_empty() {
            self.selected = (self.selected + 1).min(self.docs.len() - 1);
        }
    }
}

fn relative_path<'a>(path: &'a Path, root: &Path) -> &'a Path {
    path.strip_prefix(root).unwrap_or(path)
}

pub fn draw(state: &DocsViewState, project_root: &Path, frame: &mut Frame, area: Rect) {
    if state.docs.is_empty() {
        let placeholder =
            Paragraph::new("No docs found").block(Block::bordered().title("Docs"));
        frame.render_widget(placeholder, area);
        return;
    }

    let items: Vec<ListItem> = state
        .docs
        .iter()
        .map(|doc| {
            let rel = relative_path(&doc.path, project_root);
            let title = extract_title(&doc.content).unwrap_or(&doc.basename);
            ListItem::new(format!("  {title}  {}", rel.display()))
        })
        .collect();

    let mut list_state = ListState::default();
    list_state.select(Some(state.selected));

    let title = format!("Docs ({})", state.docs.len());
    let list = List::new(items)
        .block(Block::bordered().title(title))
        .highlight_style(Style::default().add_modifier(Modifier::REVERSED));

    frame.render_stateful_widget(list, area, &mut list_state);
}

fn extract_title(content: &str) -> Option<&str> {
    for line in content.lines() {
        let trimmed = line.trim();
        if let Some(heading) = trimmed.strip_prefix("# ") {
            return Some(heading.trim());
        }
        // Skip YAML frontmatter
        if trimmed == "---" {
            continue;
        }
        // Skip empty lines
        if trimmed.is_empty() {
            continue;
        }
    }
    None
}
