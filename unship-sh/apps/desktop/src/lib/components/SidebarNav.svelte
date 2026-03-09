<script lang="ts">
  import type { ShellView } from "$lib/stores";

  type NavItem = {
    id: ShellView;
    label: string;
    shortcut: string;
    icon: string;
  };

  const items: NavItem[] = [
    { id: "board", label: "Board", shortcut: "1", icon: "board" },
    { id: "list", label: "List", shortcut: "2", icon: "list" },
    { id: "docs", label: "Docs", shortcut: "3", icon: "docs" },
    { id: "review", label: "Review", shortcut: "4", icon: "review" },
  ];

  let {
    activeView,
    reviewCount = 0,
    onSelect,
  }: {
    activeView: ShellView;
    reviewCount?: number;
    onSelect: (view: ShellView) => void;
  } = $props();
</script>

<aside role="navigation" class="flex w-[52px] shrink-0 flex-col items-center border-r border-border/60 bg-card/70 py-2 gap-1">
  {#each items as item}
    <button
      type="button"
      onclick={() => onSelect(item.id)}
      class={`relative flex h-8 w-8 items-center justify-center rounded-[6px] transition-colors duration-[120ms] ease-out ${
        activeView === item.id
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-accent/40 hover:text-foreground"
      }`}
      aria-current={activeView === item.id ? "page" : undefined}
      title={item.label}
    >
      {#if item.icon === "board"}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="1.5" y="2" width="4" height="12" rx="1" />
          <rect x="6.5" y="2" width="4" height="8" rx="1" />
          <rect x="11.5" y="2" width="4" height="10" rx="1" />
        </svg>
      {:else if item.icon === "list"}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <line x1="4" y1="4" x2="14" y2="4" />
          <line x1="4" y1="8" x2="14" y2="8" />
          <line x1="4" y1="12" x2="14" y2="12" />
          <circle cx="2" cy="4" r="0.75" fill="currentColor" stroke="none" />
          <circle cx="2" cy="8" r="0.75" fill="currentColor" stroke="none" />
          <circle cx="2" cy="12" r="0.75" fill="currentColor" stroke="none" />
        </svg>
      {:else if item.icon === "docs"}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 1.5H3.5a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V6L9 1.5Z" />
          <polyline points="9,1.5 9,6 13.5,6" />
        </svg>
      {:else if item.icon === "review"}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M1.5 8a6.5 6.5 0 1 1 13 0 6.5 6.5 0 0 1-13 0Z" />
          <path d="M5.5 8.5 7 10l3.5-4" />
        </svg>
      {/if}

      {#if item.id === "review" && reviewCount > 0}
        <span class="absolute -right-1 -top-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-foreground/80 px-[3px] font-mono text-[8px] leading-none text-background">
          {reviewCount}
        </span>
      {:else}
        <span class="absolute -right-0.5 top-0 font-mono text-[10px] leading-none text-muted-foreground/60">
          {item.shortcut}
        </span>
      {/if}
    </button>
  {/each}
</aside>
