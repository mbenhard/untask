mod cli;

use clap::Parser;
use cli::{Cli, Commands};
use colored::control::set_override;

fn main() {
    let cli = Cli::parse();

    // Respect --no-color flag or NO_COLOR environment variable
    if cli.no_color || std::env::var_os("NO_COLOR").is_some() {
        set_override(false);
    }

    let code = match run(&cli) {
        Ok(()) => 0,
        Err(e) => {
            if cli.json {
                let msg = serde_json::json!({ "error": e.to_string() });
                eprintln!("{msg}");
            } else {
                eprintln!("error: {e}");
            }
            1
        }
    };
    std::process::exit(code);
}

fn run(cli: &Cli) -> untask_core::error::Result<()> {
    match &cli.command {
        None => {
            // No subcommand → TUI placeholder
            println!("untask: TUI coming soon. Use --help for available commands.");
            Ok(())
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
            let _root = untask_core::project::find_project_root(&cwd)?;

            match cmd {
                Commands::Init => unreachable!(),
                _ => {
                    // Placeholder — commands will be wired in Task 10
                    println!("Command not yet implemented.");
                    Ok(())
                }
            }
        }
    }
}
