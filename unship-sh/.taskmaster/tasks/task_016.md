# Task ID: 16

**Title:** Desktop App Scaffold with Tauri 2 and Svelte 5

**Status:** pending

**Dependencies:** 5

**Priority:** high

**Description:** Scaffold the desktop app under apps/desktop using Tauri 2 with Svelte 5, Tailwind CSS, shadcn-svelte, and integrate into the Rust workspace.

**Details:**

Create the desktop app foundation:

1. Scaffold using official Tauri flow:
```bash
npm create tauri-app@latest apps/desktop -- --template svelte-ts
cd apps/desktop
npx sv add tailwindcss
npx shadcn-svelte@latest init
npm run tauri add dialog
```

2. Update root `Cargo.toml` to include desktop:
```toml
[workspace]
members = [
    "crates/unship-core",
    "crates/unship-cli",
    "apps/desktop/src-tauri"
]
```

3. Update `apps/desktop/src-tauri/Cargo.toml`:
```toml
[dependencies]
unship-core = { path = "../../../crates/unship-core" }
tauri = { version = "2.0", features = ["dialog"] }
tauri-plugin-dialog = "2.0"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
```

4. Register dialog plugin in `src-tauri/src/lib.rs`:
```rust
tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(...)
    .run(tauri::generate_context!())
```

5. Read `docs/unship-design-language.md` before defining frontend primitives, then set up the initial Svelte 5 structure and shared design tokens:
   - `src/App.svelte` - main app shell
   - `src/lib/stores.ts` - Svelte stores for state
   - `src/lib/components/` - component directory
   - shared CSS variables for monochrome surfaces, borders, spacing, and typography aligned with the design-language doc

6. Keep macOS-first but avoid macOS-only Rust code in shared core.

**Test Strategy:**

1. Run `cd apps/desktop && npm install` - should succeed.
2. Run `cd apps/desktop && npm run check` - should pass type checking.
3. Run `cd apps/desktop && npm run tauri dev` - should launch app window.
4. Verify workspace builds: `cargo build --workspace`.
5. Verify Tauri dialog plugin is properly registered.
6. Verify Tailwind CSS is working (add a test class).
7. Verify shadcn-svelte components can be imported.
8. Verify the initial shell tokens and typography direction match `docs/unship-design-language.md` before view work begins.
