use std::path::{Path, PathBuf};

use untask_core::error::{Result, UntaskError};

const SKILL_CONTENT: &str = include_str!("../../skill/untask.md");
const CLAUDE_DIR: &str = ".claude";
const CLAUDE_COMMANDS_DIR: &str = ".claude/commands";

pub fn install(json: bool) -> Result<()> {
    let home = resolve_home_dir()?;

    if let Some(target) = detect_install_target(&home) {
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(&target, SKILL_CONTENT)?;

        emit_install_result(json, true, Some(&target), None)?;
    } else {
        emit_install_result(json, false, None, Some(fallback_message()))?;
    }

    Ok(())
}

fn resolve_home_dir() -> Result<PathBuf> {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .or_else(dirs::home_dir)
        .ok_or_else(|| {
            UntaskError::Io(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "could not determine home directory",
            ))
        })
}

fn detect_install_target(home: &Path) -> Option<PathBuf> {
    home.join(CLAUDE_DIR)
        .is_dir()
        .then(|| home.join(CLAUDE_COMMANDS_DIR).join("untask.md"))
}

fn fallback_message() -> &'static str {
    "No supported agent config found. Create ~/.claude/commands/ and run `untask skill install` again."
}

fn emit_install_result(
    json: bool,
    installed: bool,
    path: Option<&Path>,
    message: Option<&str>,
) -> Result<()> {
    if json {
        let payload = serde_json::json!({
            "installed": installed,
            "path": path.map(|path| path.display().to_string()),
            "message": message,
        });
        println!("{}", serde_json::to_string_pretty(&payload)?);
        return Ok(());
    }

    if installed {
        if let Some(path) = path {
            println!("Installed skill to {}", path.display());
        }
        return Ok(());
    }

    println!("No supported agent config directory found.");
    println!();
    println!("To install manually:");
    println!("  mkdir -p ~/.claude/commands");
    println!("  untask skill install");
    Ok(())
}
