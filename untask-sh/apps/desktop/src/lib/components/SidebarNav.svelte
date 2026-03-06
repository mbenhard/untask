<script lang="ts">
  import type { ShellView } from "$lib/stores";

  type NavItem = {
    id: ShellView;
    label: string;
    shortcut: string;
  };

  const items: NavItem[] = [
    { id: "board", label: "Board", shortcut: "1" },
    { id: "list", label: "List", shortcut: "2" },
    { id: "docs", label: "Docs", shortcut: "3" },
    { id: "next", label: "Next", shortcut: "4" },
  ];

  let {
    activeView,
    projectName,
    onSelect,
    onSwitchProject,
  }: {
    activeView: ShellView;
    projectName: string | null;
    onSelect: (view: ShellView) => void;
    onSwitchProject: () => void;
  } = $props();
</script>

<aside class="flex w-[200px] shrink-0 flex-col border-r border-border/80 bg-card/70">
  <div class="border-b border-border/80 px-3 py-3">
    <button
      type="button"
      class="group flex w-full items-center justify-between text-left"
      onclick={onSwitchProject}
    >
      <div class="min-w-0">
        <p
          class="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground"
        >
          Project
        </p>
        <p class="mt-0.5 truncate text-[13px] font-medium text-foreground">
          {projectName ?? "No project"}
        </p>
      </div>
      <span
        class="text-[11px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
      >
        Switch
      </span>
    </button>
  </div>

  <nav class="flex flex-1 flex-col gap-0.5 p-1.5">
    {#each items as item}
      <button
        type="button"
        onclick={() => onSelect(item.id)}
        class={`flex items-center justify-between rounded-[4px] px-2.5 py-1.5 text-left transition-colors ${
          activeView === item.id
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
        }`}
      >
        <span class="text-[13px]">{item.label}</span>
        <span class="font-mono text-[10px] text-muted-foreground">
          {item.shortcut}
        </span>
      </button>
    {/each}
  </nav>
</aside>
