# Task ID: 9

**Title:** CLI Scaffold and Project Root Resolution

**Status:** pending

**Dependencies:** 1

**Priority:** high

**Description:** Set up the CLI with Clap, implement project root discovery by walking upward to find .untask/, and establish global flags and subcommand structure.

**Details:**

Create the CLI foundation:

1. Update `crates/untask-cli/Cargo.toml`:
```toml
[dependencies]
clap = { version = "4.5", features = ["derive"] }
untask-core = { path = "../untask-core" }
colored = "2.0"
```

2. Create `crates/untask-cli/src/cli.rs`:
```rust
use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "untask", version, about = "Local-first project companion")]
pub struct Cli {
    #[command(subcommand)]
    pub command: Option<Commands>,
    
    #[arg(long, global = true)]
    pub json: bool,
    
    #[arg(long, global = true)]
    pub no_color: bool,
}

#[derive(Subcommand)]
pub enum Commands {
    Init,
    Add { title: String, #[arg(short, long)] status: Option<String> },
    List { #[arg(short, long)] status: Option<String>, #[arg(short, long)] tag: Option<String> },
    Show { reference: String },
    Edit { reference: String },
    Status { reference: String, status: String },
    Done { reference: String },
    Delete { reference: String },
    Next,
    Search { query: String, #[arg(long)] tasks_only: bool },
    Docs { #[command(subcommand)] cmd: Option<DocsCommands> },
    Repair { #[arg(long)] check: bool, #[arg(long)] write: bool },
    Skill { #[command(subcommand)] cmd: SkillCommands },
    Open,
}
```

3. Implement project root discovery:
```rust
pub fn find_project_root() -> Result<PathBuf> {
    let mut current = std::env::current_dir()?;
    loop {
        if current.join(".untask").is_dir() {
            return Ok(current);
        }
        if !current.pop() {
            return Err(UntaskError::NotInitialized);
        }
    }
}
```

4. Main entry: no subcommand → launch TUI (placeholder for now).

**Test Strategy:**

1. Run `cargo run -p untask -- --help` - verify help output shows all commands.
2. Run `cargo run -p untask -- --version` - verify version output.
3. Test project root discovery finds .untask/ in current directory.
4. Test project root discovery finds .untask/ in parent directory.
5. Test project root discovery returns NotInitialized when not found.
6. Test global --json and --no-color flags are parsed.
7. Test NO_COLOR environment variable is respected.
