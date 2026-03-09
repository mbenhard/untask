## Dev Mode

We are developing unship using unship itself (dev mode). Do NOT install or build release binaries.

When the `/unship` skill or any unship command is needed, run via cargo:

```
cargo run -p unship -- <command> [args]
```

Examples:
- `cargo run -p unship -- next --json`
- `cargo run -p unship -- list`
- `cargo run -p unship -- show <id>`
- `cargo run -p unship -- status <id> in-progress`
- `cargo run -p unship -- done <id>`

For the desktop app, use `pnpm tauri dev`.

Note: The project will be renamed from "unship" to something else (TBD).

## UI / Design Rules

For any desktop or visual work, follow `docs/unship-design-language.md`:

1. Monochrome first.
2. Dense spacing over airy layouts.
3. Borders and separators over heavy fills.
4. Restrained motion.
5. Geist + Geist Mono typography.

Do not ship generic SaaS styling that conflicts with the design-language doc.

## Component Library

Use **Bits UI** (headless, unstyled Svelte 5 components) for all interactive UI primitives:

- Select, Dialog, Alert Dialog, Popover, Tooltip, Combobox, Collapsible, etc.
- Bits UI provides accessibility (ARIA, keyboard nav, focus trapping) with zero styling opinions.
- Apply the design language via Tailwind classes directly on Bits UI sub-components.
- Do NOT use shadcn-svelte or other pre-styled libraries — they fight the design language.
- For simple elements (buttons, inputs, separators) that don't need headless behavior, plain Tailwind is fine.
