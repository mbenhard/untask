use std::path::Path;

use unship_core::error::Result;
use unship_core::error::UnshipError;

pub fn run(root: &Path) -> Result<()> {
    #[cfg(target_os = "macos")]
    {
        let status = std::process::Command::new("open")
            .args(["-a", "Unship"])
            .arg(root)
            .status();

        match status {
            Ok(s) if s.success() => Ok(()),
            _ => Err(UnshipError::CommandFailed(
                "Could not open the Unship desktop app. Install the macOS app and re-run `unship open`.".to_string(),
            )),
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = root;
        Err(UnshipError::CommandFailed(
            "`unship open` is only supported on macOS. Open this project manually or install the desktop app on macOS.".to_string(),
        ))
    }
}
