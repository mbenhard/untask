<script lang="ts">
  import {
    getTask,
    updateTask,
    type ColumnDto,
    type TaskDto,
  } from "$lib/api";
  import MilkdownEditor from "$lib/components/MilkdownEditor.svelte";
  import PriorityDot from "$lib/components/PriorityDot.svelte";

  let {
    task,
    columns,
    onClose,
    onTaskUpdated,
  }: {
    task: TaskDto;
    columns: ColumnDto[];
    onClose: () => void;
    onTaskUpdated: () => void;
  } = $props();

  let fullTask = $state<TaskDto | null>(null);
  let loading = $state(true);

  $effect(() => {
    loadFullTask(task.id!);
  });

  async function loadFullTask(id: number) {
    loading = true;
    try {
      fullTask = await getTask(id);
    } catch (e) {
      console.error("Failed to load task:", e);
      fullTask = task;
    }
    loading = false;
  }

  async function saveBody(markdown: string) {
    if (!fullTask?.id) return;
    try {
      await updateTask(fullTask.id, { body: markdown });
      onTaskUpdated();
    } catch (e) {
      console.error("Failed to save body:", e);
    }
  }

  async function changeStatus(newStatus: string) {
    if (!fullTask?.id) return;
    try {
      fullTask = await updateTask(fullTask.id, { status: newStatus });
      onTaskUpdated();
    } catch (e) {
      console.error("Failed to change status:", e);
    }
  }

  function priorityTone(p: string | null): "low" | "medium" | "high" | "neutral" {
    if (p === "high" || p === "urgent") return "high";
    if (p === "medium") return "medium";
    if (p === "low") return "low";
    return "neutral";
  }

  function formatDate(iso: string | null): string {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return "—";
    }
  }
</script>

<div class="flex min-h-0 flex-1 flex-col">
  <!-- Header -->
  <div class="flex items-center justify-between border-b border-border/80 px-4 py-2.5">
    <div class="flex items-center gap-2">
      <button
        type="button"
        class="rounded-[4px] border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        onclick={onClose}
      >
        &larr; Back
      </button>
      {#if fullTask}
        <span class="font-mono text-[10px] text-muted-foreground">
          #{fullTask.id}
        </span>
      {/if}
    </div>
  </div>

  {#if loading}
    <div class="flex flex-1 items-center justify-center">
      <span class="font-mono text-[11px] text-muted-foreground">Loading...</span>
    </div>
  {:else if fullTask}
    <div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <!-- Title & metadata -->
      <div class="border-b border-border/80 px-4 py-3">
        <h2 class="text-[16px] font-medium text-foreground">{fullTask.title}</h2>

        <div class="mt-2 flex flex-wrap items-center gap-2">
          <!-- Status selector -->
          <select
            class="h-5 rounded-[4px] border border-border bg-card px-1.5 font-mono text-[10px] text-foreground focus:border-ring focus:outline-none"
            value={fullTask.status}
            onchange={(e) => changeStatus(e.currentTarget.value)}
          >
            {#each columns as col}
              <option value={col.id}>{col.id}</option>
            {/each}
          </select>

          <!-- Priority -->
          <span class="flex items-center gap-1 rounded-full border border-border/60 px-1.5 py-0.5">
            <PriorityDot tone={priorityTone(fullTask.priority)} />
            <span class="font-mono text-[10px] text-muted-foreground">
              {fullTask.priority ?? "none"}
            </span>
          </span>

          <!-- Tags -->
          {#each fullTask.tags as tag}
            <span
              class="rounded-[4px] border border-border/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
            >
              {tag}
            </span>
          {/each}
        </div>

        <!-- Dates -->
        <div class="mt-2 flex gap-4">
          <span class="font-mono text-[10px] text-muted-foreground">
            created {formatDate(fullTask.created)}
          </span>
          <span class="font-mono text-[10px] text-muted-foreground">
            updated {formatDate(fullTask.updated)}
          </span>
          {#if fullTask.completed}
            <span class="font-mono text-[10px] text-muted-foreground">
              completed {formatDate(fullTask.completed)}
            </span>
          {/if}
        </div>

        <!-- Subtask progress -->
        {#if fullTask.subtask_total > 0}
          <div class="mt-2 flex items-center gap-2">
            <div class="h-1 w-24 overflow-hidden rounded-full bg-border">
              <div
                class="h-full rounded-full bg-foreground/60"
                style="width: {(fullTask.subtask_done / fullTask.subtask_total) * 100}%"
              ></div>
            </div>
            <span class="font-mono text-[10px] text-muted-foreground">
              {fullTask.subtask_done}/{fullTask.subtask_total}
            </span>
          </div>
        {/if}
      </div>

      <!-- Body editor -->
      <div class="min-h-0 flex-1">
        <MilkdownEditor content={fullTask.body} onSave={saveBody} />
      </div>
    </div>
  {/if}
</div>
