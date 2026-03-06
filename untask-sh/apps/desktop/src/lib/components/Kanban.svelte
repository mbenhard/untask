<script lang="ts">
  import { updateTask, type ColumnDto, type TaskDto } from "$lib/api";
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
      const targetId = colIds.has(status)
        ? status
        : aliasMap.get(status);

      if (targetId) {
        const col = cols.find((c) => c.id === targetId);
        col?.tasks.push(task);
      } else {
        unmatched.push(task);
      }
    }

    if (unmatched.length > 0) {
      cols.push({ id: "__unmatched", label: "unmatched", tasks: unmatched });
    }

    return cols;
  });

  async function moveTask(task: TaskDto, newStatus: string) {
    if (task.id == null) return;
    try {
      await updateTask(task.id, { status: newStatus });
      onTasksChanged();
    } catch (e) {
      console.error("Failed to move task:", e);
    }
  }

  function columnIndex(task: TaskDto): number {
    const status = task.status.toLowerCase();
    return kanbanColumns.findIndex(
      (c) => c.id === status || columns.some(
        (col) => col.id === c.id && col.aliases.some((a) => a.toLowerCase() === status),
      ),
    );
  }

  function canMoveLeft(task: TaskDto): boolean {
    const idx = columnIndex(task);
    return idx > 0;
  }

  function canMoveRight(task: TaskDto): boolean {
    const idx = columnIndex(task);
    return idx >= 0 && idx < columns.length - 1;
  }

  function moveLeft(task: TaskDto) {
    const idx = columnIndex(task);
    if (idx > 0) {
      moveTask(task, columns[idx - 1].id);
    }
  }

  function moveRight(task: TaskDto) {
    const idx = columnIndex(task);
    if (idx >= 0 && idx < columns.length - 1) {
      moveTask(task, columns[idx + 1].id);
    }
  }
</script>

<div class="flex min-h-0 flex-1 gap-px overflow-x-auto bg-border/40 p-0">
  {#each kanbanColumns as col}
    <section class="flex min-w-[200px] flex-1 flex-col bg-background/80">
      <div class="flex items-center justify-between border-b border-border/80 px-3 py-2">
        <span
          class="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground"
        >
          {col.label}
        </span>
        <span
          class="rounded-full border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
        >
          {col.tasks.length}
        </span>
      </div>

      <div class="flex flex-1 flex-col gap-0 overflow-y-auto">
        {#each col.tasks as task}
          <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
          <div
            class="group flex min-h-[40px] w-full cursor-pointer items-center gap-2 border-b border-border/40 px-3 py-1.5 text-left transition-colors hover:bg-accent/60"
            onclick={() => onTaskClick(task)}
            role="button"
            tabindex="0"
          >
            <PriorityDot
              tone={task.priority === "high" || task.priority === "urgent"
                ? "high"
                : task.priority === "medium"
                  ? "medium"
                  : task.priority === "low"
                    ? "low"
                    : "neutral"}
            />
            <span class="min-w-0 flex-1 truncate text-[13px] text-foreground">
              {task.title}
            </span>

            <span
              class="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100"
            >
              {#if canMoveLeft(task)}
                <button
                  type="button"
                  class="rounded-[3px] border border-border px-1 py-0.5 font-mono text-[9px] text-muted-foreground hover:bg-accent hover:text-foreground"
                  onclick={(e) => { e.stopPropagation(); moveLeft(task); }}
                  title="Move left"
                >
                  &larr;
                </button>
              {/if}
              {#if canMoveRight(task)}
                <button
                  type="button"
                  class="rounded-[3px] border border-border px-1 py-0.5 font-mono text-[9px] text-muted-foreground hover:bg-accent hover:text-foreground"
                  onclick={(e) => { e.stopPropagation(); moveRight(task); }}
                  title="Move right"
                >
                  &rarr;
                </button>
              {/if}
            </span>
          </div>
        {/each}

        {#if col.tasks.length === 0}
          <div class="flex flex-1 items-center justify-center p-4">
            <span class="font-mono text-[10px] text-muted-foreground/50">Empty</span>
          </div>
        {/if}
      </div>
    </section>
  {/each}
</div>
