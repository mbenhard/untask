mod cli;
mod commands;
pub mod output;

use std::ffi::OsString;

use clap::{CommandFactory, Parser};
use cli::{Cli, ColumnCommands, Commands, DocsCommands};
use colored::control::set_override;
use output::{Formatter, OutputMode};
use untask_core::store::TaskStore;

const NO_COMMAND_MESSAGE: &str =
    "Use a CLI subcommand or `untask open` to launch the desktop app.";

fn main() {
    let cli = Cli::parse();

    // Respect --no-color flag or NO_COLOR environment variable
    if should_disable_color(cli.no_color, std::env::var_os("NO_COLOR")) {
        set_override(false);
    }

    let fmt = Formatter::new(OutputMode::detect(cli.no_color));

    let code = if cli.command.is_none() {
        handle_no_command(&cli, &fmt)
    } else {
        match run(&cli, &fmt) {
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
        }
    };
    std::process::exit(code);
}

fn handle_no_command(cli: &Cli, fmt: &Formatter) -> i32 {
    if cli.json {
        let msg = serde_json::json!({ "error": NO_COMMAND_MESSAGE });
        eprintln!("{msg}");
        return 1;
    }

    let mut command = Cli::command();
    if let Err(error) = command.print_help() {
        eprintln!("{}", fmt.error(&format!("error: failed to print help: {error}")));
        return 1;
    }

    println!();
    println!();
    println!("{}", fmt.warning(NO_COMMAND_MESSAGE));
    1
}

fn should_disable_color(no_color_flag: bool, no_color_env: Option<OsString>) -> bool {
    no_color_flag || no_color_env.is_some()
}

fn run(cli: &Cli, fmt: &Formatter) -> untask_core::error::Result<()> {
    match &cli.command {
        None => unreachable!(),
        Some(Commands::Init) => {
            let root = std::env::current_dir()?;
            untask_core::init::init(&root, None)?;
            println!("Initialized untask project in {}", root.display());
            Ok(())
        }
        Some(cmd) => {
            // All other commands require an initialized project
            let cwd = std::env::current_dir()?;
            let root = untask_core::project::find_project_root(&cwd)?;
            let mut store = TaskStore::new(root.clone())?;

            match cmd {
                Commands::Init => unreachable!(),
                Commands::Add { title, status, prd } => {
                    commands::add(&store, title, status.as_deref(), prd.as_deref(), cli.json)
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
                    Some(DocsCommands::Paths) => commands::docs::paths(&root, cli.json),
                    Some(DocsCommands::AddPath { pattern }) => {
                        commands::docs::add_path(&root, pattern, cli.json)
                    }
                    Some(DocsCommands::RemovePath { pattern }) => {
                        commands::docs::remove_path(&root, pattern, cli.json)
                    }
                    Some(DocsCommands::List { doc_type }) => {
                        commands::docs::list(&root, doc_type.as_deref(), cli.json)
                    }
                    None => commands::docs::list(&root, None, cli.json),
                },
                Commands::Repair { check, write } => {
                    commands::repair(&root, *check, *write, cli.json, fmt)
                }
                Commands::Column { cmd: subcmd } => match subcmd {
                    ColumnCommands::List => commands::column::list(&root, cli.json),
                    ColumnCommands::Add { name, after, done } => {
                        commands::column::add(&root, name, after.as_deref(), *done, cli.json)
                    }
                    ColumnCommands::Rename { old, new } => {
                        commands::column::rename(&mut store, &root, old, new, cli.json)
                    }
                    ColumnCommands::Move { name, after, before } => {
                        commands::column::move_column(&root, name, after.as_deref(), before.as_deref(), cli.json)
                    }
                    ColumnCommands::Delete { name, move_to, delete_tasks } => {
                        commands::column::delete(&mut store, &root, name, move_to.as_deref(), *delete_tasks, cli.json)
                    }
                },
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
