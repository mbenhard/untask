<script lang="ts">
  import { Progress } from "bits-ui";
  import {
    getTask,
    updateTask,
    type ColumnDto,
    type TaskDto,
  } from "$lib/api";
  import AttachmentList from "$lib/components/AttachmentList.svelte";
  import MilkdownEditor from "$lib/components/MilkdownEditor.svelte";
  import MetaSelect from "$lib/components/ui/MetaSelect.svelte";
  import { hasKnownStatus } from "$lib/utils";

  let {
    task,
    columns,
    refreshRevision = 0,
    onClose,
    onTaskUpdated,
  }: {
    task: TaskDto;
    columns: ColumnDto[];
    refreshRevision?: number;
    onClose: () => void;
    onTaskUpdated: () => void;
  } = $props();

  let fullTask = $state<TaskDto | null>(null);
  let loading = $state(true);

  $effect(() => {
    const currentTask = task;
    const currentRevision = refreshRevision;
    void currentRevision;

    if (currentTask.id == null) {
      fullTask = currentTask;
      loading = false;
      return;
    }

    loadFullTask(currentTask.id);
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

  let isUnindexed = $derived(fullTask?.id == null);
  let hasUnmatchedStatus = $derived.by(() => {
    if (!fullTask) return false;
    return !hasKnownStatus(columns, fullTask.status);
  });
  let statusOptions = $derived.by(() => {
    if (!fullTask || hasKnownStatus(columns, fullTask.status)) {
      return columns;
    }

    return [{ id: fullTask.status, aliases: [] }, ...columns];
  });
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
          {#if fullTask.id != null}
            #{fullTask.id}
          {:else}
            unindexed
          {/if}
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

        <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {#if isUnindexed}
            <span class="inline-flex h-5 items-center rounded-[4px] border border-border/60 px-1.5 font-mono text-[10px] leading-none text-muted-foreground">
              unindexed
            </span>
          {/if}
          <!-- Status -->
          <div class="flex items-center gap-1.5">
            <span class="shrink-0 select-none font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/50">Status</span>
            <MetaSelect
              value={fullTask.status}
              items={statusOptions.map(col => ({ value: col.id, label: col.id }))}
              disabled={isUnindexed}
              onValueChange={changeStatus}
            />
          </div>

          <!-- Tags -->
          {#if fullTask.tags.length > 0}
            <div class="flex items-center gap-1.5">
              <span class="shrink-0 select-none font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/50">Tags</span>
              {#each fullTask.tags as tag}
                <span class="inline-flex h-5 items-center rounded-[4px] border border-border/60 px-1.5 font-mono text-[10px] leading-none text-muted-foreground">
                  {tag}
                </span>
              {/each}
            </div>
          {/if}
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
            <Progress.Root
              value={fullTask.subtask_done}
              max={fullTask.subtask_total}
              class="h-1 w-24 overflow-hidden rounded-full bg-border"
            >
              <div
                class="h-full rounded-full bg-foreground/60"
                style="width: {(fullTask.subtask_done / fullTask.subtask_total) * 100}%"
              ></div>
            </Progress.Root>
            <span class="font-mono text-[10px] text-muted-foreground">
              {fullTask.subtask_done}/{fullTask.subtask_total}
            </span>
          </div>
        {/if}

        {#if fullTask.id != null && fullTask.attachments.length > 0}
          <div class="mt-3">
            <AttachmentList
              taskId={fullTask.id}
              attachments={fullTask.attachments}
              readonly={true}
              onTaskUpdated={() => {}}
            />
          </div>
        {/if}

        {#if isUnindexed || hasUnmatchedStatus}
          <div class="mt-3 rounded-[6px] border border-border/80 bg-card/70 px-2.5 py-2">
            {#if isUnindexed}
              <p class="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                Unindexed
              </p>
              <p class="mt-1 text-[12px] text-muted-foreground">
                This file is not managed by Untask yet. Review it safely here, then repair or reindex it before editing metadata.
              </p>
            {/if}
            {#if hasUnmatchedStatus}
              <p class={`text-[12px] text-muted-foreground ${isUnindexed ? "mt-2" : "mt-0.5"}`}>
                The current status does not match your configured columns. Pick a configured column to normalize it.
              </p>
            {/if}
          </div>
        {/if}
      </div>

      <!-- Body editor -->
      <div class="min-h-0 flex-1">
        <MilkdownEditor content={fullTask.body} onSave={saveBody} readonly={isUnindexed} />
      </div>
    </div>
  {/if}
</div>
