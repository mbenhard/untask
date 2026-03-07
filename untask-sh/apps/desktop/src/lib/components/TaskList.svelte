<script lang="ts">
  import { addTask, updateTask, type ColumnDto, type Priority, type TaskDto } from "$lib/api";
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

  type SortKey = "title" | "status" | "priority" | "updated" | "position";
  type SortDir = "asc" | "desc";

  let sortKey = $state<SortKey>("position");
  let sortDir = $state<SortDir>("asc");
  let filterText = $state("");
  let filterStatus = $state("");
  let quickAddTitle = $state("");
  let quickAddError = $state<string | null>(null);
  let errorRowId = $state<number | null>(null);
  let focusedTaskId = $state<number | null>(null);
  let statusPopoverTaskId = $state<number | null>(null);
  let popoverIndex = $state(0);

  const priorityCycle: (Priority | null)[] = [null, "low", "medium", "high", "urgent"];

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

  // ── Inline priority cycling ────────────────────────────────────
  async function cyclePriority(e: MouseEvent, task: TaskDto) {
    e.stopPropagation();
    if (task.id == null) return;
    const current = task.priority ?? null;
    const idx = priorityCycle.indexOf(current);
    const next = priorityCycle[(idx + 1) % priorityCycle.length];
    try {
      await updateTask(task.id, { priority: next });
      onTasksChanged();
    } catch {
      errorRowId = task.id;
      setTimeout(() => { errorRowId = null; }, 800);
    }
  }

  // ── Inline status change ───────────────────────────────────────
  async function changeStatus(e: Event, task: TaskDto) {
    e.stopPropagation();
    if (task.id == null) return;
    const newStatus = (e.target as HTMLSelectElement).value;
    if (newStatus === task.status) return;
    try {
      await updateTask(task.id, { status: newStatus });
      onTasksChanged();
    } catch {
      errorRowId = task.id;
      setTimeout(() => { errorRowId = null; }, 800);
    }
  }

  async function changeStatusTo(task: TaskDto, newStatus: string) {
    if (task.id == null) return;
    if (newStatus === task.status) return;
    try {
      await updateTask(task.id, { status: newStatus });
      onTasksChanged();
    } catch {
      errorRowId = task.id;
      setTimeout(() => { errorRowId = null; }, 800);
    }
  }

  function openStatusPopover(e: MouseEvent, taskId: number | null) {
    e.stopPropagation();
    if (taskId == null) return;
    if (statusPopoverTaskId === taskId) {
      statusPopoverTaskId = null;
      return;
    }
    statusPopoverTaskId = taskId;
    // Find the current status index for keyboard navigation
    const task = tasks.find((t) => t.id === taskId);
    if (task) {
      const idx = columns.findIndex((c) => c.id === task.status);
      popoverIndex = idx >= 0 ? idx : 0;
    }
    // Close on outside click
    setTimeout(() => {
      const handler = () => {
        statusPopoverTaskId = null;
        window.removeEventListener("click", handler);
      };
      window.addEventListener("click", handler);
    }, 0);
  }

  function handlePopoverKeydown(e: KeyboardEvent) {
    if (statusPopoverTaskId == null) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      popoverIndex = Math.min(popoverIndex + 1, columns.length - 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      popoverIndex = Math.max(popoverIndex - 1, 0);
    } else if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      const task = tasks.find((t) => t.id === statusPopoverTaskId);
      if (task && columns[popoverIndex]) {
        changeStatusTo(task, columns[popoverIndex].id);
      }
      statusPopoverTaskId = null;
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      statusPopoverTaskId = null;
    }
  }

  // ── Quick-add ────────────────────────────────────────────────────
  async function submitQuickAdd() {
    const title = quickAddTitle.trim();
    if (!title) return;
    try {
      await addTask(title, defaultStatus);
      quickAddTitle = "";
      quickAddError = null;
      onTasksChanged();
    } catch {
      quickAddError = "Failed to create task";
      setTimeout(() => { quickAddError = null; }, 3000);
    }
  }

  function handleQuickAddKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      submitQuickAdd();
    }
  }

  const colHeaders: { key: SortKey | null; label: string; width: string }[] = [
    { key: null, label: "", width: "w-[24px]" },
    { key: "title", label: "Title", width: "flex-1 min-w-0" },
    { key: null, label: "Tags", width: "w-[160px]" },
    { key: "status", label: "Status", width: "w-[100px]" },
    { key: "updated", label: "Updated", width: "w-[72px]" },
  ];
</script>

<div class="flex min-h-0 flex-1 flex-col">
  <!-- Filter bar -->
  <div class="flex items-center gap-2 border-b border-border/60 px-3 py-1.5">
    <input
      type="text"
      placeholder="Filter..."
      bind:value={filterText}
      class="h-7 w-[180px] rounded-[4px] border border-transparent bg-transparent px-2 font-mono text-[11px] text-foreground placeholder:text-muted-foreground/50 transition-colors duration-[120ms] focus:border-border focus:bg-card focus:outline-none"
    />
    <select
      bind:value={filterStatus}
      class="h-7 rounded-[4px] border border-transparent bg-transparent px-2 font-mono text-[10px] text-muted-foreground transition-colors duration-[120ms] focus:border-border focus:bg-card focus:outline-none"
    >
      <option value="">All statuses</option>
      {#each statuses as status}
        <option value={status}>{status}</option>
      {/each}
    </select>
    <span class="ml-auto font-mono text-[10px] text-muted-foreground/60">
      {filteredTasks.length}
    </span>
  </div>

  <!-- Header row -->
  <div class="flex items-center border-b border-border/60 px-3">
    {#each colHeaders as col}
      {#if col.key}
        <button
          type="button"
          class={`group ${col.width} shrink-0 py-1.5 text-left font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground transition-colors duration-[120ms] hover:text-foreground`}
          onclick={() => toggleSort(col.key!)}
        >
          {col.label}
          {#if sortKey === col.key}
            <span class="text-muted-foreground">{sortDir === "asc" ? "↑" : "↓"}</span>
          {:else}
            <span class="text-muted-foreground/0 transition-colors duration-[120ms] group-hover:text-muted-foreground/40">↑</span>
          {/if}
        </button>
      {:else}
        <span class={`${col.width} shrink-0 py-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground`}>
          {col.label}
        </span>
      {/if}
    {/each}
  </div>

  <!-- Rows -->
  <div class="list-scroll flex-1 overflow-y-auto">
    {#each filteredTasks as task}
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
      <div
        class={`flex h-10 w-full items-center border-b border-border/40 border-l-2 px-3 transition-colors duration-[120ms] hover:bg-accent/50 ${
          focusedTaskId === task.id ? "border-l-ring" : "border-l-transparent"
        } ${errorRowId === task.id ? "error-row-flash" : ""}`}
        onclick={() => { focusedTaskId = task.id; onTaskClick(task); }}
        role="button"
        tabindex="0"
      >
        <!-- Priority dot (clickable) -->
        <span class="flex w-[24px] shrink-0 justify-center">
          <button
            type="button"
            class="priority-cycle rounded-full p-1 transition-colors duration-[120ms] hover:bg-accent"
            onclick={(e) => cyclePriority(e, task)}
            title="Click to cycle priority"
          >
            <PriorityDot tone={priorityTone(task.priority)} />
          </button>
        </span>

        <!-- Title -->
        <span class="min-w-0 flex-1 truncate text-[13px] text-foreground" title={task.title}>
          {task.title}
        </span>

        <!-- Tags -->
        <span class="flex w-[160px] shrink-0 items-center gap-0 overflow-hidden font-mono text-[10px] text-muted-foreground/60">
          {#each task.tags.slice(0, 3) as tag, i}
            {#if i > 0}<span class="mx-0.5 text-muted-foreground/30">·</span>{/if}
            <span class="truncate">{tag}</span>
          {/each}
          {#if task.tags.length > 3}
            <span class="ml-0.5 text-muted-foreground/40">+{task.tags.length - 3}</span>
          {/if}
        </span>

        <!-- Status -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <span class="relative w-[100px] shrink-0">
          {#if task.id == null}
            <select
              class="h-[20px] w-full cursor-pointer rounded-[4px] border border-border/60 bg-transparent px-1 font-mono text-[10px] text-muted-foreground transition-colors duration-[120ms] hover:border-border focus:border-ring focus:outline-none"
              value={task.status}
              disabled
              onchange={(e) => changeStatus(e, task)}
            >
              {#each columns as col}
                <option value={col.id}>{col.id}</option>
              {/each}
              {#if !columns.some((c) => c.id === task.status)}
                <option value={task.status}>{task.status}</option>
              {/if}
            </select>
          {:else}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <span
              class="inline-block cursor-pointer rounded-[4px] border border-border/60 px-1.5 font-mono text-[10px] text-muted-foreground transition-colors duration-[120ms] hover:border-border"
              onclick={(e) => openStatusPopover(e, task.id)}
              onkeydown={handlePopoverKeydown}
              role="button"
              tabindex="-1"
            >
              {task.status}
            </span>
            {#if statusPopoverTaskId === task.id}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="absolute left-0 top-full z-10 mt-1 w-[180px] rounded-[6px] border border-border/60 bg-popover shadow-lg backdrop-blur"
                onclick={(e) => e.stopPropagation()}
                onkeydown={handlePopoverKeydown}
                role="listbox"
                tabindex="-1"
              >
                {#each columns as col, i}
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <div
                    class={`cursor-pointer px-3 py-1.5 text-[12px] transition-colors duration-[120ms] hover:bg-accent/50 ${
                      col.id === task.status ? "bg-accent" : ""
                    } ${col.done ? "text-muted-foreground" : "text-foreground"} ${
                      popoverIndex === i ? "bg-accent/50" : ""
                    }`}
                    onclick={(e) => {
                      e.stopPropagation();
                      changeStatusTo(task, col.id);
                      statusPopoverTaskId = null;
                    }}
                    role="option"
                    aria-selected={col.id === task.status}
                  >
                    {col.id}
                  </div>
                {/each}
              </div>
            {/if}
          {/if}
        </span>

        <!-- Updated -->
        <span class="w-[72px] shrink-0 text-right font-mono text-[10px] text-muted-foreground/60">
          {relativeDate(task.updated)}
        </span>
      </div>
    {/each}

    {#if filteredTasks.length === 0}
      <div class="flex items-center justify-center py-8">
        <span class="font-mono text-[11px] text-muted-foreground/50">No tasks</span>
      </div>
    {/if}

    <!-- Permanent quick-add row -->
    <div class="flex h-10 items-center border-b border-border/40 px-3">
      <span class="w-[24px] shrink-0"></span>
      <input
        type="text"
        bind:value={quickAddTitle}
        onkeydown={handleQuickAddKeydown}
        placeholder="Add task..."
        class="min-w-0 flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground/40 outline-none"
      />
      {#if quickAddError}
        <span class="font-mono text-[10px] text-red-400">{quickAddError}</span>
      {/if}
    </div>
  </div>
</div>

<style>
  .list-scroll {
    scrollbar-width: thin;
    scrollbar-color: rgb(42 42 42 / 0.4) transparent;
  }

  .list-scroll::-webkit-scrollbar {
    width: 6px;
  }

  .list-scroll::-webkit-scrollbar-track {
    background: transparent;
  }

  .list-scroll::-webkit-scrollbar-thumb {
    background: rgb(42 42 42 / 0.4);
    border-radius: 3px;
  }

  .priority-cycle {
    line-height: 0;
  }

  .error-row-flash {
    animation: row-flash 800ms ease-out;
  }

  @keyframes row-flash {
    0%, 100% { border-color: rgb(42 42 42 / 0.4); }
    30% { border-color: var(--color-destructive); }
  }
</style>
