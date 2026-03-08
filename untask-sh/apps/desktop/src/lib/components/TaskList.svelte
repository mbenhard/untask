<script lang="ts">
  import { Select } from "bits-ui";
  import { addTask, updateTask, type ColumnDto, type TaskDto } from "$lib/api";
  import MetaSelect from "$lib/components/ui/MetaSelect.svelte";

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

  type SortKey = "title" | "status" | "updated" | "position";
  type SortDir = "asc" | "desc";

  let sortKey = $state<SortKey>("position");
  let sortDir = $state<SortDir>("asc");
  let filterText = $state("");
  let filterStatus = $state("");
  let quickAddTitle = $state("");
  let quickAddError = $state<string | null>(null);
  let errorRowId = $state<number | null>(null);
  let focusedTaskId = $state<number | null>(null);

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

  // ── Inline status change ───────────────────────────────────────
  async function handleStatusChange(task: TaskDto, newStatus: string) {
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
    <Select.Root type="single" bind:value={filterStatus} items={[{ value: "", label: "All statuses" }, ...statuses.map(s => ({ value: s, label: s }))]}>
      <Select.Trigger class="h-7 inline-flex items-center rounded-[4px] border border-transparent bg-transparent px-2 font-mono text-[10px] text-muted-foreground transition-colors duration-[120ms] focus:border-border focus:bg-card focus:outline-none">
        {filterStatus || "All statuses"}
      </Select.Trigger>
      <Select.Portal>
        <Select.Content class="z-50 rounded-[6px] border border-border/60 bg-popover shadow-lg backdrop-blur" sideOffset={4}>
          <Select.Viewport class="p-0.5">
            <Select.Item class="cursor-pointer rounded-[4px] px-2.5 py-1 font-mono text-[11px] text-muted-foreground outline-none transition-colors duration-75 data-[highlighted]:bg-accent/50" value="" label="All statuses">
              All statuses
            </Select.Item>
            {#each statuses as status}
              <Select.Item class="cursor-pointer rounded-[4px] px-2.5 py-1 font-mono text-[11px] text-foreground outline-none transition-colors duration-75 data-[highlighted]:bg-accent/50" value={status} label={status}>
                {status}
              </Select.Item>
            {/each}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
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
        <!-- Title -->
        <span class="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
          <span class="truncate text-[13px] text-foreground" title={task.title}>
            {task.title}
          </span>
          {#if task.attachments.length > 0}
            <span class="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground/45" aria-label={`${task.attachments.length} attachments`}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.75"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="shrink-0"
              >
                <path d="m21.44 11.05-8.49 8.49a5.5 5.5 0 0 1-7.78-7.78l8.84-8.84a3.5 3.5 0 1 1 4.95 4.95l-8.49 8.48a1.5 1.5 0 0 1-2.12-2.12l7.78-7.78" />
              </svg>
              <span>{task.attachments.length}</span>
            </span>
          {/if}
          {#if task.body?.trim()}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="shrink-0 text-muted-foreground/35"
              aria-label="Has notes"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
          {/if}
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
        <span class="w-[100px] shrink-0" onclick={(e) => e.stopPropagation()}>
          <MetaSelect
            value={task.status}
            items={[
              ...columns.map(col => ({ value: col.id, label: col.id })),
              ...(!columns.some(c => c.id === task.status) ? [{ value: task.status, label: task.status }] : []),
            ]}
            disabled={task.id == null}
            onValueChange={(v) => handleStatusChange(task, v)}
          />
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

  .error-row-flash {
    animation: row-flash 800ms ease-out;
  }

  @keyframes row-flash {
    0%, 100% { border-color: rgb(42 42 42 / 0.4); }
    30% { border-color: var(--color-destructive); }
  }
</style>
