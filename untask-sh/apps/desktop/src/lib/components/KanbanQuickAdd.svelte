<script lang="ts">
  import { focusOnMount } from "$lib/actions";

  let {
    title,
    error = null,
    errorFlash = false,
    pastedCount = 0,
    onTitleChange,
    onSubmit,
    onCancel,
    onPaste,
  }: {
    title: string;
    error?: string | null;
    errorFlash?: boolean;
    pastedCount?: number;
    onTitleChange: (value: string) => void;
    onSubmit: () => void | Promise<void>;
    onCancel: () => void;
    onPaste: (event: ClipboardEvent) => void | Promise<void>;
  } = $props();

  function handleInput(event: Event) {
    onTitleChange((event.currentTarget as HTMLTextAreaElement).value);
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      void onSubmit();
    } else if (event.key === "Escape") {
      onCancel();
    }
  }

  function handleBlur() {
    if (title.trim()) {
      void onSubmit();
    } else {
      onCancel();
    }
  }
</script>

<div class="rounded-[6px] border border-border/60 bg-card px-2.5 py-2">
  <textarea
    value={title}
    oninput={handleInput}
    onkeydown={handleKeydown}
    onblur={handleBlur}
    onpaste={onPaste}
    oninputcapture={(event) => {
      const element = event.currentTarget as HTMLTextAreaElement;
      element.style.height = "auto";
      element.style.height = `${element.scrollHeight}px`;
    }}
    placeholder="Task title..."
    rows="1"
    style="overflow:hidden; box-shadow:none"
    class="w-full resize-none border-0 bg-transparent p-0 text-[13px] leading-snug text-foreground placeholder:text-muted-foreground/40 outline-none focus:outline-none focus:ring-0 focus:shadow-none"
    class:border-destructive={errorFlash}
    use:focusOnMount={{ autosize: true }}
  ></textarea>
  {#if pastedCount > 0}
    <div class="mt-1 flex items-center gap-1 font-mono text-[9px] text-muted-foreground/50">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
      </svg>
      {pastedCount} image{pastedCount > 1 ? "s" : ""} pasted
    </div>
  {/if}
  {#if error}
    <p class="mt-1 font-mono text-[10px] text-red-400">{error}</p>
  {/if}
</div>

<style>
  textarea:focus,
  textarea:focus-visible {
    outline: none;
    border-color: transparent;
    box-shadow: none;
  }
</style>
