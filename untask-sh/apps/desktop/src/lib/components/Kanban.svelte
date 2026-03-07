<script lang="ts">
  import { addTask, updateTask, type ColumnDto, type TaskDto } from "$lib/api";
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

  type KanbanColumn = {
    id: string;
    label: string;
    tasks: TaskDto[];
  };

  // ── Quick-add state ──────────────────────────────────────────────
  let addingInColumn = $state<string | null>(null);
  let quickAddTitle = $state("");

  // ── Drag state ───────────────────────────────────────────────────
  let draggedTask = $state<TaskDto | null>(null);
  let dropTarget = $state<{ columnId: string; index: number } | null>(null);

  // ── Column derivation with position sort ─────────────────────────
  let kanbanColumns = $derived.by(() => {
    const cols: KanbanColumn[] = columns.map((col) => ({
      id: col.id,
      label: col.id,
      tasks: [],
    }));

    const colIds = new Set(columns.map((c) => c.id));
    const aliasMap = new Map<string, string>();
    for (const col of columns) {
      for (const alias of col.aliases) {
        aliasMap.set(alias.toLowerCase(), col.id);
      }
    }

    const unmatched: TaskDto[] = [];

    for (const task of tasks) {
      const status = task.status.toLowerCase();
      const targetId = colIds.has(status) ? status : aliasMap.get(status);
      if (targetId) {
        const col = cols.find((c) => c.id === targetId);
        col?.tasks.push(task);
      } else {
        unmatched.push(task);
      }
    }

    // Sort each column by position (nulls sorted by id at end)
    for (const col of cols) {
      col.tasks.sort((a, b) => {
        const ap = a.position ?? Infinity;
        const bp = b.position ?? Infinity;
        if (ap !== bp) return ap - bp;
        return (a.id ?? 0) - (b.id ?? 0);
      });
    }

    if (unmatched.length > 0) {
      cols.push({ id: "__unmatched", label: "unmatched", tasks: unmatched });
    }

    return cols;
  });

  // ── Quick-add ────────────────────────────────────────────────────
  function startQuickAdd(columnId: string) {
    addingInColumn = columnId;
    quickAddTitle = "";
  }

  async function submitQuickAdd(columnId: string) {
    const title = quickAddTitle.trim();
    if (!title) return;
    try {
      await addTask(title, columnId);
      quickAddTitle = "";
      onTasksChanged();
    } catch (e) {
      console.error("Failed to add task:", e);
    }
  }

  function handleQuickAddKeydown(e: KeyboardEvent, columnId: string) {
    if (e.key === "Enter") {
      e.preventDefault();
      submitQuickAdd(columnId);
    } else if (e.key === "Escape") {
      addingInColumn = null;
    }
  }

  // ── Drag-and-drop ────────────────────────────────────────────────
  function canDrag(task: TaskDto): boolean {
    return task.id != null;
  }

  function isUnmatchedColumn(colId: string): boolean {
    return colId === "__unmatched";
  }

  function handleDragStart(e: DragEvent, task: TaskDto) {
    if (!canDrag(task)) {
      e.preventDefault();
      return;
    }
    draggedTask = task;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(task.id));
    }
  }

  function handleDragEnd() {
    draggedTask = null;
    dropTarget = null;
  }

  function handleDragOver(e: DragEvent, columnId: string, index: number) {
    if (!draggedTask || isUnmatchedColumn(columnId)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    dropTarget = { columnId, index };
  }

  function handleColumnDragOver(e: DragEvent, columnId: string, taskCount: number) {
    if (!draggedTask || isUnmatchedColumn(columnId)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    dropTarget = { columnId, index: taskCount };
  }

  function handleDragLeave(e: DragEvent) {
    const related = e.relatedTarget as HTMLElement | null;
    if (!related || !e.currentTarget || !(e.currentTarget as HTMLElement).contains(related)) {
      dropTarget = null;
    }
  }

  async function handleDrop(e: DragEvent, columnId: string, index: number) {
    e.preventDefault();
    if (!draggedTask || isUnmatchedColumn(columnId) || draggedTask.id == null) {
      draggedTask = null;
      dropTarget = null;
      return;
    }

    const col = kanbanColumns.find((c) => c.id === columnId);
    if (!col) return;

    // Filter out the dragged task from the target column's task list
    const colTasks = col.tasks.filter((t) => t.id !== draggedTask!.id);

    // Check if this is a same-position no-op
    const sourceColId = resolveColumnId(draggedTask);
    if (sourceColId === columnId) {
      const currentIndex = col.tasks.findIndex((t) => t.id === draggedTask!.id);
      if (currentIndex === index || currentIndex === index - 1) {
        draggedTask = null;
        dropTarget = null;
        return;
      }
    }

    // Ensure all tasks in the target column have positions
    const positioned = ensurePositions(colTasks);

    // Calculate new position
    const newPosition = calculatePosition(positioned, index);

    // Build update
    const updates: Parameters<typeof updateTask>[1] = { position: newPosition };
    if (sourceColId !== columnId) {
      updates.status = columnId;
    }

    try {
      await updateTask(draggedTask.id, updates);
      onTasksChanged();
    } catch (err) {
      console.error("Failed to move task:", err);
    }

    draggedTask = null;
    dropTarget = null;
  }

  function resolveColumnId(task: TaskDto): string | undefined {
    const status = task.status.toLowerCase();
    const colIds = new Set(columns.map((c) => c.id));
    if (colIds.has(status)) return status;
    for (const col of columns) {
      for (const alias of col.aliases) {
        if (alias.toLowerCase() === status) return col.id;
      }
    }
    return "__unmatched";
  }

  function ensurePositions(tasks: TaskDto[]): TaskDto[] {
    const allHavePositions = tasks.every((t) => t.position != null);
    if (allHavePositions) return tasks;
    return tasks.map((t, i) => ({ ...t, position: t.position ?? i + 1 }));
  }

  function calculatePosition(sortedTasks: TaskDto[], dropIndex: number): number {
    if (sortedTasks.length === 0) return 1;
    if (dropIndex === 0) return (sortedTasks[0].position ?? 1) - 1;
    if (dropIndex >= sortedTasks.length) {
      return (sortedTasks[sortedTasks.length - 1].position ?? sortedTasks.length) + 1;
    }
    const before = sortedTasks[dropIndex - 1].position ?? dropIndex;
    const after = sortedTasks[dropIndex].position ?? dropIndex + 1;
    const mid = (before + after) / 2;
    // Rebalance check: if gap too small, use integer (will be corrected on next render)
    if (Math.abs(after - before) < 0.001) {
      return before + 0.5;
    }
    return mid;
  }

  // ── Display helpers ──────────────────────────────────────────────
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
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays < 30) return `${diffDays}d ago`;
      const diffMonths = Math.floor(diffDays / 30);
      return `${diffMonths}mo ago`;
    } catch {
      return "";
    }
  }
</script>

<div class="flex min-h-0 flex-1 gap-px overflow-x-auto bg-border/40 p-0">
  {#each kanbanColumns as col}
    <section class="flex min-w-[200px] flex-1 flex-col bg-background/80">
      <div class="flex items-center justify-between border-b border-border/80 px-3 py-2">
        <span class="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          {col.label}
        </span>
        <span class="rounded-full border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          {col.tasks.length}
        </span>
      </div>

      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="flex flex-1 flex-col gap-0 overflow-y-auto"
        ondragover={(e) => handleColumnDragOver(e, col.id, col.tasks.length)}
        ondragleave={handleDragLeave}
        ondrop={(e) => handleDrop(e, col.id, col.tasks.length)}
      >
        {#each col.tasks as task, i}
          <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
          <div
            class="group flex min-h-[40px] w-full cursor-pointer flex-col border-b border-border/40 px-3 py-1.5 text-left transition-colors hover:bg-accent/60"
            class:opacity-30={draggedTask?.id === task.id}
            class:border-t-2={dropTarget?.columnId === col.id && dropTarget?.index === i}
            class:border-t-ring={dropTarget?.columnId === col.id && dropTarget?.index === i}
            draggable={canDrag(task) && !isUnmatchedColumn(col.id)}
            ondragstart={(e) => handleDragStart(e, task)}
            ondragend={handleDragEnd}
            ondragover={(e) => handleDragOver(e, col.id, i)}
            ondrop={(e) => { e.stopPropagation(); handleDrop(e, col.id, i); }}
            onclick={() => onTaskClick(task)}
            role="button"
            tabindex="0"
          >
            <!-- Row 1: priority dot + title -->
            <div class="flex items-center gap-2">
              <PriorityDot tone={priorityTone(task.priority)} />
              <span class="min-w-0 flex-1 truncate text-[13px] text-foreground">
                {task.title}
              </span>
              {#if task.id == null}
                <span class="shrink-0 rounded-[4px] border border-border/60 px-1 py-0.5 font-mono text-[9px] text-muted-foreground">
                  unindexed
                </span>
              {/if}
            </div>
            <!-- Row 2: metadata (tags, subtasks, date) -->
            {#if task.tags.length > 0 || task.subtask_total > 0 || task.updated}
              <div class="mt-1 flex flex-wrap items-center gap-1.5">
                {#each task.tags.slice(0, 3) as tag}
                  <span class="flex h-[18px] items-center rounded-[3px] border border-border/60 px-1 font-mono text-[9px] text-muted-foreground">
                    {tag}
                  </span>
                {/each}
                {#if task.tags.length > 3}
                  <span class="font-mono text-[9px] text-muted-foreground/50">
                    +{task.tags.length - 3}
                  </span>
                {/if}
                {#if task.subtask_total > 0}
                  <span class="font-mono text-[9px] text-muted-foreground/60">
                    {task.subtask_done}/{task.subtask_total}
                  </span>
                {/if}
                {#if task.updated}
                  <span class="ml-auto font-mono text-[9px] text-muted-foreground/40">
                    {relativeDate(task.updated)}
                  </span>
                {/if}
              </div>
            {/if}
          </div>
        {/each}

        <!-- Empty column drop zone -->
        {#if col.tasks.length === 0}
          <div
            class="flex min-h-[80px] flex-1 items-center justify-center border border-dashed border-border/30 p-4"
            class:border-ring={dropTarget?.columnId === col.id}
          >
            <span class="font-mono text-[10px] text-muted-foreground/50">Empty</span>
          </div>
        {/if}

        <!-- Drop-at-end indicator -->
        {#if dropTarget?.columnId === col.id && dropTarget?.index === col.tasks.length && col.tasks.length > 0}
          <div class="h-0.5 bg-ring"></div>
        {/if}

        <!-- Quick-add -->
        {#if !isUnmatchedColumn(col.id)}
          {#if addingInColumn === col.id}
            <div class="border-t border-border/40 px-3 py-1.5">
              <input
                type="text"
                bind:value={quickAddTitle}
                onkeydown={(e) => handleQuickAddKeydown(e, col.id)}
                onblur={() => { if (!quickAddTitle.trim()) addingInColumn = null; }}
                placeholder="Task title..."
                class="w-full rounded-[4px] border border-dashed border-border bg-transparent px-2 py-1 font-mono text-[11px] text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-ring"
                autofocus
              />
            </div>
          {:else}
            <button
              type="button"
              class="w-full border-t border-border/40 px-3 py-1.5 text-left font-mono text-[10px] text-muted-foreground/40 transition-colors hover:text-muted-foreground"
              onclick={() => startQuickAdd(col.id)}
            >
              + Add task
            </button>
          {/if}
        {/if}
      </div>
    </section>
  {/each}
</div>
