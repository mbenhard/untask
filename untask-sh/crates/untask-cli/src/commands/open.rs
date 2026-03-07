use std::path::Path;

use untask_core::error::Result;
use untask_core::error::UntaskError;

pub fn run(root: &Path) -> Result<()> {
    #[cfg(target_os = "macos")]
    {
        let status = std::process::Command::new("open")
            .args(["-a", "Untask"])
            .arg(root)
            .status();

        match status {
            Ok(s) if s.success() => Ok(()),
            _ => Err(UntaskError::CommandFailed(
                "Could not open the Untask desktop app. Install the macOS app and re-run `untask open`.".to_string(),
            )),
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = root;
        Err(UntaskError::CommandFailed(
            "`untask open` is only supported on macOS. Open this project manually or install the desktop app on macOS.".to_string(),
        ))
    }
}
