<script lang="ts">
  import { addTask, updateTask, type ColumnDto, type TaskDto } from "$lib/api";
  import PriorityDot from "$lib/components/PriorityDot.svelte";
  import { resolveStatus } from "$lib/utils";

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
    done: boolean;
    tasks: TaskDto[];
  };

  // ── Quick-add state ──────────────────────────────────────────────
  let addingInColumn = $state<string | null>(null);
  let quickAddTitle = $state("");
  let quickAddError = $state<string | null>(null);
  let quickAddErrorFlash = $state(false);

  // ── Drag state ───────────────────────────────────────────────────
  let draggedTask = $state<TaskDto | null>(null);
  let dropTarget = $state<{ columnId: string; index: number } | null>(null);
  let isDragging = $state(false);
  let justDroppedId = $state<number | null>(null);

  // ── Column derivation with position sort ─────────────────────────
  let kanbanColumns = $derived.by(() => {
    const cols: KanbanColumn[] = columns.map((col) => ({
      id: col.id,
      label: col.id,
      done: col.done ?? false,
      tasks: [],
    }));

    const unmatched: TaskDto[] = [];

    for (const task of tasks) {
      const targetId = resolveStatus(columns, task.status);
      if (targetId) {
        const col = cols.find((c) => c.id === targetId);
        col?.tasks.push(task);
      } else {
        unmatched.push(task);
      }
    }

    for (const col of cols) {
      col.tasks.sort((a, b) => {
        const ap = a.position ?? Infinity;
        const bp = b.position ?? Infinity;
        if (ap !== bp) return ap - bp;
        return (a.id ?? 0) - (b.id ?? 0);
      });
    }

    if (unmatched.length > 0) {
      cols.push({ id: "__unmatched", label: "unmatched", done: false, tasks: unmatched });
    }

    return cols;
  });

  // ── Quick-add ────────────────────────────────────────────────────
  function startQuickAdd(columnId: string) {
    addingInColumn = columnId;
    quickAddTitle = "";
    quickAddError = null;
    quickAddErrorFlash = false;
  }

  async function submitQuickAdd(columnId: string) {
    const title = quickAddTitle.trim();
    if (!title) return;
    try {
      await addTask(title, columnId);
      quickAddTitle = "";
      quickAddError = null;
      addingInColumn = null;
      onTasksChanged();
    } catch {
      quickAddError = "Failed to create task";
      quickAddErrorFlash = true;
      setTimeout(() => { quickAddErrorFlash = false; }, 800);
      setTimeout(() => { quickAddError = null; }, 3000);
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
    isDragging = true;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(task.id));
    }
  }

  function handleDragEnd() {
    draggedTask = null;
    dropTarget = null;
    isDragging = false;
  }

  function handleDragOver(e: DragEvent, columnId: string, index: number) {
    if (!draggedTask || isUnmatchedColumn(columnId)) return;
    e.preventDefault();
    e.stopPropagation();
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
      isDragging = false;
      return;
    }

    const task = draggedTask;
    draggedTask = null;
    dropTarget = null;
    isDragging = false;

    const sourceColId = resolveColumnId(task);
    const col = kanbanColumns.find((c) => c.id === columnId);
    const sourceCol = kanbanColumns.find((c) => c.id === sourceColId);
    if (!col || !sourceCol) return;

    let adjustedIndex = index;
    if (sourceColId === columnId) {
      const sourceIndex = col.tasks.findIndex((t) => t.id === task.id);
      if (sourceIndex !== -1 && sourceIndex < index) {
        adjustedIndex = index - 1;
      }
    }

    const targetTasks = col.tasks.filter((t) => t.id !== task.id);
    const nextTargetOrder = insertTaskAtIndex(targetTasks, task, adjustedIndex);

    if (sourceColId === columnId) {
      const currentManagedIds = col.tasks
        .filter((t) => t.id != null)
        .map((t) => t.id);
      const nextManagedIds = nextTargetOrder
        .filter((t) => t.id != null)
        .map((t) => t.id);

      if (JSON.stringify(currentManagedIds) === JSON.stringify(nextManagedIds)) {
        return;
      }
    }

    try {
      if (sourceColId !== columnId) {
        await persistColumnOrder(
          sourceCol.tasks.filter((t) => t.id !== task.id),
        );
      }
      await persistColumnOrder(nextTargetOrder, columnId, task.id ?? undefined);
      justDroppedId = task.id ?? null;
      setTimeout(() => { justDroppedId = null; }, 80);
      onTasksChanged();
    } catch (err) {
      console.error("Failed to move task:", err);
    }
  }

  function resolveColumnId(task: TaskDto): string {
    return resolveStatus(columns, task.status) ?? "__unmatched";
  }

  async function persistColumnOrder(
    orderedTasks: TaskDto[],
    movedStatus?: string,
    movedTaskId?: number,
  ) {
    const managedTasks = orderedTasks.filter(
      (task): task is TaskDto & { id: number } => task.id != null,
    );

    const promises: Promise<unknown>[] = [];
    for (const [index, task] of managedTasks.entries()) {
      const nextPosition = index + 1;
      const updates: Parameters<typeof updateTask>[1] = {};
      if (task.position !== nextPosition) {
        updates.position = nextPosition;
      }
      if (movedStatus && movedTaskId === task.id && task.status !== movedStatus) {
        updates.status = movedStatus;
      }
      if (Object.keys(updates).length > 0) {
        promises.push(updateTask(task.id, updates));
      }
    }
    await Promise.all(promises);
  }

  function insertTaskAtIndex(tasks: TaskDto[], task: TaskDto, index: number): TaskDto[] {
    const clampedIndex = Math.max(0, Math.min(index, tasks.length));
    const next = [...tasks];
    next.splice(clampedIndex, 0, task);
    return next;
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

<div class="flex min-h-0 flex-1 overflow-x-auto p-0">
  {#each kanbanColumns as col, colIdx}
    <section
      class={`flex min-w-[240px] max-w-[300px] flex-1 flex-col bg-background/80 ${
        colIdx < kanbanColumns.length - 1 ? "border-r border-border/40" : ""
      }`}
    >
      <!-- Column header -->
      <div class="flex items-center justify-between border-b border-border/60 px-3 py-2">
        <span
          class={`font-mono text-[11px] uppercase tracking-[0.08em] ${
            col.done ? "text-muted-foreground/50" : "text-muted-foreground"
          }`}
        >
          {col.label}
        </span>
        <span class="font-mono text-[10px] text-muted-foreground/60">
          {col.tasks.length}
        </span>
      </div>

      <div class="relative min-h-0 flex-1">
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="kanban-scroll flex h-full flex-col gap-1.5 overflow-y-auto p-1.5"
          ondragover={(e) => handleColumnDragOver(e, col.id, col.tasks.length)}
          ondragleave={handleDragLeave}
          ondrop={(e) => handleDrop(e, col.id, col.tasks.length)}
        >
        <!-- Task cards -->
        {#each col.tasks as task, i}
          <!-- Drop indicator line -->
          {#if dropTarget?.columnId === col.id && dropTarget?.index === i}
            <div class="drop-indicator"></div>
          {/if}

          <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
          <div
            class="kanban-card group cursor-pointer rounded-[6px] border border-border/60 px-2.5 py-2 transition-all duration-[120ms]"
            class:opacity-30={draggedTask?.id === task.id}
            class:dragging={draggedTask?.id === task.id}
            class:kanban-card-settled={justDroppedId === task.id}
            draggable={canDrag(task) && !isUnmatchedColumn(col.id)}
            ondragstart={(e) => handleDragStart(e, task)}
            ondragend={handleDragEnd}
            ondragover={(e) => handleDragOver(e, col.id, i)}
            ondrop={(e) => { e.stopPropagation(); handleDrop(e, col.id, i); }}
            onclick={() => onTaskClick(task)}
            role="button"
            tabindex="0"
            title={task.title}
          >
            <!-- Row 1: priority dot + title -->
            <div class="flex items-center gap-1.5">
              <PriorityDot tone={priorityTone(task.priority)} />
              <span class="min-w-0 flex-1 text-[13px] leading-snug text-foreground">
                {task.title}
              </span>
              {#if task.id == null}
                <span class="shrink-0 rounded-[4px] border border-border/60 px-1 py-0.5 font-mono text-[9px] text-muted-foreground">
                  unindexed
                </span>
              {/if}
            </div>

            <!-- Row 2: metadata (only if present) -->
            {#if task.tags.length > 0 || task.updated}
              <div class="mt-1 flex items-center gap-1.5">
                {#each task.tags.slice(0, 2) as tag}
                  <span class="rounded-[3px] font-mono text-[10px] text-muted-foreground/60">
                    {tag}
                  </span>
                {/each}
                {#if task.tags.length > 2}
                  <span class="font-mono text-[10px] text-muted-foreground/40">
                    +{task.tags.length - 2}
                  </span>
                {/if}
                {#if task.updated}
                  <span class="ml-auto font-mono text-[10px] text-muted-foreground/40">
                    {relativeDate(task.updated)}
                  </span>
                {/if}
              </div>
            {/if}

            <!-- Subtask progress bar -->
            {#if task.subtask_total > 0}
              <div class="mt-1.5 h-[2px] w-full overflow-hidden rounded-full bg-border">
                <div
                  class="h-full rounded-full bg-foreground/60"
                  style="width: {(task.subtask_done / task.subtask_total) * 100}%"
                ></div>
              </div>
            {/if}
          </div>
        {/each}

        <!-- Drop indicator at end -->
        {#if dropTarget?.columnId === col.id && dropTarget?.index === col.tasks.length && col.tasks.length > 0}
          <div class="drop-indicator"></div>
        {/if}

        <!-- Empty column: combined drop zone + add task -->
        {#if col.tasks.length === 0 && !isUnmatchedColumn(col.id)}
          {#if addingInColumn === col.id}
            <div class="rounded-[6px] border border-border/60 bg-card px-2.5 py-2">
              <textarea
                bind:value={quickAddTitle}
                onkeydown={(e) => handleQuickAddKeydown(e, col.id)}
                onblur={() => { if (!quickAddTitle.trim()) addingInColumn = null; }}
                placeholder="Task title..."
                rows="2"
                class="w-full resize-none bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground/40 outline-none"
                class:border-destructive={quickAddErrorFlash}
                autofocus
              ></textarea>
              {#if quickAddError}
                <p class="mt-1 font-mono text-[10px] text-red-400">{quickAddError}</p>
              {/if}
            </div>
          {:else}
            <button
              type="button"
              class="flex min-h-[80px] w-full flex-1 items-center justify-center rounded-[6px] border border-dashed border-border/40 font-mono text-[10px] text-muted-foreground/40 transition-colors duration-[120ms] hover:border-border/60 hover:text-muted-foreground"
              class:border-ring={dropTarget?.columnId === col.id}
              onclick={() => startQuickAdd(col.id)}
            >
              {#if isDragging}
                Drop here
              {:else}
                + Add task
              {/if}
            </button>
          {/if}
        {/if}

        <!-- Quick-add at bottom (only when column has tasks) -->
        {#if col.tasks.length > 0 && !isUnmatchedColumn(col.id)}
          {#if addingInColumn === col.id}
            <div class="rounded-[6px] border border-border/60 bg-card px-2.5 py-2">
              <textarea
                bind:value={quickAddTitle}
                onkeydown={(e) => handleQuickAddKeydown(e, col.id)}
                onblur={() => { if (!quickAddTitle.trim()) addingInColumn = null; }}
                placeholder="Task title..."
                rows="2"
                class="w-full resize-none bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground/40 outline-none"
                class:border-destructive={quickAddErrorFlash}
                autofocus
              ></textarea>
              {#if quickAddError}
                <p class="mt-1 font-mono text-[10px] text-red-400">{quickAddError}</p>
              {/if}
            </div>
          {:else}
            <button
              type="button"
              class="w-full rounded-[6px] border border-dashed border-border/40 px-2.5 py-1.5 text-left font-mono text-[10px] text-muted-foreground/40 transition-colors duration-[120ms] hover:border-border/60 hover:text-muted-foreground"
              onclick={() => startQuickAdd(col.id)}
            >
              + Add task
            </button>
          {/if}
        {/if}
        </div>
        <div class="pointer-events-none absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-background/80 to-transparent"></div>
      </div>
    </section>
  {/each}
</div>

<style>
  .kanban-card:hover {
    border-color: var(--color-border);
    box-shadow: 0 2px 8px -2px rgba(0, 0, 0, 0.3);
  }

  .kanban-card.dragging {
    transform: scale(0.97) rotate(1deg);
    box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.4);
  }

  .drop-indicator {
    height: 2px;
    background: var(--color-ring);
    border-radius: 1px;
    box-shadow: 0 0 6px var(--color-ring);
    flex-shrink: 0;
  }

  @keyframes card-settle {
    0% { transform: scale(1.02); }
    100% { transform: scale(1); }
  }

  .kanban-card-settled {
    animation: card-settle 80ms ease-out;
  }

  .kanban-scroll {
    scrollbar-width: thin;
    scrollbar-color: rgb(42 42 42 / 0.4) transparent;
  }

  .kanban-scroll::-webkit-scrollbar {
    width: 6px;
  }

  .kanban-scroll::-webkit-scrollbar-track {
    background: transparent;
  }

  .kanban-scroll::-webkit-scrollbar-thumb {
    background: rgb(42 42 42 / 0.4);
    border-radius: 3px;
  }
</style>
