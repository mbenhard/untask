<script lang="ts">
  import { addTask, type ColumnDto, type TaskDto } from "$lib/api";
  import PriorityDot from "$lib/components/PriorityDot.svelte";

  let {
    tasks,
    columns,
    onTaskClick,
    onTasksChanged,
  }: {
    tasks: TaskDto[];
    columns: ColumnDto[];
    onTaskClick: (task: TaskDto) => void;
    onTasksChanged: () => void;
  } = $props();

  type SortKey = "id" | "title" | "status" | "priority" | "updated" | "position";
  type SortDir = "asc" | "desc";

  let sortKey = $state<SortKey>("position");
  let sortDir = $state<SortDir>("asc");
  let filterText = $state("");
  let filterStatus = $state("");

  // ── Quick-add state ──────────────────────────────────────────────
  let showQuickAdd = $state(false);
  let quickAddTitle = $state("");

  let defaultStatus = $derived(columns.length > 0 ? columns[0].id : "backlog");
  let statuses = $derived([...new Set(tasks.map((t) => t.status))].sort());

  let filteredTasks = $derived.by(() => {
    let result = tasks;

    if (filterText) {
      const q = filterText.toLowerCase();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.toLowerCase().includes(q)),
      );
    }

    if (filterStatus) {
      result = result.filter((t) => t.status === filterStatus);
    }

    result = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "position": {
          const ap = a.position ?? Infinity;
          const bp = b.position ?? Infinity;
          cmp = ap - bp;
          if (cmp === 0) cmp = (a.id ?? 0) - (b.id ?? 0);
          break;
        }
        case "id":
          cmp = (a.id ?? 0) - (b.id ?? 0);
          break;
        case "title":
          cmp = a.title.localeCompare(b.title);
          break;
        case "status":
          cmp = a.status.localeCompare(b.status);
          break;
        case "priority": {
          const order = { urgent: 0, high: 1, medium: 2, low: 3 };
          const ap = a.priority ? order[a.priority] ?? 4 : 4;
          const bp = b.priority ? order[b.priority] ?? 4 : 4;
          cmp = ap - bp;
          break;
        }
        case "updated":
          cmp = (a.updated ?? "").localeCompare(b.updated ?? "");
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  });

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      sortDir = sortDir === "asc" ? "desc" : "asc";
    } else {
      sortKey = key;
      sortDir = "asc";
    }
  }

  function sortIndicator(key: SortKey): string {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " \u2191" : " \u2193";
  }

  function priorityTone(p: string | null): "low" | "medium" | "high" | "neutral" {
    if (p === "high" || p === "urgent") return "high";
    if (p === "medium") return "medium";
    if (p === "low") return "low";
    return "neutral";
  }

  function relativeDate(iso: string | null): string {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return "now";
      if (diffMins < 60) return `${diffMins}m`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays < 30) return `${diffDays}d`;
      const diffMonths = Math.floor(diffDays / 30);
      return `${diffMonths}mo`;
    } catch {
      return "";
    }
  }

  // ── Quick-add ────────────────────────────────────────────────────
  async function submitQuickAdd() {
    const title = quickAddTitle.trim();
    if (!title) return;
    try {
      await addTask(title, defaultStatus);
      quickAddTitle = "";
      onTasksChanged();
    } catch (e) {
      console.error("Failed to add task:", e);
    }
  }

  function handleQuickAddKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      submitQuickAdd();
    } else if (e.key === "Escape") {
      showQuickAdd = false;
      quickAddTitle = "";
    }
  }

  const colHeaders: { key: SortKey; label: string; width: string }[] = [
    { key: "id", label: "#", width: "w-[48px]" },
    { key: "title", label: "Title", width: "flex-1" },
    { key: "status", label: "Status", width: "w-[100px]" },
    { key: "priority", label: "Pri", width: "w-[48px]" },
    { key: "updated", label: "Updated", width: "w-[80px]" },
  ];
</script>

<div class="flex min-h-0 flex-1 flex-col">
  <!-- Filter bar -->
  <div class="flex items-center gap-2 border-b border-border/80 px-3 py-1.5">
    <input
      type="text"
      placeholder="Filter..."
      bind:value={filterText}
      class="h-7 w-[180px] rounded-[4px] border border-border bg-card px-2 font-mono text-[11px] text-foreground placeholder:text-muted-foreground/50 focus:border-ring focus:outline-none"
    />
    <select
      bind:value={filterStatus}
      class="h-7 rounded-[4px] border border-border bg-card px-2 font-mono text-[11px] text-foreground focus:border-ring focus:outline-none"
    >
      <option value="">All statuses</option>
      {#each statuses as status}
        <option value={status}>{status}</option>
      {/each}
    </select>
    <span class="ml-auto font-mono text-[10px] text-muted-foreground">
      {filteredTasks.length} task{filteredTasks.length === 1 ? "" : "s"}
    </span>
  </div>

  <!-- Header row -->
  <div class="flex items-center border-b border-border/80 bg-card/50 px-3">
    {#each colHeaders as col}
      <button
        type="button"
        class={`${col.width} shrink-0 py-1.5 text-left font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground hover:text-foreground`}
        onclick={() => toggleSort(col.key)}
      >
        {col.label}{sortIndicator(col.key)}
      </button>
    {/each}
  </div>

  <!-- Rows -->
  <div class="flex-1 overflow-y-auto">
    {#each filteredTasks as task}
      <button
        type="button"
        class="flex min-h-[40px] w-full items-center border-b border-border/40 px-3 text-left transition-colors hover:bg-accent/60"
        onclick={() => onTaskClick(task)}
      >
        <span class="w-[48px] shrink-0 font-mono text-[11px] text-muted-foreground">
          {task.id ?? "\u2014"}
        </span>
        <span class="flex min-w-0 flex-1 items-center gap-1.5">
          <PriorityDot tone={priorityTone(task.priority)} />
          <span class="min-w-0 flex-1 truncate text-[13px] text-foreground">
            {task.title}
          </span>
          {#each task.tags.slice(0, 2) as tag}
            <span class="flex h-[18px] shrink-0 items-center rounded-[3px] border border-border/60 px-1 font-mono text-[9px] text-muted-foreground">
              {tag}
            </span>
          {/each}
          {#if task.tags.length > 2}
            <span class="shrink-0 font-mono text-[9px] text-muted-foreground/50">
              +{task.tags.length - 2}
            </span>
          {/if}
          {#if task.subtask_total > 0}
            <span class="shrink-0 font-mono text-[9px] text-muted-foreground/60">
              {task.subtask_done}/{task.subtask_total}
            </span>
          {/if}
        </span>
        {#if task.id == null}
          <span class="mr-2 rounded-[4px] border border-border/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            unindexed
          </span>
        {/if}
        <span class="w-[100px] shrink-0 font-mono text-[10px] text-muted-foreground">
          {task.status}
        </span>
        <span class="flex w-[48px] shrink-0 justify-center">
          <PriorityDot tone={priorityTone(task.priority)} />
        </span>
        <span class="w-[80px] shrink-0 text-right font-mono text-[10px] text-muted-foreground">
          {relativeDate(task.updated)}
        </span>
      </button>
    {/each}

    {#if filteredTasks.length === 0}
      <div class="flex items-center justify-center py-8">
        <span class="font-mono text-[11px] text-muted-foreground/50">No tasks</span>
      </div>
    {/if}

    <!-- Quick-add row -->
    {#if showQuickAdd}
      <div class="flex min-h-[40px] items-center border-b border-border/40 px-3">
        <span class="w-[48px] shrink-0"></span>
        <input
          type="text"
          bind:value={quickAddTitle}
          onkeydown={handleQuickAddKeydown}
          onblur={() => { if (!quickAddTitle.trim()) showQuickAdd = false; }}
          placeholder={`Add task to ${defaultStatus}...`}
          class="min-w-0 flex-1 border-none bg-transparent py-1 text-[13px] text-foreground placeholder:text-muted-foreground/40 outline-none"
          autofocus
        />
      </div>
    {:else}
      <button
        type="button"
        class="flex min-h-[36px] w-full items-center px-3 text-left font-mono text-[10px] text-muted-foreground/40 transition-colors hover:text-muted-foreground"
        onclick={() => { showQuickAdd = true; }}
      >
        <span class="w-[48px] shrink-0"></span>
        + Add task
      </button>
    {/if}
  </div>
</div>
