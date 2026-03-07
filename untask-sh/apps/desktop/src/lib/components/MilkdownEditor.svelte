<script lang="ts">
  import { Editor, rootCtx, defaultValueCtx } from "@milkdown/kit/core";
  import { commonmark } from "@milkdown/kit/preset/commonmark";
  import { gfm } from "@milkdown/kit/preset/gfm";
  import { history } from "@milkdown/kit/plugin/history";
  import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
  import { replaceAll, getMarkdown } from "@milkdown/kit/utils";

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
  let editorInstance: Editor | undefined = $state();
  let dirty = $state(false);
  let initialContent = $state("");

  $effect(() => {
    if (!editorEl) return;

    const startContent = content;
    initialContent = startContent;
    let mounted = true;

    Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, editorEl!);
        ctx.set(defaultValueCtx, startContent);
        ctx.get(listenerCtx).markdownUpdated((_ctx, md) => {
          if (!mounted) return;
          dirty = md !== initialContent;
          onContentChange?.(md);
          onDirtyChange?.(dirty);
        });
      })
      .use(commonmark)
      .use(gfm)
      .use(history)
      .use(listener)
      .create()
      .then((editor) => {
        if (!mounted) {
          editor.destroy();
          return;
        }
        editorInstance = editor;
      });

    return () => {
      mounted = false;
      editorInstance?.destroy();
      editorInstance = undefined;
    };
  });

  // Update content when prop changes externally
  $effect(() => {
    if (content !== initialContent && editorInstance) {
      initialContent = content;
      editorInstance.action(replaceAll(content));
      dirty = false;
      onContentChange?.(content);
      onDirtyChange?.(false);
    }
  });

  function save() {
    if (onSave && editorInstance) {
      const md = editorInstance.action(getMarkdown());
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
  {#if dirty && onSave}
    <div class="flex items-center justify-between border-b border-border/80 px-3 py-1.5">
      <span class="font-mono text-[10px] text-muted-foreground">Unsaved changes</span>
      <button
        type="button"
        class="rounded-[4px] border border-border px-2 py-0.5 font-mono text-[10px] text-foreground transition-colors hover:bg-accent"
        onclick={save}
      >
        Save
      </button>
    </div>
  {/if}
  <div
    bind:this={editorEl}
    class="milkdown-editor prose prose-invert min-h-[120px] px-3 py-2 text-[14px] leading-[1.5] text-foreground outline-none"
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
  }

  .milkdown-wrap :global(.ProseMirror p) {
    margin: 0.25em 0;
  }

  .milkdown-wrap :global(.ProseMirror h1) {
    font-size: 18px;
    font-weight: 500;
    margin: 0.5em 0 0.25em;
  }

  .milkdown-wrap :global(.ProseMirror h2) {
    font-size: 15px;
    font-weight: 500;
    margin: 0.5em 0 0.25em;
  }

  .milkdown-wrap :global(.ProseMirror h3) {
    font-size: 14px;
    font-weight: 500;
    margin: 0.4em 0 0.2em;
  }

  .milkdown-wrap :global(.ProseMirror ul),
  .milkdown-wrap :global(.ProseMirror ol) {
    padding-left: 1.25em;
    margin: 0.25em 0;
  }

  .milkdown-wrap :global(.ProseMirror li) {
    margin: 0.1em 0;
  }

  .milkdown-wrap :global(.ProseMirror code) {
    font-family: var(--font-mono);
    font-size: 12px;
    background: var(--color-accent);
    border: 1px solid var(--color-border);
    border-radius: 3px;
    padding: 1px 4px;
  }

  .milkdown-wrap :global(.ProseMirror pre) {
    font-family: var(--font-mono);
    font-size: 12px;
    background: var(--color-accent);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    padding: 8px 10px;
    margin: 0.4em 0;
    overflow-x: auto;
  }

  .milkdown-wrap :global(.ProseMirror pre code) {
    background: none;
    border: none;
    padding: 0;
  }

  .milkdown-wrap :global(.ProseMirror blockquote) {
    border-left: 2px solid var(--color-border);
    padding-left: 10px;
    margin: 0.4em 0;
    color: var(--color-muted-foreground);
  }

  .milkdown-wrap :global(.ProseMirror hr) {
    border: none;
    border-top: 1px solid var(--color-border);
    margin: 0.75em 0;
  }

  .milkdown-wrap :global(.ProseMirror a) {
    color: var(--color-foreground);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .milkdown-wrap :global(.ProseMirror input[type="checkbox"]) {
    margin-right: 4px;
  }
</style>
