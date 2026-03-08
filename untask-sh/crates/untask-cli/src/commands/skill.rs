use std::path::{Path, PathBuf};

use untask_core::error::{Result, UntaskError};

const SKILL_UNTASK: &str = include_str!("../../skill/untask.md");
const SKILL_FINISH: &str = include_str!("../../skill/untask-finish.md");
const SKILL_DOCS: &str = include_str!("../../skill/untask-docs.md");
const SKILL_BATCH: &str = include_str!("../../skill/untask-batch.md");

struct SkillFile {
    name: &'static str,
    content: &'static str,
}

const SKILLS: &[SkillFile] = &[
    SkillFile {
        name: "untask",
        content: SKILL_UNTASK,
    },
    SkillFile {
        name: "untask-finish",
        content: SKILL_FINISH,
    },
    SkillFile {
        name: "untask-docs",
        content: SKILL_DOCS,
    },
    SkillFile {
        name: "untask-batch",
        content: SKILL_BATCH,
    },
];

pub fn install(provider: &str, json: bool) -> Result<()> {
    let home = resolve_home_dir()?;

    match provider {
        "claude-code" => install_claude_code(&home, json),
        "cursor" => install_to_dir(&PathBuf::from(".cursor/rules"), json),
        "codex" => install_codex(json),
        "generic" => install_generic(json),
        _ => {
            let msg =
                format!("unknown provider: {provider}. Use: claude-code, cursor, codex, generic");
            emit_install_result(json, false, &[], Some(&msg))
        }
    }
}

fn install_claude_code(home: &Path, json: bool) -> Result<()> {
    let claude_dir = home.join(".claude");
    if !claude_dir.is_dir() {
        return emit_install_result(
            json,
            false,
            &[],
            Some(
                "No supported agent config found. Create ~/.claude/commands/ and run `untask skill install` again.",
            ),
        );
    }

    let commands_dir = home.join(".claude/commands");
    std::fs::create_dir_all(&commands_dir)?;

    let mut installed_paths = Vec::new();
    for skill in SKILLS {
        let path = commands_dir.join(format!("{}.md", skill.name));
        std::fs::write(&path, skill.content)?;
        installed_paths.push(path);
    }

    emit_install_result(json, true, &installed_paths, None)
}

fn install_to_dir(dir: &Path, json: bool) -> Result<()> {
    std::fs::create_dir_all(dir)?;

    let mut installed_paths = Vec::new();
    for skill in SKILLS {
        let path = dir.join(format!("{}.md", skill.name));
        std::fs::write(&path, skill.content)?;
        installed_paths.push(path);
    }

    emit_install_result(json, true, &installed_paths, None)
}

fn install_codex(json: bool) -> Result<()> {
    let mut content = String::new();
    for skill in SKILLS {
        if !content.is_empty() {
            content.push_str("\n\n---\n\n");
        }
        content.push_str(skill.content);
    }

    let path = PathBuf::from("AGENTS.md");

    // Append to existing AGENTS.md if present
    if path.exists() {
        let existing = std::fs::read_to_string(&path)?;
        if !existing.contains("# untask") {
            let appended = format!("{existing}\n\n---\n\n{content}");
            std::fs::write(&path, appended)?;
        }
        // Already contains untask skills — skip
    } else {
        std::fs::write(&path, &content)?;
    }

    emit_install_result(json, true, &[path], None)
}

fn install_generic(json: bool) -> Result<()> {
    let dir = PathBuf::from(".github");
    std::fs::create_dir_all(&dir)?;

    let path = dir.join("copilot-instructions.md");
    let mut content = String::new();
    for skill in SKILLS {
        if !content.is_empty() {
            content.push_str("\n\n---\n\n");
        }
        content.push_str(skill.content);
    }

    if path.exists() {
        let existing = std::fs::read_to_string(&path)?;
        if !existing.contains("# untask") {
            let appended = format!("{existing}\n\n---\n\n{content}");
            std::fs::write(&path, appended)?;
        }
    } else {
        std::fs::write(&path, &content)?;
    }

    emit_install_result(json, true, &[path], None)
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

fn emit_install_result(
    json: bool,
    installed: bool,
    paths: &[PathBuf],
    message: Option<&str>,
) -> Result<()> {
    if json {
        let path_strs: Vec<String> = paths.iter().map(|p| p.display().to_string()).collect();
        let payload = serde_json::json!({
            "installed": installed,
            "paths": path_strs,
            "message": message,
        });
        println!("{}", serde_json::to_string_pretty(&payload)?);
        return Ok(());
    }

    if installed {
        for path in paths {
            println!("Installed skill to {}", path.display());
        }
        return Ok(());
    }

    if let Some(msg) = message {
        println!("{msg}");
    } else {
        println!("No supported agent config directory found.");
        println!();
        println!("To install manually:");
        println!("  mkdir -p ~/.claude/commands");
        println!("  untask skill install");
    }
    Ok(())
}
