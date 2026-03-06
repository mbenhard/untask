<script lang="ts">
  import type { DocInfo } from "$lib/api";

  let {
    docs,
    onDocSelect,
  }: {
    docs: DocInfo[];
    onDocSelect: (doc: DocInfo) => void;
  } = $props();
</script>

<div class="flex min-h-0 flex-1 flex-col">
  <div class="flex items-center justify-between border-b border-border/80 px-3 py-2">
    <span class="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
      Documents
    </span>
    <span
      class="rounded-full border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
    >
      {docs.length}
    </span>
  </div>

  <div class="flex-1 overflow-y-auto">
    {#each docs as doc}
      <button
        type="button"
        class="flex min-h-[40px] w-full items-center border-b border-border/40 px-3 py-1.5 text-left transition-colors hover:bg-accent/60"
        onclick={() => onDocSelect(doc)}
      >
        <div class="min-w-0 flex-1">
          <p class="truncate text-[13px] text-foreground">{doc.basename}</p>
          <p class="truncate font-mono text-[10px] text-muted-foreground">{doc.path}</p>
        </div>
      </button>
    {/each}

    {#if docs.length === 0}
      <div class="flex flex-col items-center justify-center gap-2 py-12">
        <span class="font-mono text-[11px] text-muted-foreground/50">No documents</span>
        <span class="text-[12px] text-muted-foreground/40">
          Add markdown files to .untask/docs/
        </span>
      </div>
    {/if}
  </div>
</div>
