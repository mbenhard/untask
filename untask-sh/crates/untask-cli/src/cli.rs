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

        /// Link to a PRD (relative path)
        #[arg(long)]
        prd: Option<String>,
    },

    /// List tasks
    List {
        /// Filter by status
        #[arg(short, long)]
        status: Option<String>,

        /// Filter by tag
        #[arg(short, long)]
        tag: Option<String>,

        /// Filter by priority (low, medium, high, urgent)
        #[arg(short, long)]
        priority: Option<String>,

        /// Sort by field (priority, updated, created, title)
        #[arg(long, default_value = "id")]
        sort: String,
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

        /// Skip confirmation prompt
        #[arg(short, long)]
        force: bool,
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
        #[arg(long, conflicts_with = "write")]
        check: bool,

        /// Apply fixes
        #[arg(long, conflicts_with = "check")]
        write: bool,
    },

    /// Manage skills
    Skill {
        #[command(subcommand)]
        cmd: SkillCommands,
    },

    /// Manage board columns
    Column {
        #[command(subcommand)]
        cmd: ColumnCommands,
    },

    /// Open the desktop app for this project
    Open,
}

#[derive(Debug, Subcommand)]
pub enum DocsCommands {
    /// List all docs
    List {
        /// Filter by type (doc, prd)
        #[arg(short = 't', long = "type")]
        doc_type: Option<String>,
    },

    /// Show a doc by name
    Show {
        /// Doc name or path
        name: String,
    },

    /// List active doc globs
    Paths,

    /// Add a doc glob pattern
    AddPath {
        /// Glob pattern (e.g. "specs/**/*.md")
        pattern: String,
    },

    /// Remove a doc glob pattern
    RemovePath {
        /// Glob pattern to remove
        pattern: String,
    },
}

#[derive(Debug, Subcommand)]
pub enum ColumnCommands {
    /// List all columns
    List,

    /// Add a new column
    Add {
        /// Column name (will be kebab-cased)
        name: String,

        /// Insert after this column
        #[arg(long)]
        after: Option<String>,

        /// Mark as a terminal/done column
        #[arg(long)]
        done: bool,
    },

    /// Rename a column
    Rename {
        /// Current column name
        old: String,

        /// New column name
        new: String,
    },

    /// Move a column to a new position
    Move {
        /// Column to move
        name: String,

        /// Place after this column
        #[arg(long, conflicts_with = "before")]
        after: Option<String>,

        /// Place before this column
        #[arg(long, conflicts_with = "after")]
        before: Option<String>,
    },

    /// Delete a column
    Delete {
        /// Column to delete
        name: String,

        /// Move tasks to this column instead of deleting them
        #[arg(long, conflicts_with = "delete_tasks")]
        move_to: Option<String>,

        /// Delete all tasks in the column
        #[arg(long, conflicts_with = "move_to")]
        delete_tasks: bool,
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
                tag: None,
                priority: None,
                ..
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

    #[test]
    fn parses_docs_path_subcommands() {
        let paths = Cli::try_parse_from(["untask", "docs", "paths"]).unwrap();
        assert!(matches!(
            paths.command,
            Some(Commands::Docs { cmd: Some(DocsCommands::Paths) })
        ));

        let add = Cli::try_parse_from(["untask", "docs", "add-path", "specs/**/*.md"]).unwrap();
        assert!(matches!(
            add.command,
            Some(Commands::Docs { cmd: Some(DocsCommands::AddPath { pattern }) }) if pattern == "specs/**/*.md"
        ));

        let remove = Cli::try_parse_from(["untask", "docs", "remove-path", "docs/**/*.md"]).unwrap();
        assert!(matches!(
            remove.command,
            Some(Commands::Docs { cmd: Some(DocsCommands::RemovePath { pattern }) }) if pattern == "docs/**/*.md"
        ));
    }

    #[test]
    fn rejects_conflicting_repair_flags() {
        let err = Cli::try_parse_from(["untask", "repair", "--check", "--write"]).unwrap_err();
        let rendered = err.to_string();

        assert!(rendered.contains("cannot be used with"));
        assert!(rendered.contains("--check"));
        assert!(rendered.contains("--write"));
    }
}
