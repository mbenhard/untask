use clap::{Parser, Subcommand};

#[derive(Debug, Parser)]
#[command(name = "untask", version, about = "Local-first project companion")]
pub struct Cli {
    #[command(subcommand)]
    pub command: Option<Commands>,

    /// Output as JSON (for agent consumption)
    #[arg(long, global = true)]
    pub json: bool,

    /// Disable colored output
    #[arg(long, global = true)]
    pub no_color: bool,
}

#[derive(Debug, Subcommand)]
pub enum Commands {
    /// Initialize a new untask project
    Init,

    /// Add a new task
    Add {
        /// Task title
        title: String,

        /// Initial status
        #[arg(short, long)]
        status: Option<String>,
    },

    /// List tasks
    List {
        /// Filter by status
        #[arg(short, long)]
        status: Option<String>,

        /// Filter by tag
        #[arg(short, long)]
        tag: Option<String>,
    },

    /// Show a task by ID or slug
    Show {
        /// Task ID or slug
        reference: String,
    },

    /// Edit a task in $EDITOR
    Edit {
        /// Task ID or slug
        reference: String,
    },

    /// Change task status
    Status {
        /// Task ID or slug
        reference: String,

        /// New status
        status: String,
    },

    /// Mark a task as done
    Done {
        /// Task ID or slug
        reference: String,
    },

    /// Delete a task
    Delete {
        /// Task ID or slug
        reference: String,
    },

    /// Show next actions summary
    Next,

    /// Search tasks and docs
    Search {
        /// Search query
        query: String,

        /// Search tasks only (skip docs)
        #[arg(long)]
        tasks_only: bool,
    },

    /// Browse and show project docs
    Docs {
        #[command(subcommand)]
        cmd: Option<DocsCommands>,
    },

    /// Check and repair project integrity
    Repair {
        /// Check only, do not write
        #[arg(long)]
        check: bool,

        /// Apply fixes
        #[arg(long)]
        write: bool,
    },

    /// Manage skills
    Skill {
        #[command(subcommand)]
        cmd: SkillCommands,
    },

    /// Open the desktop app for this project
    Open,
}

#[derive(Debug, Subcommand)]
pub enum DocsCommands {
    /// List all docs
    List,

    /// Show a doc by name
    Show {
        /// Doc name or path
        name: String,
    },
}

#[derive(Debug, Subcommand)]
pub enum SkillCommands {
    /// Install the untask skill for an AI agent
    Install,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_global_flags() {
        let cli = Cli::try_parse_from(["untask", "--json", "--no-color", "list"]).unwrap();

        assert!(cli.json);
        assert!(cli.no_color);
        assert!(matches!(
            cli.command,
            Some(Commands::List {
                status: None,
                tag: None
            })
        ));
    }

    #[test]
    fn parses_nested_subcommands() {
        let docs = Cli::try_parse_from(["untask", "docs", "show", "plan"]).unwrap();
        assert!(matches!(
            docs.command,
            Some(Commands::Docs {
                cmd: Some(DocsCommands::Show { name })
            }) if name == "plan"
        ));

        let skill = Cli::try_parse_from(["untask", "skill", "install"]).unwrap();
        assert!(matches!(
            skill.command,
            Some(Commands::Skill {
                cmd: SkillCommands::Install
            })
        ));
    }
}
