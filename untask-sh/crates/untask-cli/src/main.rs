mod cli;

use std::ffi::OsString;

use clap::Parser;
use cli::{Cli, Commands};
use colored::control::set_override;

fn main() {
    let cli = Cli::parse();

    // Respect --no-color flag or NO_COLOR environment variable
    if should_disable_color(cli.no_color, std::env::var_os("NO_COLOR")) {
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

fn should_disable_color(no_color_flag: bool, no_color_env: Option<OsString>) -> bool {
    no_color_flag || no_color_env.is_some()
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
