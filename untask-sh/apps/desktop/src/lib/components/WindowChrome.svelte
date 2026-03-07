<script lang="ts">
  import { getCurrentWindow } from "@tauri-apps/api/window";

  let {
    title = "Untask",
    onProjectClick,
  }: {
    title?: string;
    onProjectClick?: () => void;
  } = $props();

  function onmousedown(e: MouseEvent) {
    if (e.buttons === 1) {
      e.detail === 2
        ? getCurrentWindow().toggleMaximize()
        : getCurrentWindow().startDragging();
    }
  }
</script>

<header
  data-tauri-drag-region
  role="toolbar"
  tabindex="-1"
  onmousedown={onmousedown}
  class="flex h-10 shrink-0 select-none items-center justify-between border-b border-border/60 bg-background/90 px-3 backdrop-blur"
>
  <div aria-hidden="true" class="pointer-events-none w-[72px] shrink-0"></div>

  {#if onProjectClick}
    <button
      type="button"
      onclick={(e) => { e.stopPropagation(); onProjectClick?.(); }}
      class="pointer-events-auto flex items-center gap-1 rounded-[4px] px-2 py-0.5 transition-colors duration-[120ms] hover:bg-accent/60"
    >
      <span class="font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
        {title}
      </span>
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground/60">
        <polyline points="3,4 5,6 7,4" />
      </svg>
    </button>
  {:else}
    <div class="pointer-events-none font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
      {title}
    </div>
  {/if}

  <div aria-hidden="true" class="pointer-events-none w-[72px] shrink-0"></div>
</header>
