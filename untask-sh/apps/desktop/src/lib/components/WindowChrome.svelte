<script lang="ts">
  let { title = "Untask" }: { title?: string } = $props();
</script>

<header
  data-tauri-drag-region
  class="flex h-8 shrink-0 items-center justify-between border-b border-border/80 bg-background/90 px-3 backdrop-blur"
>
  <div class="flex items-center gap-2">
    <span class="h-2.5 w-2.5 rounded-full border border-black/20 bg-[#ff5f57]"></span>
    <span class="h-2.5 w-2.5 rounded-full border border-black/20 bg-[#febc2e]"></span>
    <span class="h-2.5 w-2.5 rounded-full border border-black/20 bg-[#28c840]"></span>
  </div>

  <div class="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
    {title}
  </div>

  <div class="w-[52px]"></div>
</header>
