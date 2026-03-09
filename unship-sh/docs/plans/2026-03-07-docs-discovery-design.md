# Docs Discovery Design

## Problem

The default docs glob is `.unship/docs/**/*.md`, but most projects keep docs in `docs/` at the project root. With no `.unship/config.yml`, the Docs view shows nothing even when `docs/` is full of markdown files. There is also no way to manage doc globs from the CLI or GUI without manually editing YAML.

## Design

### Defaults (zero config)

Two default globs, covering the most common layouts:

- `.unship/docs/**/*.md` (unship-specific docs)
- `docs/**/*.md` (standard project docs, including root-level files like `docs/README.md`)

### Config model

The `docs` field in `.unship/config.yml` is the single source of truth. When absent, `default_docs()` provides both defaults. Once the user modifies paths via CLI or GUI, the config stores the full explicit list -- no hidden merging with hardcoded values.

This is an intentional behavior change: under the old model, the hardcoded default was always force-merged regardless of config. Under the new model, config is authoritative. If a user explicitly sets `docs: ["docs/**/*.md"]`, only that glob is used. This is the correct semantic -- explicit config should mean exactly what it says.

Example after adding a custom path:

```yaml
docs:
  - ".unship/docs/**/*.md"
  - "docs/**/*.md"
  - "specs/**/*.md"
```

### Code changes

**`config.rs`:**

- `default_docs()` returns `[".unship/docs/**/*.md", "docs/**/*.md"]`.
- Remove `DEFAULT_DOC_GLOB` constant (replaced by the two-element default).

**`docs.rs`:**

- `doc_patterns()` becomes a simple accessor returning `self.config.docs` directly (no merging logic).

**`watcher.rs` (desktop app):**

- Remove import of `DEFAULT_DOC_GLOB`.
- Remove `unique_doc_patterns()` function (duplicate of the merging logic in `docs.rs`).
- Replace with a call to `config.docs` directly, same simplification as `docs.rs`.
- Note: zero-config projects will now trigger watcher refreshes on `docs/**/*.md` changes too. This is desirable -- the watcher should match what the docs view shows.

**`cli.rs`:**

- Add `Paths`, `AddPath`, `RemovePath` variants to `DocsCommands` enum.

**`commands/docs.rs`:**

- `paths`: reads `Config::load().docs` directly and prints the list.
- `add-path`: loads config, appends glob (dedup), calls `validate_doc_globs()`, saves.
- `remove-path`: loads config, removes matching glob, saves. Prints a warning if the list becomes empty ("No doc paths configured. Use `unship docs add-path` to add one.") but allows it -- user's choice.

### CLI commands

Three new subcommands under `unship docs`:

```
unship docs paths                        # list active globs
unship docs add-path "specs/**/*.md"     # add a glob, save to config
unship docs remove-path "docs/**/*.md"   # remove a glob, save to config
```

Behavior:

- `paths`: prints effective glob list (from config or defaults).
- `add-path`: loads config (defaults if none exists), appends the glob (deduplicates), validates with `validate_doc_globs()`, saves to `.unship/config.yml`.
- `remove-path`: loads config (defaults if none exists), removes matching glob, errors if not found. Allows emptying the list with a warning.

### CLI subcommand structure

Current `docs` subcommands:

```
unship docs           # list docs
unship docs show <n>  # show a doc
```

Extended:

```
unship docs paths
unship docs add-path <glob>
unship docs remove-path <glob>
```

### GUI (deferred)

Future task: add a settings section in the Docs view with a list of active globs and add/remove controls. The GUI calls the same underlying config operations.

### Validation

- `add-path` must call `validate_doc_globs()` before saving to reject absolute paths and parent traversal (`../`).
- Existing validation rules remain unchanged.

### Tests to update

- `docs_test.rs`: `list_always_includes_default_docs_glob` -- update to reflect that config is now authoritative (no force-merge of hardcoded default). If config says `["docs/**/*.md"]` only, `.unship/docs/` is not searched.
- `config_test.rs`: `invalid_doc_globs_in_config_fall_back_to_defaults` -- update default assertion from `[".unship/docs/**/*.md"]` to `[".unship/docs/**/*.md", "docs/**/*.md"]`.
- Add new tests for `add-path`, `remove-path`, and `paths` commands.

### Migration

No migration needed. The change is backwards-compatible:

- Projects with no config get a better default (both globs).
- Projects with an existing `docs` key in config behave identically (config is already the full list -- the only difference is the old hardcoded default is no longer force-merged, but this is the correct behavior).

### Note on `Config::save`

`Config::save` serializes all fields (columns, docs, theme). The first `add-path` on a project with no config will write out the full default config. This is acceptable -- the config file is meant to be committed and the defaults are sensible. Users who want a minimal config can edit the YAML directly.
