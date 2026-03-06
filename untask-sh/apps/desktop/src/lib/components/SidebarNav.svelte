<script lang="ts">
  import type { ShellView } from "$lib/stores";

  import PriorityDot from "$lib/components/PriorityDot.svelte";

  type NavItem = {
    id: ShellView;
    label: string;
    note: string;
    tone: "low" | "medium" | "high" | "neutral";
  };

  const items: NavItem[] = [
    { id: "board", label: "Board", note: "Kanban lanes first", tone: "high" },
    { id: "list", label: "List", note: "Dense keyboard view", tone: "medium" },
    { id: "docs", label: "Docs", note: "Repo-scoped notes", tone: "low" },
    { id: "next", label: "Next", note: "Daily synthesis", tone: "neutral" },
  ];

  let {
    activeView,
    onSelect,
  }: {
    activeView: ShellView;
    onSelect: (view: ShellView) => void;
  } = $props();
</script>

<aside class="flex w-[250px] shrink-0 flex-col border-r border-border/80 bg-card/70">
  <div class="border-b border-border/80 px-3 py-3">
    <p class="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
      Shell
    </p>
    <h1 class="mt-1 text-[14px] font-medium text-foreground">Desktop workspace</h1>
    <p class="mt-1 text-[12px] leading-[1.45] text-muted-foreground">
      Monochrome-first foundation with compact chrome and task-sized surfaces.
    </p>
  </div>

  <nav class="flex flex-1 flex-col gap-1 p-2">
    {#each items as item}
      <button
        type="button"
        onclick={() => onSelect(item.id)}
        class={`flex items-center justify-between rounded-[6px] border px-2.5 py-2 text-left transition-colors ${
          activeView === item.id
            ? "border-foreground/30 bg-accent text-foreground"
            : "border-transparent text-muted-foreground hover:border-border hover:bg-accent/60 hover:text-foreground"
        }`}
      >
        <span>
          <span class="block text-[13px] font-medium">{item.label}</span>
          <span class="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.06em]">
            {item.note}
          </span>
        </span>
        <PriorityDot tone={item.tone} />
      </button>
    {/each}
  </nav>

  <div class="border-t border-border/80 px-3 py-3">
    <div class="flex items-center justify-between">
      <span class="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
        Status
      </span>
      <span class="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
        Preview
      </span>
    </div>
    <p class="mt-2 text-[12px] leading-[1.45] text-muted-foreground">
      View plumbing is ready for real project lifecycle and editing work.
    </p>
  </div>
</aside>
