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
