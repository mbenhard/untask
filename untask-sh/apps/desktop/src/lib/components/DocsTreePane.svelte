<script lang="ts">
  import type { DocNode } from "$lib/api";
  import type { FlatDocNode } from "$lib/docsTree";
  import { cn } from "$lib/utils";

  let {
    totalDocs,
    flatNodes,
    selectedPath,
    expandedPaths,
    onTreeKeydown,
    onNodeSelect,
    onToggle,
  }: {
    totalDocs: number;
    flatNodes: FlatDocNode[];
    selectedPath: string | null;
    expandedPaths: Set<string>;
    onTreeKeydown: (event: KeyboardEvent) => void;
    onNodeSelect: (node: DocNode) => void;
    onToggle: (node: DocNode) => void;
  } = $props();
</script>

<aside class="flex w-[240px] min-w-[240px] flex-col border-r border-border/60">
  <div class="flex items-center justify-between border-b border-border/60 px-3 py-2">
    <span class="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
      Documents
    </span>
    <span class="font-mono text-[10px] text-muted-foreground/60">
      {totalDocs}
    </span>
  </div>

  <div
    class="docs-tree flex-1 overflow-y-auto overflow-x-auto outline-none"
    role="tree"
    tabindex="0"
    onkeydown={onTreeKeydown}
  >
    {#if flatNodes.length === 0}
      <div class="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground/30">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
          <polyline points="14,2 14,8 20,8" />
        </svg>
        <span class="font-mono text-[12px] text-muted-foreground/50">No documents</span>
      </div>
    {:else}
      {#each flatNodes as item}
        <div
          role="treeitem"
          aria-selected={selectedPath === item.node.node_path}
          aria-expanded={item.node.kind === "doc" ? undefined : expandedPaths.has(item.node.node_path)}
          tabindex={selectedPath === item.node.node_path ? 0 : -1}
          class={cn(
            "flex h-8 w-full items-center transition-colors duration-[120ms] hover:bg-accent/30 focus:outline-none",
            selectedPath === item.node.node_path && "border-l-2 border-l-ring bg-accent/50",
          )}
          style={`padding-left: ${Math.min(12 + item.depth * 16, 108)}px;`}
          onclick={() => onNodeSelect(item.node)}
          onkeydown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onNodeSelect(item.node);
            }
          }}
        >
          {#if item.node.kind === "doc"}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="mr-1.5 shrink-0 text-muted-foreground/50">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
              <polyline points="14,2 14,8 20,8" />
            </svg>
          {:else}
            <button
              type="button"
              aria-label={expandedPaths.has(item.node.node_path) ? "Collapse folder" : "Expand folder"}
              tabindex="-1"
              class="mr-1 flex shrink-0 cursor-pointer items-center justify-center text-muted-foreground/50 transition-transform duration-[120ms]"
              class:rotate-90={expandedPaths.has(item.node.node_path)}
              onclick={(e) => {
                e.stopPropagation();
                onToggle(item.node);
              }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3.5,2 6.5,5 3.5,8" />
              </svg>
            </button>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="mr-1.5 shrink-0 text-muted-foreground/50">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2Z" />
            </svg>
          {/if}

          <span class="min-w-0 flex-1 truncate text-left text-[12px] text-foreground">{item.node.name}</span>

          {#if item.node.doc_type === "prd"}
            <span class="ml-1 shrink-0 rounded-[3px] border border-border/60 px-1 font-mono text-[9px] leading-[14px] text-muted-foreground">
              PRD
            </span>
          {/if}

          {#if item.node.read_only}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="ml-1 shrink-0 text-muted-foreground/30">
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          {/if}
        </div>
      {/each}
    {/if}
  </div>
</aside>

<style>
  .docs-tree {
    scrollbar-width: thin;
    scrollbar-color: rgb(42 42 42 / 0.4) transparent;
  }

  .docs-tree::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }

  .docs-tree::-webkit-scrollbar-track {
    background: transparent;
  }

  .docs-tree::-webkit-scrollbar-thumb {
    background: rgb(42 42 42 / 0.4);
    border-radius: 3px;
  }
</style>
