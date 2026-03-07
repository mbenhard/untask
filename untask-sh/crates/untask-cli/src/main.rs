mod cli;
mod commands;
pub mod output;
mod tui;

use std::ffi::OsString;

use clap::Parser;
use cli::{Cli, Commands, DocsCommands};
use colored::control::set_override;
use output::{Formatter, OutputMode};
use untask_core::store::TaskStore;

fn main() {
    let cli = Cli::parse();

    // Respect --no-color flag or NO_COLOR environment variable
    if should_disable_color(cli.no_color, std::env::var_os("NO_COLOR")) {
        set_override(false);
    }

    let fmt = Formatter::new(OutputMode::detect(cli.no_color));

    let code = match run(&cli, &fmt) {
        Ok(()) => 0,
        Err(e) => {
            if cli.json {
                let msg = serde_json::json!({ "error": e.to_string() });
                eprintln!("{msg}");
            } else {
                eprintln!("{}", fmt.error(&format!("error: {e}")));
            }
            1
        }
    };
    std::process::exit(code);
}

fn should_disable_color(no_color_flag: bool, no_color_env: Option<OsString>) -> bool {
    no_color_flag || no_color_env.is_some()
}

fn run(cli: &Cli, fmt: &Formatter) -> untask_core::error::Result<()> {
    match &cli.command {
        None => {
            let cwd = std::env::current_dir()?;
            match untask_core::project::find_project_root(&cwd) {
                Ok(root) => {
                    let store = TaskStore::new(root)?;
                    tui::run(store)
                }
                Err(_) => {
                    eprintln!("No untask project found. Run 'untask init' first.");
                    std::process::exit(1);
                }
            }
        }
        Some(Commands::Init) => {
            let root = std::env::current_dir()?;
            untask_core::init::init(&root)?;
            println!("Initialized untask project in {}", root.display());
            Ok(())
        }
        Some(cmd) => {
            // All other commands require an initialized project
            let cwd = std::env::current_dir()?;
            let root = untask_core::project::find_project_root(&cwd)?;
            let store = TaskStore::new(root.clone())?;

            match cmd {
                Commands::Init => unreachable!(),
                Commands::Add { title, status } => {
                    commands::add(&store, title, status.as_deref(), cli.json)
                }
                Commands::List {
                    status,
                    tag,
                    priority,
                    sort,
                } => commands::list(
                    &store,
                    status.as_deref(),
                    tag.as_deref(),
                    priority.as_deref(),
                    sort,
                    cli.json,
                    fmt,
                ),
                Commands::Show { reference } => commands::show(&store, reference, cli.json, fmt),
                Commands::Edit { reference } => commands::edit(&store, reference),
                Commands::Status { reference, status } => {
                    commands::status(&store, reference, status, cli.json)
                }
                Commands::Done { reference } => commands::done(&store, reference, cli.json),
                Commands::Delete { reference, force } => {
                    commands::delete(&store, reference, *force, cli.json)
                }
                Commands::Next => commands::next::run(&root, cli.json, fmt),
                Commands::Search { query, tasks_only } => {
                    commands::search(&root, query, *tasks_only, cli.json, fmt)
                }
                Commands::Docs { cmd: subcmd } => match subcmd {
                    Some(DocsCommands::Show { name }) => {
                        commands::docs::show(&root, name, cli.json)
                    }
                    Some(DocsCommands::List) | None => commands::docs::list(&root, cli.json),
                },
                Commands::Repair { check, write } => {
                    commands::repair(&root, *check, *write, cli.json, fmt)
                }
                Commands::Skill { cmd: _ } => commands::skill_install(cli.json),
                Commands::Open => commands::open(&root),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::should_disable_color;

    #[test]
    fn disables_color_when_flag_is_set() {
        assert!(should_disable_color(true, None));
    }

    #[test]
    fn disables_color_when_env_is_present() {
        assert!(should_disable_color(false, Some("1".into())));
    }

    #[test]
    fn keeps_color_enabled_when_flag_and_env_are_absent() {
        assert!(!should_disable_color(false, None));
    }
}
