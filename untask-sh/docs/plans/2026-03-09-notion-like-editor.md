# Notion-like Editor with Milkdown Crepe

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the raw Milkdown kit editor with Milkdown Crepe to get Notion-like editing (slash commands, floating toolbar, block handles, placeholder, proper lists).

**Architecture:** Rewrite `MilkdownEditor.svelte` to use `Crepe` class from `@milkdown/crepe` (already installed). Import the `classic-dark` theme and override CSS variables to match the monochrome design language. Keep the component's external prop API identical so all consumers (`TaskModal`, `TaskDetail`, `DocsEditor`) require no changes.

**Tech Stack:** Milkdown Crepe v7.19.0 (already in package.json), Svelte 5, Tailwind CSS v4

**Key notes:**
- CSS imports use the package's `exports` field: `@milkdown/crepe/theme/classic-dark.css` (not `crepe-dark/style.css`)
- Crepe's `CrepeBuilder` includes `clipboard`, `indent`, and `trailing` plugins for free — improving paste and tab behavior
- Subtasks are stripped from the body before reaching the editor (`subtasks.ts`), so Crepe's ListItem feature won't conflict
- The `agent-md` styles in TaskModal for `marked`-rendered agent sections are unrelated and stay unchanged

**Consumers of MilkdownEditor (all 3 must keep working):**
1. `TaskModal.svelte` — task body editing (with `saveOnBlur`, `onDirtyChange`, `onFocusChange`)
2. `TaskDetail.svelte` — task body editing (with `onSave`, `readonly`)
3. `DocsEditor.svelte` — doc editing (with `saveOnBlur`, `onContentChange`, `onDirtyChange`, `onFocusChange`)

---

### Task 1: Rewrite MilkdownEditor.svelte with Crepe

**Files:**
- Modify: `apps/desktop/src/lib/components/MilkdownEditor.svelte`

**Step 1: Replace the full component with Crepe-based implementation**

Replace the entire file with:

```svelte
<script lang="ts">
  import { untrack } from "svelte";
  import { Crepe, CrepeFeature } from "@milkdown/crepe";
  import { replaceAll } from "@milkdown/kit/utils";
  import "@milkdown/crepe/theme/common/style.css";
  import "@milkdown/crepe/theme/classic-dark.css";

  let {
    content = "",
    readonly = false,
    saveOnBlur = false,
    onSave,
    onDirtyChange,
    onContentChange,
    onFocusChange,
  }: {
    content?: string;
    readonly?: boolean;
    saveOnBlur?: boolean;
    onSave?: (markdown: string) => void;
    onDirtyChange?: (dirty: boolean) => void;
    onContentChange?: (markdown: string) => void;
    onFocusChange?: (focused: boolean) => void;
  } = $props();

  let editorEl: HTMLDivElement | undefined = $state();
  let crepeInstance: Crepe | undefined = $state();
  let dirty = $state(false);
  let initialContent = $state("");

  // Create Crepe editor once when the DOM element mounts.
  // `content` is read via untrack so changes don't recreate the editor.
  $effect(() => {
    if (!editorEl) return;

    const startContent = untrack(() => content);
    initialContent = startContent;
    let mounted = true;

    const crepe = new Crepe({
      root: editorEl,
      defaultValue: startContent,
      features: {
        [CrepeFeature.CodeMirror]: false,
        [CrepeFeature.ImageBlock]: false,
        [CrepeFeature.Latex]: false,
        [CrepeFeature.Table]: false,
      },
      featureConfigs: {
        [CrepeFeature.Placeholder]: {
          text: "Type '/' for commands...",
          mode: "block",
        },
      },
    });

    crepe.on((api) => {
      api.markdownUpdated((_ctx, md) => {
        if (!mounted) return;
        dirty = md !== initialContent;
        onContentChange?.(md);
        onDirtyChange?.(dirty);
      });
    });

    crepe.setReadonly(untrack(() => readonly));

    crepe.create().then(() => {
      if (!mounted) {
        crepe.destroy();
        return;
      }
      crepeInstance = crepe;
      requestAnimationFrame(() => {
        const pm = editorEl?.querySelector<HTMLElement>(".ProseMirror");
        pm?.focus();
      });
    });

    return () => {
      mounted = false;
      crepeInstance?.destroy();
      crepeInstance = undefined;
    };
  });

  // Sync readonly prop changes
  $effect(() => {
    crepeInstance?.setReadonly(readonly);
  });

  // Update content when prop changes externally (without recreating editor)
  $effect(() => {
    if (content !== initialContent && crepeInstance) {
      initialContent = content;
      crepeInstance.editor.action(replaceAll(content));
      dirty = false;
      onDirtyChange?.(false);
    }
  });

  function save() {
    if (onSave && crepeInstance) {
      const md = crepeInstance.getMarkdown();
      onSave(md);
      initialContent = md;
      dirty = false;
      onContentChange?.(md);
      onDirtyChange?.(false);
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      save();
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="milkdown-wrap"
  onkeydown={handleKeydown}
  onfocusin={() => onFocusChange?.(true)}
  onfocusout={(e) => {
    const leavingEditor = !e.currentTarget.contains(e.relatedTarget as Node);
    if (saveOnBlur && dirty && leavingEditor) {
      save();
    }
    if (leavingEditor) {
      onFocusChange?.(false);
    }
  }}
>
  <div
    bind:this={editorEl}
    class="milkdown-editor min-h-[120px] text-[14px] leading-[1.5] text-foreground outline-none"
    class:pointer-events-none={readonly}
    class:opacity-60={readonly}
  ></div>
</div>

<style>
  .milkdown-wrap :global(.milkdown) {
    outline: none;
  }

  .milkdown-wrap :global(.ProseMirror) {
    outline: none;
    min-height: 80px;
    padding: 8px 12px;
  }

  /* Dense heading sizes per design language */
  .milkdown-wrap :global(.ProseMirror h1) {
    font-size: 18px;
    font-weight: 500;
  }
  .milkdown-wrap :global(.ProseMirror h2) {
    font-size: 15px;
    font-weight: 500;
  }
  .milkdown-wrap :global(.ProseMirror h3) {
    font-size: 14px;
    font-weight: 500;
  }

  /* Monochrome design-language overrides for Crepe theme */
  .milkdown-wrap :global(.milkdown) {
    --crepe-color-background: transparent;
    --crepe-color-surface: #1a1a1a;
    --crepe-color-surface-low: #161616;
    --crepe-color-on-background: #f5f5f5;
    --crepe-color-on-surface: #f5f5f5;
    --crepe-color-on-surface-variant: #9c9c9c;
    --crepe-color-outline: #2a2a2a;
    --crepe-color-primary: #e5e5e5;
    --crepe-color-secondary: #1e1e1e;
    --crepe-color-on-secondary: #f5f5f5;
    --crepe-color-inverse: #f5f5f5;
    --crepe-color-on-inverse: #161616;
    --crepe-color-inline-code: #e5e5e5;
    --crepe-color-error: #7f1d1d;
    --crepe-color-hover: #1e1e1e;
    --crepe-color-selected: #2a2a2a;
    --crepe-color-inline-area: #2a2a2a;

    --crepe-font-title: var(--font-sans);
    --crepe-font-default: var(--font-sans);
    --crepe-font-code: var(--font-mono);

    --crepe-shadow-1: none;
    --crepe-shadow-2: none;
  }
</style>
```

**Step 2: Run dev server to verify it compiles**

Run: `cd apps/desktop && pnpm tauri dev`

Expected: App compiles and launches. The editor should show Crepe's Notion-like UI with slash menu, block handles, and floating toolbar. Colors should match the monochrome design language (no warm/brown tones from default crepe-dark).

**Step 3: Verify all markdown elements work**

Test in the running app:
- Type `1. First`, Enter, `2. Second`, Enter, `3. Third` — numbers should be visible
- Type `* bullet`, Enter, `* bullet` — bullet dots should be visible
- Type `---` — horizontal rule appears, pressing Enter after it creates a new paragraph below
- Select text — floating toolbar appears with bold/italic/link options
- Type `/` at start of a line — slash menu appears with block type options
- Hover left side of any block — drag handle appears
- Type `- [ ] task item` — checkbox list item renders
- Paste content — clipboard plugin handles it (new in Crepe)
- Tab in a list — indents the item (new indent plugin in Crepe)
- Cmd+S — saves

**Step 4: Commit**

```
git add apps/desktop/src/lib/components/MilkdownEditor.svelte
git commit -m "feat: replace raw Milkdown kit with Crepe for Notion-like editing

Switches from manual Editor.make() + commonmark/gfm plugins to the Crepe
preset which provides: slash commands, floating toolbar, block drag handles,
placeholder text, proper list rendering, clipboard, indent, and trailing
paragraph support. Theme variables overridden to match monochrome design
language."
```

---

### Task 2: Visual QA pass on all editor consumers

**Files:** (read-only verification, fixes only if needed)
- `apps/desktop/src/lib/components/TaskModal.svelte`
- `apps/desktop/src/lib/components/TaskDetail.svelte`
- `apps/desktop/src/lib/components/DocsEditor.svelte`

**Step 1: Test TaskModal**

Open a task in the modal. Verify:
- Body editor renders with Crepe (slash menu, toolbar, etc.)
- Save on blur still works (edit text, click outside, reopen — changes persisted)
- Cmd+S still saves
- Readonly mode (for unindexed tasks) disables editing
- Agent Summary / Deferred / Review Notes sections still render correctly (these use `marked`, completely separate from Crepe)
- Subtask list below body still works (subtasks are parsed from markdown separately)

**Step 2: Test TaskDetail**

Navigate to the detail view. Verify:
- Same Crepe editor features work
- Readonly for unindexed tasks works
- Save callback fires correctly

**Step 3: Test DocsEditor**

Open a doc from the docs panel. Verify:
- Editor loads doc content (minus frontmatter)
- Save on blur writes back correctly (check file on disk)
- `onContentChange` fires (liveContent tracking for stale detection)
- `onDirtyChange` fires (dirty state indicator)
- `onFocusChange` fires (focus tracking for conflict detection)
- Stale/conflict detection still works (edit file externally while focused)

**Step 4: Fix layout issues if any**

Common issues to watch for:
- Slash menu or toolbar overflow outside modal bounds → add `overflow: visible` or adjust z-index in TaskModal's `<style>` block
- Block drag handle overlaps sidebar/panel edge → adjust handle offset via `featureConfigs[CrepeFeature.BlockEdit].blockHandle.getOffset`
- Crepe adds its own padding that doubles up with existing container padding → adjust `.ProseMirror` padding in the component `<style>` block

**Step 5: Commit (only if fixes were needed)**

```
git commit -m "fix: adjust Crepe editor layout for task modal and docs editor"
```

---

### Task 3: Clean up unused dependencies

**Files:**
- Modify: `apps/desktop/package.json`

**Step 1: Remove `@milkdown/theme-nord`**

Grep the codebase for `theme-nord`. It's only in `package.json` (unused). Remove it:

```bash
cd apps/desktop && pnpm remove @milkdown/theme-nord
```

**Step 2: Verify remaining dependencies are still needed**

- `marked` — used in `TaskModal.svelte` for agent sections. Keep.
- `@milkdown/kit` — Crepe depends on it internally, and we import `replaceAll` from it. Keep.
- `@milkdown/crepe` — our new editor. Keep.

**Step 3: Commit**

```
git add apps/desktop/package.json pnpm-lock.yaml
git commit -m "chore: remove unused @milkdown/theme-nord dependency"
```
