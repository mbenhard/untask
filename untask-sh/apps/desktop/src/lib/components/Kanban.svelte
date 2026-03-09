<script lang="ts">
  import { addTask, updateTask, attachFileBytes, type ColumnDto, type TaskDto } from "$lib/api";
  import CardThumbnail from "$lib/components/CardThumbnail.svelte";
  import { tagColor } from "$lib/tagColor";
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

  // ── Quick-add paste buffer ─────────────────────────────────────
  type PastedImage = { data: number[]; filename: string; mimeType: string };
  let quickAddPastedImages = $state<PastedImage[]>([]);

  // ── Drag state ───────────────────────────────────────────────────
  let draggedTask = $state<TaskDto | null>(null);
  let dropTarget = $state<{ columnId: string; index: number } | null>(null);
  let isDragging = $state(false);
  let justDroppedId = $state<number | null>(null);

  // ── Done strip state ──────────────────────────────────────────────
  let doneExpanded = $state(
    typeof window !== 'undefined' && localStorage.getItem('kanban-done-expanded') === 'true'
  );
  let doneTransitioning = $state(false);
  let doneStripDragOver = $state(false);
  let doneDropFlash = $state(false);
  let kanbanContainer = $state<HTMLElement | null>(null);

  $effect(() => {
    if (!doneExpanded || !doneColumn || doneColumn.tasks.length > 0) return;
    doneExpanded = false;
    if (typeof window !== "undefined") {
      localStorage.setItem("kanban-done-expanded", "false");
    }
  });

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

  // ── Split active / done columns ───────────────────────────────────
  let activeColumns = $derived(kanbanColumns.filter(c => !c.done));
  let doneColumn = $derived.by(() => {
    const col = kanbanColumns.find(c => c.done);
    if (!col) return null;
    const sorted = [...col.tasks].sort((a, b) => {
      if (!a.completed && !b.completed) return 0;
      if (!a.completed) return 1;
      if (!b.completed) return -1;
      return b.completed.localeCompare(a.completed);
    });
    return { ...col, tasks: sorted };
  });

  // ── Quick-add ────────────────────────────────────────────────────
  function startQuickAdd(columnId: string) {
    addingInColumn = columnId;
    quickAddTitle = "";
    quickAddError = null;
    quickAddErrorFlash = false;
    quickAddPastedImages = [];
  }

  async function submitQuickAdd(columnId: string) {
    const title = quickAddTitle.trim();
    if (!title) return;
    try {
      const task = await addTask(title, columnId);
      // Flush buffered paste images as attachments
      if (task.id != null && quickAddPastedImages.length > 0) {
        for (const img of quickAddPastedImages) {
          try {
            await attachFileBytes(task.id, img.data, img.filename, img.mimeType);
          } catch {
            // Silently skip failed attachments — task was already created
          }
        }
      }
      quickAddTitle = "";
      quickAddError = null;
      quickAddPastedImages = [];
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
      quickAddPastedImages = [];
    }
  }

  async function handleQuickAddPaste(e: ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (!item.type.startsWith("image/")) continue;

      e.preventDefault();
      const file = item.getAsFile();
      if (!file) continue;

      const buffer = await file.arrayBuffer();
      const data = Array.from(new Uint8Array(buffer));

      // Check total buffer size (25 MB limit)
      const totalSize = quickAddPastedImages.reduce((sum, img) => sum + img.data.length, 0) + data.length;
      if (totalSize > 25 * 1024 * 1024) continue;

      const ext = item.type.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
      const filename = `paste-${Date.now()}.${ext}`;
      quickAddPastedImages = [...quickAddPastedImages, { data, filename, mimeType: item.type }];
      break;
    }
  }

  function firstImageAttachment(task: TaskDto): string | null {
    const img = task.attachments?.find((a) => a.mime_type.startsWith("image/"));
    return img?.filename ?? null;
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
    doneStripDragOver = false;
  }

  function handleDragOver(e: DragEvent, columnId: string, index: number) {
    if (!draggedTask || isUnmatchedColumn(columnId)) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    if (dropTarget?.columnId === columnId && dropTarget.index === index) return;
    dropTarget = { columnId, index };
  }

  function handleColumnDragOver(e: DragEvent, columnId: string, taskCount: number) {
    if (!draggedTask || isUnmatchedColumn(columnId)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    if (dropTarget?.columnId === columnId && dropTarget.index === taskCount) return;
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

  function isDropBeforeTask(columnId: string, index: number): boolean {
    return dropTarget?.columnId === columnId && dropTarget.index === index;
  }

  function isDropAtColumnEnd(columnId: string, taskCount: number): boolean {
    return dropTarget?.columnId === columnId && dropTarget.index === taskCount;
  }

  // ── Done strip ──────────────────────────────────────────────────
  function toggleDoneExpanded() {
    if (doneExpanded) {
      // Collapsing: shrink first, swap content after transition
      doneExpanded = false;
      doneTransitioning = true;
      setTimeout(() => { doneTransitioning = false; }, 200);
    } else {
      // Expanding: content appears at collapsed width, then widens
      doneExpanded = true;
    }
    localStorage.setItem('kanban-done-expanded', String(doneExpanded));
    if (doneExpanded && kanbanContainer) {
      requestAnimationFrame(() => {
        kanbanContainer!.scrollLeft = kanbanContainer!.scrollWidth;
      });
    }
  }

  function handleStripDragOver(e: DragEvent) {
    if (!draggedTask) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    doneStripDragOver = true;
  }

  function handleStripDragLeave(e: DragEvent) {
    const related = e.relatedTarget as HTMLElement | null;
    if (!related || !e.currentTarget || !(e.currentTarget as HTMLElement).contains(related)) {
      doneStripDragOver = false;
    }
  }

  async function handleStripDrop(e: DragEvent) {
    e.preventDefault();
    doneStripDragOver = false;

    if (!draggedTask || !doneColumn || draggedTask.id == null) {
      handleDragEnd();
      return;
    }

    const task = draggedTask;
    const taskId = task.id as number;
    const sourceColId = resolveColumnId(task);
    const sourceCol = kanbanColumns.find(c => c.id === sourceColId);

    draggedTask = null;
    dropTarget = null;
    isDragging = false;

    if (sourceColId === doneColumn.id) return;

    try {
      if (sourceCol) {
        await persistColumnOrder(sourceCol.tasks.filter(t => t.id !== task.id));
      }
      await updateTask(taskId, { status: doneColumn.id });
      doneDropFlash = true;
      setTimeout(() => { doneDropFlash = false; }, 200);
      onTasksChanged();
    } catch (err) {
      console.error("Failed to complete task:", err);
    }
  }
</script>

<div bind:this={kanbanContainer} class="flex min-h-0 flex-1 overflow-x-auto p-0">
  {#each activeColumns as col, colIdx}
    <section
      class={`flex min-w-[240px] flex-1 flex-col bg-background/80 ${
        colIdx < activeColumns.length - 1 ? "border-r border-border/40" : ""
      }`}
    >
      <!-- Column header -->
      <div class="flex items-center justify-between border-b border-border/60 px-3 py-2">
        <span class="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
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
          <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
          <div
            class="kanban-card group relative cursor-pointer rounded-[6px] border border-border/60 bg-card px-2.5 py-2 transition-all duration-[120ms]"
            class:opacity-30={draggedTask?.id === task.id}
            class:dragging={draggedTask?.id === task.id}
            class:drop-before={isDropBeforeTask(col.id, i)}
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
            <!-- Thumbnail header -->
            {#if task.id != null}
              {@const thumb = firstImageAttachment(task)}
              {#if thumb}
                <div class="-mx-2.5 -mt-2 mb-1.5">
                  <CardThumbnail taskId={task.id} filename={thumb} />
                </div>
              {/if}
            {/if}

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

            <!-- Row 2: tag pills -->
            {#if task.tags.length > 0}
              <div class="mt-1.5 flex flex-wrap items-center gap-1">
                {#each task.tags.slice(0, 2) as tag}
                  <span
                    class="inline-flex items-center gap-1 rounded-full border border-border/40 bg-border/15 px-1.5 py-px font-mono text-[10px] text-muted-foreground/70"
                  >
                    <span class="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style="background-color: {tagColor(tag)}"></span>
                    {tag}
                  </span>
                {/each}
                {#if task.tags.length > 2}
                  <span class="font-mono text-[10px] text-muted-foreground/40">
                    +{task.tags.length - 2}
                  </span>
                {/if}
              </div>
            {/if}

            <!-- Row 3: icon cluster -->
            {#if task.body?.trim() || task.subtask_total > 0 || task.owner === "user" || task.attachments?.length > 0}
              <div class="mt-1.5 flex items-center gap-1.5">
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
                {#if task.owner === "user"}
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 text-muted-foreground/40">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                {/if}
                {#if task.attachments?.length > 0}
                  <span class="inline-flex items-center gap-0.5 font-mono text-[9px] text-muted-foreground/40" title="{task.attachments.length} attachment{task.attachments.length > 1 ? 's' : ''}">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                    </svg>
                    {task.attachments.length}
                  </span>
                {/if}
                {#if task.subtask_total > 0}
                  <span class="inline-flex items-center gap-0.5 font-mono text-[9px] text-muted-foreground/40">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M20 6L9 17l-5-5"/>
                    </svg>
                    {task.subtask_done}/{task.subtask_total}
                  </span>
                {/if}
              </div>
            {/if}
          </div>
        {/each}

        <!-- Drop indicator at end -->
        {#if isDropAtColumnEnd(col.id, col.tasks.length) && col.tasks.length > 0}
          <div class="drop-indicator-end"></div>
        {/if}

        <!-- Empty column: combined drop zone + add task -->
        {#if col.tasks.length === 0 && !isUnmatchedColumn(col.id)}
          {#if addingInColumn === col.id}
            <div class="rounded-[6px] border border-border/60 bg-card px-2.5 py-2">
              <textarea
                bind:value={quickAddTitle}
                onkeydown={(e) => handleQuickAddKeydown(e, col.id)}
                onblur={() => { if (quickAddTitle.trim()) submitQuickAdd(col.id); else { addingInColumn = null; quickAddPastedImages = []; } }}
                onpaste={handleQuickAddPaste}
                oninput={(e) => { const el = e.currentTarget; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }}
                placeholder="Task title..."
                rows="1"
                style="overflow:hidden; box-shadow:none"
                class="w-full resize-none border-0 bg-transparent p-0 text-[13px] leading-snug text-foreground placeholder:text-muted-foreground/40 outline-none focus:outline-none focus:ring-0 focus:shadow-none"
                class:border-destructive={quickAddErrorFlash}
                use:focusOnMount
              ></textarea>
              {#if quickAddPastedImages.length > 0}
                <div class="mt-1 flex items-center gap-1 font-mono text-[9px] text-muted-foreground/50">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                  </svg>
                  {quickAddPastedImages.length} image{quickAddPastedImages.length > 1 ? "s" : ""} pasted
                </div>
              {/if}
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
                onblur={() => { if (quickAddTitle.trim()) submitQuickAdd(col.id); else { addingInColumn = null; quickAddPastedImages = []; } }}
                onpaste={handleQuickAddPaste}
                oninput={(e) => { const el = e.currentTarget; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }}
                placeholder="Task title..."
                rows="1"
                style="overflow:hidden; box-shadow:none"
                class="w-full resize-none border-0 bg-transparent p-0 text-[13px] leading-snug text-foreground placeholder:text-muted-foreground/40 outline-none focus:outline-none focus:ring-0 focus:shadow-none"
                class:border-destructive={quickAddErrorFlash}
                use:focusOnMount
              ></textarea>
              {#if quickAddPastedImages.length > 0}
                <div class="mt-1 flex items-center gap-1 font-mono text-[9px] text-muted-foreground/50">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                  </svg>
                  {quickAddPastedImages.length} image{quickAddPastedImages.length > 1 ? "s" : ""} pasted
                </div>
              {/if}
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

  <!-- Done strip / expanded done column -->
  {#if doneColumn && (doneExpanded || doneColumn.tasks.length > 0 || isDragging)}
    <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events a11y_no_noninteractive_tabindex -->
    <section
      class={`done-area flex shrink-0 flex-col overflow-hidden border-l bg-background/80 ${
        doneDropFlash ? 'border-foreground/50' :
        doneStripDragOver && !doneExpanded ? 'border-border' :
        'border-border/40'
      } ${!doneExpanded && !doneTransitioning ? 'done-collapsed group/strip' : ''} ${doneStripDragOver && !doneExpanded ? 'done-strip-hover' : ''}`}
      style="width: {doneExpanded ? '280px' : doneStripDragOver ? '120px' : '56px'};"
      onclick={!doneExpanded && !doneTransitioning ? toggleDoneExpanded : undefined}
      onkeydown={!doneExpanded && !doneTransitioning ? (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleDoneExpanded(); } } : undefined}
      ondragover={!doneExpanded && !doneTransitioning ? handleStripDragOver : undefined}
      ondragleave={!doneExpanded && !doneTransitioning ? handleStripDragLeave : undefined}
      ondrop={!doneExpanded && !doneTransitioning ? handleStripDrop : undefined}
    >
      {#if doneExpanded || doneTransitioning}
        <!-- Fixed-width inner wrapper — stays 280px while container clips it -->
        <div class="flex min-h-0 w-[280px] min-w-[280px] shrink-0 flex-1 flex-col">
        <!-- Header — entire row collapses on click -->
        <button
          type="button"
          class="flex w-full cursor-pointer items-center justify-between border-b border-border/60 px-3 py-2 transition-colors hover:bg-accent/20"
          onclick={(e: MouseEvent) => { e.stopPropagation(); toggleDoneExpanded(); }}
        >
          <span class="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
            Done
          </span>
          <div class="flex items-center gap-2">
            <span class="font-mono text-[10px] text-muted-foreground/60">
              {doneColumn.tasks.length}
            </span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground/40">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </div>
        </button>

        <div class="relative min-h-0 flex-1">
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="kanban-scroll flex h-full flex-col gap-1.5 overflow-y-auto p-1.5"
            ondragover={(e) => handleColumnDragOver(e, doneColumn.id, doneColumn.tasks.length)}
            ondragleave={handleDragLeave}
            ondrop={(e) => handleDrop(e, doneColumn.id, doneColumn.tasks.length)}
          >
            {#each doneColumn.tasks as task, i}
              <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
              <div
                class="kanban-card done-card group relative cursor-pointer rounded-[6px] border border-border/30 bg-card px-2.5 py-2 transition-all duration-[120ms]"
                class:opacity-30={draggedTask?.id === task.id}
                class:dragging={draggedTask?.id === task.id}
                class:drop-before={isDropBeforeTask(doneColumn.id, i)}
                class:kanban-card-settled={justDroppedId === task.id}
                draggable={canDrag(task)}
                ondragstart={(e) => handleDragStart(e, task)}
                ondragend={handleDragEnd}
                ondragover={(e) => handleDragOver(e, doneColumn.id, i)}
                ondrop={(e) => { e.stopPropagation(); handleDrop(e, doneColumn.id, i); }}
                onclick={() => onTaskClick(task)}
                role="button"
                tabindex="0"
                title={task.title}
              >
                <!-- Thumbnail header -->
                {#if task.id != null}
                  {@const thumb = firstImageAttachment(task)}
                  {#if thumb}
                    <div class="-mx-2.5 -mt-2 mb-1.5 opacity-60">
                      <CardThumbnail taskId={task.id} filename={thumb} />
                    </div>
                  {/if}
                {/if}

                <!-- Row 1: title -->
                <div class="flex items-start gap-1.5">
                  <span class="min-w-0 flex-1 text-[13px] leading-snug text-muted-foreground/60">
                    {task.title}
                  </span>
                </div>

                <!-- Row 2: tag pills -->
                {#if task.tags.length > 0}
                  <div class="mt-1.5 flex flex-wrap items-center gap-1">
                    {#each task.tags.slice(0, 2) as tag}
                      <span
                        class="inline-flex items-center gap-1 rounded-full border border-border/30 bg-border/10 px-1.5 py-px font-mono text-[10px] text-muted-foreground/40"
                      >
                        <span class="inline-block h-1.5 w-1.5 shrink-0 rounded-full opacity-50" style="background-color: {tagColor(tag)}"></span>
                        {tag}
                      </span>
                    {/each}
                    {#if task.tags.length > 2}
                      <span class="font-mono text-[10px] text-muted-foreground/30">
                        +{task.tags.length - 2}
                      </span>
                    {/if}
                  </div>
                {/if}

                <!-- Row 3: icon cluster (muted) -->
                {#if task.body?.trim() || task.subtask_total > 0 || task.attachments?.length > 0}
                  <div class="mt-1.5 flex items-center gap-1.5">
                    {#if task.body?.trim()}
                      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 text-muted-foreground/25" aria-label="Has notes">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
                      </svg>
                    {/if}
                    {#if task.attachments?.length > 0}
                      <span class="inline-flex items-center gap-0.5 font-mono text-[9px] text-muted-foreground/25">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                        </svg>
                        {task.attachments.length}
                      </span>
                    {/if}
                    {#if task.subtask_total > 0}
                      <span class="inline-flex items-center gap-0.5 font-mono text-[9px] text-muted-foreground/25">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M20 6L9 17l-5-5"/>
                        </svg>
                        {task.subtask_done}/{task.subtask_total}
                      </span>
                    {/if}
                  </div>
                {/if}
              </div>
            {/each}

            <!-- Drop indicator at end -->
            {#if isDropAtColumnEnd(doneColumn.id, doneColumn.tasks.length) && doneColumn.tasks.length > 0}
              <div class="drop-indicator-end"></div>
            {/if}
          </div>
          <div class="pointer-events-none absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-background/80 to-transparent"></div>
        </div>
        </div>
      {:else}
        <!-- Collapsed strip content -->
        <div class="flex h-full flex-col items-center justify-center gap-1">
          <span class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/40 transition-colors group-hover/strip:text-muted-foreground/70">
            Done
          </span>
          <span class="font-mono text-[10px] text-muted-foreground/30 transition-colors group-hover/strip:text-muted-foreground/50">
            {doneColumn.tasks.length}
          </span>
        </div>
      {/if}
    </section>
  {/if}
</div>

<style>
  .kanban-card:hover {
    border-color: var(--color-border);
    box-shadow: 0 2px 8px -2px rgba(0, 0, 0, 0.3);
    transform: scale(0.98);
  }

  .kanban-card.done-card:hover {
    border-color: color-mix(in srgb, var(--color-border) 60%, transparent);
  }

  .kanban-card.dragging {
    transform: scale(0.97) rotate(1deg);
    box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.4);
  }

  .kanban-card.drop-before::before {
    content: "";
    position: absolute;
    left: 8px;
    right: 8px;
    top: -6px;
    height: 2px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--color-foreground) 55%, transparent);
    box-shadow: 0 0 0 1px rgb(245 245 245 / 0.08);
    pointer-events: none;
  }

  .drop-indicator-end {
    height: 2px;
    margin: 0 8px 2px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--color-foreground) 55%, transparent);
    box-shadow: 0 0 0 1px rgb(245 245 245 / 0.08);
    pointer-events: none;
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

  /* Done area expand/collapse transition */
  .done-area {
    transition: width 200ms ease, border-color 200ms ease;
  }

  /* Collapsed strip hover */
  .done-collapsed {
    cursor: pointer;
  }

  .done-collapsed:hover {
    background: color-mix(in srgb, var(--color-muted-foreground) 5%, transparent);
    border-color: color-mix(in srgb, var(--color-border) 80%, transparent);
  }

  /* Done strip drag-over fill */
  .done-strip-hover {
    background: color-mix(in srgb, var(--color-muted-foreground) 8%, transparent);
  }
</style>
