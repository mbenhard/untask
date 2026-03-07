## Dev Mode

We are developing untask using untask itself (dev mode). Do NOT install or build release binaries.

When the `/untask` skill or any untask command is needed, run via cargo:

```
cargo run -p untask -- <command> [args]
```

Examples:
- `cargo run -p untask -- next --json`
- `cargo run -p untask -- list`
- `cargo run -p untask -- show <id>`
- `cargo run -p untask -- status <id> in-progress`
- `cargo run -p untask -- done <id>`

For the desktop app, use `pnpm tauri dev`.

Note: The project will be renamed from "untask" to something else (TBD).

## UI / Design Rules

For any desktop or visual work, follow `docs/untask-design-language.md`:

1. Monochrome first.
2. Dense spacing over airy layouts.
3. Borders and separators over heavy fills.
4. Restrained motion.
5. Geist + Geist Mono typography.
6. Tiny priority dots instead of loud priority badges where the design language applies.

Do not ship generic SaaS styling that conflicts with the design-language doc.
