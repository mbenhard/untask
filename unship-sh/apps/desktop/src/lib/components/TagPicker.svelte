<script lang="ts">
  import { Popover } from "bits-ui";
  import { listAllTags, type TagInfo } from "$lib/api";
  import { tagColor } from "$lib/tagColor";

  let {
    currentTags,
    onToggle,
    onAdd,
  }: {
    currentTags: string[];
    onToggle: (tag: string) => void;
    onAdd: (tag: string) => void;
  } = $props();

  let open = $state(false);
  let filterText = $state("");
  let allTags = $state<TagInfo[]>([]);
  let inputEl: HTMLInputElement | undefined = $state();

  $effect(() => {
    if (open) {
      filterText = "";
      void listAllTags().then((tags) => { allTags = tags; });
      // Focus input after popover opens
      requestAnimationFrame(() => {
        requestAnimationFrame(() => { inputEl?.focus(); });
      });
    }
  });

  let filteredTags = $derived.by(() => {
    const query = filterText.toLowerCase().trim();
    if (!query) return allTags;
    return allTags.filter((t) => t.name.toLowerCase().includes(query));
  });

  let exactMatch = $derived(
    allTags.some((t) => t.name.toLowerCase() === filterText.toLowerCase().trim()),
  );

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      const trimmed = filterText.trim();
      if (!trimmed) return;
      if (exactMatch) {
        onToggle(allTags.find((t) => t.name.toLowerCase() === trimmed.toLowerCase())!.name);
      } else {
        onAdd(trimmed);
        // Add to local list so it appears immediately
        allTags = [{ name: trimmed, count: 1 }, ...allTags];
      }
      filterText = "";
    } else if (e.key === "Escape") {
      open = false;
    }
  }

  function isSelected(tag: string): boolean {
    return currentTags.includes(tag);
  }
</script>

<Popover.Root bind:open>
  <Popover.Trigger
    class="inline-flex h-6 items-center rounded-[4px] border border-dashed border-border/60 px-2 font-mono text-[10px] leading-none text-muted-foreground/60 transition-colors duration-[120ms] hover:border-border hover:text-muted-foreground"
  >
    + tag
  </Popover.Trigger>

  <Popover.Content
    class="z-[60] w-[200px] rounded-[8px] border border-border/60 bg-popover shadow-[0_8px_24px_-4px_rgba(0,0,0,0.4)]"
    sideOffset={4}
    align="start"
  >
    <div class="p-1.5">
      <input
        bind:this={inputEl}
        bind:value={filterText}
        onkeydown={handleKeydown}
        type="text"
        placeholder="Filter or create..."
        class="w-full rounded-[4px] border border-border/60 bg-transparent px-2 py-1 font-mono text-[10px] text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-border"
      />
    </div>

    <div class="max-h-[180px] overflow-y-auto px-1 pb-1.5">
      {#each filteredTags as tag}
        <button
          type="button"
          class="flex w-full items-center gap-1.5 rounded-[4px] px-1.5 py-1 text-left transition-colors duration-[80ms] hover:bg-accent"
          onclick={() => { onToggle(tag.name); }}
        >
          <span
            class="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
            style="background-color: {tagColor(tag.name)}"
          ></span>
          <span class="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground" class:text-foreground={isSelected(tag.name)}>
            {tag.name}
          </span>
          <span class="shrink-0 font-mono text-[9px] text-muted-foreground/40">{tag.count}</span>
          {#if isSelected(tag.name)}
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 text-foreground">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          {/if}
        </button>
      {/each}

      {#if filterText.trim() && !exactMatch}
        <button
          type="button"
          class="flex w-full items-center gap-1.5 rounded-[4px] px-1.5 py-1 text-left transition-colors duration-[80ms] hover:bg-accent"
          onclick={() => {
            const trimmed = filterText.trim();
            onAdd(trimmed);
            allTags = [{ name: trimmed, count: 1 }, ...allTags];
            filterText = "";
          }}
        >
          <span class="font-mono text-[10px] text-muted-foreground/60">Create</span>
          <span class="font-mono text-[10px] text-foreground">"{filterText.trim()}"</span>
        </button>
      {/if}

      {#if filteredTags.length === 0 && !filterText.trim()}
        <p class="px-1.5 py-2 font-mono text-[10px] text-muted-foreground/40">No tags yet</p>
      {/if}
    </div>
  </Popover.Content>
</Popover.Root>
