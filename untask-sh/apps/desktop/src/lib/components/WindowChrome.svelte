<script lang="ts">
  import { getCurrentWindow } from "@tauri-apps/api/window";

  let { title = "Untask" }: { title?: string } = $props();

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
  class="flex h-8 shrink-0 select-none items-center justify-between border-b border-border/80 bg-background/90 px-3 backdrop-blur"
>
  <div aria-hidden="true" class="pointer-events-none w-[72px] shrink-0"></div>

  <div class="pointer-events-none font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
    {title}
  </div>

  <div aria-hidden="true" class="pointer-events-none w-[72px] shrink-0"></div>
</header>
