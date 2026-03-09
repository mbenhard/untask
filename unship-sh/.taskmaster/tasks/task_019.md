# Task ID: 19

**Title:** Desktop File Watching, CI Workflows, and Release Automation

**Status:** pending

**Dependencies:** 15, 18

**Priority:** high

**Description:** Add file watching to desktop app, create CI workflows for Rust and desktop checks, and set up release automation for CLI and preview desktop builds.

**Details:**

Complete the app and release infrastructure:

**File Watching:**
1. Add notify-based watcher to desktop backend
2. Emit events to frontend via Tauri events:
```rust
#[tauri::command]
async fn start_watcher(app: tauri::AppHandle, path: String) -> Result<(), String> {
    // Set up watcher, emit "refresh" events
    app.emit("tasks-changed", ())?;
}
```
3. Frontend subscribes and refreshes stores
4. Debounce events (100-200ms window)
5. Clean up watcher on project switch

**CI Workflows:**

Create `.github/workflows/ci.yml`:
```yaml
name: CI
on: [push, pull_request]
jobs:
  rust:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - run: cargo fmt --all --check
      - run: cargo clippy --workspace --all-targets -- -D warnings
      - run: cargo test --workspace
  
  desktop:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: cd apps/desktop && npm install
      - run: cd apps/desktop && npm run check
      - run: cd apps/desktop && npm run tauri build
```

**Release Workflow:**

Create `.github/workflows/release.yml`:
```yaml
name: Release
on:
  push:
    tags: ['v*']
jobs:
  cli:
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - Build CLI binaries
      - Create release archives
      - Upload to GitHub Release
  
  desktop-preview:
    runs-on: macos-latest
    steps:
      - Build unsigned .dmg
      - Label as preview-only
      - Upload to GitHub Release
```

**Notes:**
- Desktop builds are unsigned preview releases
- Add signing/notarization only when credentials exist
- No Homebrew cask until signed builds

**Test Strategy:**

1. Test file watcher updates frontend on external file change.
2. Test CLI edit reflects in open desktop app.
3. Test desktop edit reflects in subsequent CLI reads.
4. Test project switch cleans up old watcher.
5. Verify CI workflow passes on clean branch.
6. Verify release workflow produces expected artifacts:
   - CLI binaries for Linux, macOS, Windows
   - Unsigned .dmg for macOS labeled as preview
7. Verify preview release artifacts have clear labeling.
8. Run quality gates before claiming release readiness.
