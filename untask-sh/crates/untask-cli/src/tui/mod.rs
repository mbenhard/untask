pub mod app;
mod detail;
mod docs;
mod kanban;
mod list;
mod watcher;

use std::panic::{self, AssertUnwindSafe};
use std::path::PathBuf;
use std::time::Duration;

use ratatui::crossterm::event::{self, Event, KeyEventKind};

use app::App;
use untask_core::store::TaskStore;
use watcher::FileWatcher;

pub fn run(store: TaskStore, project_root: PathBuf) -> untask_core::error::Result<()> {
    let mut watcher = FileWatcher::new(&project_root, store.config());

    with_terminal(ratatui::init, ratatui::restore, |terminal| {
        let mut app = App::new(store, project_root)?;
        run_loop(terminal, &mut app, &mut watcher)
    })
}

fn run_loop(
    terminal: &mut ratatui::DefaultTerminal,
    app: &mut App,
    watcher: &mut Option<FileWatcher>,
) -> untask_core::error::Result<()> {
    while !app.should_quit {
        terminal.draw(|frame| app.draw(frame))?;

        if event::poll(Duration::from_millis(100))?
            && let Event::Key(key) = event::read()?
            && key.kind == KeyEventKind::Press
        {
            app.handle_key(key);
        }

        // Check for filesystem changes (debounced)
        if let Some(w) = watcher {
            if w.should_refresh() {
                app.refresh_or_message();
            }
        }
    }

    Ok(())
}

fn with_terminal<T, Setup, Restore, Run>(
    setup: Setup,
    restore: Restore,
    run: Run,
) -> untask_core::error::Result<()>
where
    Setup: FnOnce() -> T,
    Restore: FnOnce(),
    Run: FnOnce(&mut T) -> untask_core::error::Result<()>,
{
    struct TerminalGuard<F: FnOnce()>(Option<F>);

    impl<F: FnOnce()> TerminalGuard<F> {
        fn new(restore: F) -> Self {
            Self(Some(restore))
        }
    }

    impl<F: FnOnce()> Drop for TerminalGuard<F> {
        fn drop(&mut self) {
            if let Some(restore) = self.0.take() {
                restore();
            }
        }
    }

    let mut terminal = setup();
    let result = {
        let _guard = TerminalGuard::new(restore);
        panic::catch_unwind(AssertUnwindSafe(|| run(&mut terminal)))
    };

    match result {
        Ok(result) => result,
        Err(panic) => panic::resume_unwind(panic),
    }
}

#[cfg(test)]
mod tests {
    use std::cell::Cell;
    use std::panic::{self, AssertUnwindSafe};
    use std::rc::Rc;

    use super::with_terminal;

    #[test]
    fn restores_terminal_after_success() {
        let restored = Rc::new(Cell::new(false));
        let restore_flag = restored.clone();

        let result = with_terminal(
            || 7,
            move || restore_flag.set(true),
            |terminal| {
                assert_eq!(*terminal, 7);
                Ok(())
            },
        );

        assert!(result.is_ok());
        assert!(restored.get());
    }

    #[test]
    fn restores_terminal_after_error() {
        let restored = Rc::new(Cell::new(false));
        let restore_flag = restored.clone();

        let result = with_terminal(
            || (),
            move || restore_flag.set(true),
            |_terminal| Err(std::io::Error::other("boom").into()),
        );

        assert!(result.is_err());
        assert!(restored.get());
    }

    #[test]
    fn restores_terminal_before_resuming_panic() {
        let restored = Rc::new(Cell::new(false));
        let restore_flag = restored.clone();

        let result = panic::catch_unwind(AssertUnwindSafe(|| {
            let _ = with_terminal(
                || (),
                move || restore_flag.set(true),
                |_terminal| -> untask_core::error::Result<()> {
                    panic!("kaboom");
                },
            );
        }));

        assert!(result.is_err());
        assert!(restored.get());
    }
}
