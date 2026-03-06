<script lang="ts">
  import { theme } from "$lib/stores";
  import { invoke } from "@tauri-apps/api/core";

  let greeting = $state("");

  async function greet() {
    greeting = await invoke("greet", { name: "Untask" });
  }

  // Default to dark
  $effect(() => {
    document.documentElement.classList.toggle("dark", $theme === "dark");
  });
</script>

<div class="flex h-screen flex-col">
  <!-- Title bar drag region (32px, overlay style) -->
  <header
    data-tauri-drag-region
    class="flex h-8 shrink-0 items-center justify-center border-b border-border/60"
  >
    <span class="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
      Untask
    </span>
  </header>

  <!-- Main content area -->
  <main class="flex flex-1 items-center justify-center">
    <div class="text-center">
      <p class="font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
        Desktop scaffold ready
      </p>
      <button
        onclick={greet}
        class="mt-3 rounded-[var(--radius-control)] border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:border-foreground/40"
      >
        Greet from Rust
      </button>
      {#if greeting}
        <p class="mt-2 font-mono text-xs text-muted-foreground">{greeting}</p>
      {/if}
    </div>
  </main>
</div>
