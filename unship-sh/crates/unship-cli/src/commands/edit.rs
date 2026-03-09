use std::process::Command;

use unship_core::error::{Result, UnshipError};
use unship_core::store::TaskStore;

pub fn run(store: &TaskStore, reference: &str) -> Result<()> {
    let task = store.get_by_ref(reference)?;
    let path = task
        .file_path
        .ok_or_else(|| UnshipError::TaskNotFound(reference.to_string()))?;

    let (editor, args) = resolve_editor_command()?;
    let editor_display = display_editor_command(&editor, &args);

    let status = Command::new(&editor)
        .args(&args)
        .arg(&path)
        .status()
        .map_err(|e| {
            UnshipError::InvalidConfig(format!("failed to launch editor '{editor_display}': {e}"))
        })?;

    if !status.success() {
        return Err(UnshipError::InvalidConfig(format!(
            "editor exited with status {}",
            status.code().unwrap_or(-1)
        )));
    }

    Ok(())
}

fn resolve_editor_command() -> Result<(String, Vec<String>)> {
    match preferred_editor_command() {
        Some(command) => parse_editor_command(&command).ok_or_else(|| {
            UnshipError::InvalidConfig(format!("invalid editor command: {command}"))
        }),
        None => Ok((find_fallback_editor(), Vec::new())),
    }
}

fn preferred_editor_command() -> Option<String> {
    ["EDITOR", "VISUAL"].into_iter().find_map(|key| {
        std::env::var(key)
            .ok()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
    })
}

fn parse_editor_command(command: &str) -> Option<(String, Vec<String>)> {
    let mut parts = shlex::split(command)?.into_iter();
    let program = parts.next()?;
    Some((program, parts.collect()))
}

fn display_editor_command(program: &str, args: &[String]) -> String {
    if args.is_empty() {
        program.to_string()
    } else {
        format!("{program} {}", args.join(" "))
    }
}

fn find_fallback_editor() -> String {
    for editor in ["vim", "nano", "vi"] {
        if which_exists(editor) {
            return editor.to_string();
        }
    }
    "vi".to_string()
}

fn which_exists(cmd: &str) -> bool {
    Command::new("which")
        .arg(cmd)
        .output()
        .is_ok_and(|o| o.status.success())
}

#[cfg(test)]
mod tests {
    use super::parse_editor_command;

    #[test]
    fn parses_editor_command_with_arguments() {
        let (program, args) = parse_editor_command("code --wait ./task.md").unwrap();
        assert_eq!(program, "code");
        assert_eq!(args, vec!["--wait", "./task.md"]);
    }

    #[test]
    fn rejects_invalid_shell_syntax() {
        assert!(parse_editor_command("code \"unterminated").is_none());
    }
}
