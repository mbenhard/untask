<script lang="ts">
  import { Progress } from "bits-ui";
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

  function focusOnMount(el: HTMLElement) {
    requestAnimationFrame(() => {
      el.focus();
      if (el instanceof HTMLTextAreaElement) {
        el.style.height = "auto";
        el.style.height = `${el.scrollHeight}px`;
      }
    });
  }

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
            <!-- Row 1: title -->
            <div class="flex items-start gap-1.5">
              <span class="min-w-0 flex-1 text-[13px] leading-snug text-foreground">
                {task.title}
              </span>
              {#if task.id == null}
                <span class="shrink-0 rounded-[4px] border border-border/60 px-1 py-0.5 font-mono text-[9px] text-muted-foreground">
                  unindexed
                </span>
              {/if}
            </div>

            <!-- Row 2: tags + body indicator (only if present) -->
            {#if task.tags.length > 0 || task.body?.trim()}
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
                    class="shrink-0 text-muted-foreground/40"
                    aria-label="Has notes"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                    <polyline points="10 9 9 9 8 9"/>
                  </svg>
                {/if}
              </div>
            {/if}

            <!-- Subtask progress bar -->
            {#if task.subtask_total > 0}
              <Progress.Root
                value={task.subtask_done}
                max={task.subtask_total}
                class="mt-1.5 h-[2px] w-full overflow-hidden rounded-full bg-border"
              >
                <div
                  class="h-full rounded-full bg-foreground/60"
                  style="width: {(task.subtask_done / task.subtask_total) * 100}%"
                ></div>
              </Progress.Root>
            {/if}

            <!-- Bottom row: priority dot (bottom-left) -->
            <div class="mt-1.5 flex items-center">
              <div class="pointer-events-none flex h-3.5 w-3.5 items-center justify-center rounded-full border border-border/50 bg-background/90 transition-colors duration-[120ms] group-hover:border-border/70">
                <PriorityDot tone={priorityTone(task.priority)} />
              </div>
            </div>
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
                onblur={() => { if (quickAddTitle.trim()) submitQuickAdd(col.id); else addingInColumn = null; }}
                oninput={(e) => { const el = e.currentTarget; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }}
                placeholder="Task title..."
                rows="1"
                style="overflow:hidden; box-shadow:none"
                class="w-full resize-none border-0 bg-transparent p-0 text-[13px] leading-snug text-foreground placeholder:text-muted-foreground/40 outline-none focus:outline-none focus:ring-0 focus:shadow-none"
                class:border-destructive={quickAddErrorFlash}
                use:focusOnMount
              ></textarea>
              {#if quickAddError}
                <p class="mt-1 font-mono text-[10px] text-red-400">{quickAddError}</p>
              {/if}
            </div>
          {:else}
            <button
              type="button"
              class="w-full rounded-[6px] border border-dashed border-border/40 px-2.5 py-1.5 text-left font-mono text-[10px] text-muted-foreground/40 transition-colors duration-[120ms] hover:border-border/60 hover:text-muted-foreground"
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
                onblur={() => { if (quickAddTitle.trim()) submitQuickAdd(col.id); else addingInColumn = null; }}
                oninput={(e) => { const el = e.currentTarget; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }}
                placeholder="Task title..."
                rows="1"
                style="overflow:hidden; box-shadow:none"
                class="w-full resize-none border-0 bg-transparent p-0 text-[13px] leading-snug text-foreground placeholder:text-muted-foreground/40 outline-none focus:outline-none focus:ring-0 focus:shadow-none"
                class:border-destructive={quickAddErrorFlash}
                use:focusOnMount
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
    transform: scale(0.98);
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

  /* Override global :focus-visible outline on inline edit textareas */
  textarea:focus,
  textarea:focus-visible {
    outline: none;
    border-color: transparent;
    box-shadow: none;
  }
</style>
