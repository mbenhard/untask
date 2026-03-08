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

  let approving = $state(false);

  const confidenceOrder: Record<string, number> = { low: 0, medium: 1, high: 2 };

  let reviewTasks = $derived.by(() => {
    const filtered = tasks.filter((t) => t.status === "review");
    return [...filtered].sort((a, b) => {
      const ca = a.confidence ? (confidenceOrder[a.confidence] ?? 1) : 1;
      const cb = b.confidence ? (confidenceOrder[b.confidence] ?? 1) : 1;
      if (ca !== cb) return ca - cb;
      return (a.updated ?? "").localeCompare(b.updated ?? "");
    });
  });

  let doneColumnId = $derived(
    columns.find((c) => c.done)?.id ?? "done",
  );

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

  async function approveAll() {
    if (approving || reviewTasks.length === 0) return;
    approving = true;
    try {
      await Promise.all(
        reviewTasks
          .filter((t) => t.id != null)
          .map((t) => updateTask(t.id!, { status: doneColumnId })),
      );
      onTasksChanged();
    } catch {
      // best-effort
    }
    approving = false;
  }
</script>

<div class="flex min-h-0 flex-1 flex-col">
  <!-- Header -->
  <div class="flex items-center justify-between border-b border-border/60 px-3 py-1.5">
    <span class="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
      Review ({reviewTasks.length})
    </span>
    {#if reviewTasks.length > 0}
      <button
        type="button"
        class="rounded-[4px] border border-border/60 px-2 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors duration-[120ms] hover:border-border hover:text-foreground disabled:opacity-50"
        disabled={approving}
        onclick={approveAll}
      >
        {approving ? "Approving..." : "Approve all"}
      </button>
    {/if}
  </div>

  <!-- List -->
  <div class="review-scroll flex-1 overflow-y-auto">
    {#each reviewTasks as task}
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
      <div
        class="flex h-10 w-full items-center border-b border-border/40 px-3 transition-colors duration-[120ms] hover:bg-accent/50"
        onclick={() => onTaskClick(task)}
        role="button"
        tabindex="0"
      >
        <!-- Priority dot -->
        <span class="flex w-[24px] shrink-0 justify-center">
          <PriorityDot tone={priorityTone(task.priority)} />
        </span>

        <!-- ID -->
        {#if task.id != null}
          <span class="w-[40px] shrink-0 font-mono text-[10px] text-muted-foreground/60">
            #{task.id}
          </span>
        {/if}

        <!-- Title -->
        <span class="min-w-0 flex-1 truncate text-[13px] text-foreground" title={task.title}>
          {task.title}
        </span>

        {#if task.attachments.length > 0}
          <span
            class="mx-2 inline-flex shrink-0 items-center gap-1 font-mono text-[10px] text-muted-foreground/45"
            aria-label={`${task.attachments.length} attachments`}
          >
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
            >
              <path d="m21.44 11.05-8.49 8.49a5.5 5.5 0 0 1-7.78-7.78l8.84-8.84a3.5 3.5 0 1 1 4.95 4.95l-8.49 8.48a1.5 1.5 0 0 1-2.12-2.12l7.78-7.78" />
            </svg>
            <span>{task.attachments.length}</span>
          </span>
        {/if}

        <!-- Confidence -->
        {#if task.confidence}
          <span class="mx-2 shrink-0 font-mono text-[10px] text-muted-foreground/60">
            {task.confidence}
          </span>
        {/if}

        <!-- Updated -->
        <span class="w-[48px] shrink-0 text-right font-mono text-[10px] text-muted-foreground/60">
          {relativeDate(task.updated)}
        </span>
      </div>
    {/each}

    {#if reviewTasks.length === 0}
      <div class="flex flex-1 items-center justify-center py-12">
        <span class="font-mono text-[11px] text-muted-foreground/50">Nothing to review</span>
      </div>
    {/if}
  </div>
</div>

<style>
  .review-scroll {
    scrollbar-width: thin;
    scrollbar-color: rgb(42 42 42 / 0.4) transparent;
  }

  .review-scroll::-webkit-scrollbar {
    width: 6px;
  }

  .review-scroll::-webkit-scrollbar-track {
    background: transparent;
  }

  .review-scroll::-webkit-scrollbar-thumb {
    background: rgb(42 42 42 / 0.4);
    border-radius: 3px;
  }
</style>
