use std::process::Command;

#[test]
fn help_lists_expected_commands_and_flags() {
    let output = Command::new(env!("CARGO_BIN_EXE_untask"))
        .arg("--help")
        .output()
        .unwrap();

    assert!(output.status.success());

    let stdout = String::from_utf8(output.stdout).unwrap();
    for expected in [
        "Local-first project companion",
        "init",
        "add",
        "list",
        "docs",
        "repair",
        "skill",
        "open",
        "--json",
        "--no-color",
    ] {
        assert!(
            stdout.contains(expected),
            "expected help output to contain {expected:?}, got:\n{stdout}"
        );
    }
}

#[test]
fn version_matches_package_version() {
    let output = Command::new(env!("CARGO_BIN_EXE_untask"))
        .arg("--version")
        .output()
        .unwrap();

    assert!(output.status.success());
    assert_eq!(
        String::from_utf8(output.stdout).unwrap().trim(),
        format!("untask {}", env!("CARGO_PKG_VERSION"))
    );
}
