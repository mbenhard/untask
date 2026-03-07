<script lang="ts">
  let { title = "Untask" }: { title?: string } = $props();
</script>

<header
  data-tauri-drag-region
  class="flex h-8 shrink-0 select-none items-center justify-between border-b border-border/80 bg-background/90 px-3 backdrop-blur"
>
  <div aria-hidden="true" class="pointer-events-none w-[72px] shrink-0"></div>

  <div class="pointer-events-none font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
    {title}
  </div>

  <div aria-hidden="true" class="pointer-events-none w-[72px] shrink-0"></div>
</header>
