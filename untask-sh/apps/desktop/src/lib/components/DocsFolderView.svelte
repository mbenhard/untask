<script lang="ts">
  import type { DocNode } from "$lib/api";

  let {
    selectedNode,
    selectedChildren,
    onNodeSelect,
  }: {
    selectedNode: DocNode;
    selectedChildren: DocNode[];
    onNodeSelect: (node: DocNode) => void;
  } = $props();
</script>

<div class="flex min-h-0 flex-1 flex-col">
  <div class="border-b border-border/60 px-4 py-2.5">
    <div class="flex items-center gap-2">
      <span class="text-[14px] text-foreground">{selectedNode.name}</span>
      <span class="font-mono text-[10px] text-muted-foreground/60">
        {selectedChildren.length} items
      </span>
      {#if selectedNode.read_only}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground/40">
          <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      {/if}
    </div>
  </div>

  <div class="flex-1 overflow-y-auto">
    {#if selectedChildren.length === 0}
      <div class="flex h-full items-center justify-center px-6 py-12">
        <div class="text-center">
          <span class="font-mono text-[12px] text-muted-foreground/50">No documents</span>
        </div>
      </div>
    {:else}
      {#each selectedChildren as child}
        <button
          type="button"
          class="flex h-8 w-full items-center gap-1.5 border-b border-border/30 px-4 text-left transition-colors duration-[120ms] hover:bg-accent/30"
          onclick={() => onNodeSelect(child)}
        >
          {#if child.kind === "doc"}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 text-muted-foreground/50">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
              <polyline points="14,2 14,8 20,8" />
            </svg>
          {:else}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 text-muted-foreground/50">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2Z" />
            </svg>
          {/if}
          <span class="min-w-0 flex-1 truncate text-[12px] text-foreground">{child.name}</span>
          {#if child.doc_type === "prd"}
            <span class="ml-1 shrink-0 rounded-[3px] border border-border/60 px-1 font-mono text-[9px] leading-[14px] text-muted-foreground">
              PRD
            </span>
          {/if}
        </button>
      {/each}
    {/if}
  </div>
</div>
