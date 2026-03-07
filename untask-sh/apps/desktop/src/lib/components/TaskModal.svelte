<script lang="ts">
  import {
    deleteTask,
    getTask,
    updateTask,
    type ColumnDto,
    type Priority,
    type TaskDto,
  } from "$lib/api";
  import MilkdownEditor from "$lib/components/MilkdownEditor.svelte";
  import PriorityDot from "$lib/components/PriorityDot.svelte";
  import type { PriorityTone } from "$lib/components/PriorityDot.svelte";

  let {
    taskId,
    columns,
    refreshRevision = 0,
    onClose,
    onTaskUpdated,
  }: {
    taskId: number | null;
    columns: ColumnDto[];
    refreshRevision?: number;
    onClose: () => void;
    onTaskUpdated: () => void;
  } = $props();

  let task = $state<TaskDto | null>(null);
  let loading = $state(true);
  let editingTitle = $state(false);
  let titleDraft = $state("");
  let showDelete = $state(false);
  let showBody = $state(false);
  let addingTag = $state(false);
  let tagDraft = $state("");
  let errorFlash = $state<string | null>(null);

  const priorityCycle: (Priority | null)[] = [null, "low", "medium", "high", "urgent"];

  $effect(() => {
    const id = taskId;
    const rev = refreshRevision;
    void rev;
    if (id == null) {
      loading = false;
      return;
    }
    loadTask(id);
  });

  async function loadTask(id: number) {
    loading = true;
    try {
      const loaded = await getTask(id);
      task = loaded;
      showBody = loaded.body.trim().length > 0;
    } catch {
      task = null;
      onClose();
    }
    loading = false;
  }

  let isUnindexed = $derived(task?.id == null);

  function hasKnownStatus(status: string): boolean {
    const normalized = status.trim().toLowerCase();
    return columns.some(
      (col) =>
        col.id === normalized ||
        col.aliases.some((a) => a.toLowerCase() === normalized),
    );
  }

  let hasUnmatchedStatus = $derived.by(() => {
    if (!task) return false;
    return !hasKnownStatus(task.status);
  });

  let statusOptions = $derived.by(() => {
    if (!task || hasKnownStatus(task.status)) return columns;
    return [{ id: task.status, aliases: [] }, ...columns];
  });

  function priorityTone(p: Priority | null): PriorityTone {
    if (p === "high" || p === "urgent") return "high";
    if (p === "medium") return "medium";
    if (p === "low") return "low";
    return "neutral";
  }

  function formatDate(iso: string | null): string {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch {
      return "";
    }
  }

  // ── Field updates ────────────────────────────────────────────────

  async function saveField(updates: Parameters<typeof updateTask>[1]) {
    if (!task?.id) return;
    try {
      task = await updateTask(task.id, updates);
      onTaskUpdated();
    } catch {
      flashError();
    }
  }

  function flashError() {
    errorFlash = "save-error";
    setTimeout(() => { errorFlash = null; }, 800);
  }

  // Title
  function startEditTitle() {
    if (isUnindexed) return;
    editingTitle = true;
    titleDraft = task?.title ?? "";
  }

  function confirmTitle() {
    editingTitle = false;
    const trimmed = titleDraft.trim();
    if (!trimmed || trimmed === task?.title) return;
    saveField({ title: trimmed });
  }

  function cancelTitle() {
    editingTitle = false;
  }

  function handleTitleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      confirmTitle();
    } else if (e.key === "Escape") {
      cancelTitle();
    }
  }

  // Status
  function changeStatus(newStatus: string) {
    saveField({ status: newStatus });
  }

  // Priority cycling
  function cyclePriority() {
    if (isUnindexed) return;
    const current = task?.priority ?? null;
    const idx = priorityCycle.indexOf(current);
    const next = priorityCycle[(idx + 1) % priorityCycle.length];
    saveField({ priority: next ?? undefined });
  }

  // Tags
  function removeTag(tag: string) {
    if (!task || isUnindexed) return;
    const newTags = task.tags.filter((t) => t !== tag);
    saveField({ tags: newTags });
  }

  function addTag() {
    const trimmed = tagDraft.trim();
    if (!trimmed || !task) return;
    if (task.tags.includes(trimmed)) {
      tagDraft = "";
      return;
    }
    saveField({ tags: [...task.tags, trimmed] });
    tagDraft = "";
    addingTag = false;
  }

  function handleTagKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      addTag();
    } else if (e.key === "Escape") {
      addingTag = false;
      tagDraft = "";
    }
  }

  // Body
  function saveBody(markdown: string) {
    saveField({ body: markdown });
  }

  // Delete
  async function confirmDelete() {
    if (!task?.id) return;
    try {
      await deleteTask(task.id);
      onTaskUpdated();
      onClose();
    } catch {
      flashError();
    }
  }

  // Close on Escape
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && !editingTitle && !addingTag) {
      e.preventDefault();
      onClose();
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions a11y_interactive_supports_focus -->
<div
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px]"
  onkeydown={handleKeydown}
  onclick={handleBackdropClick}
  role="dialog"
  aria-modal="true"
>
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="task-modal flex max-h-[80vh] w-full max-w-[560px] flex-col overflow-hidden rounded-[11px] border border-border bg-card shadow-[0_16px_40px_-12px_rgba(0,0,0,0.4)]"
    class:error-flash={errorFlash}
    onclick={(e) => e.stopPropagation()}
  >
    {#if loading}
      <div class="flex items-center justify-center py-12">
        <span class="font-mono text-[11px] text-muted-foreground">Loading...</span>
      </div>
    {:else if task}
      <!-- Header: trash + close -->
      <div class="flex items-center justify-end gap-1 border-b border-border/60 px-3 py-1.5">
        {#if task.id != null}
          <span class="mr-auto font-mono text-[10px] text-muted-foreground">#{task.id}</span>
        {/if}
        {#if !isUnindexed}
          {#if showDelete}
            <span class="mr-1 flex items-center gap-1.5 font-mono text-[10px]">
              <span class="text-muted-foreground">Delete this task?</span>
              <button
                type="button"
                class="rounded-[4px] border border-border px-1.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                onclick={() => { showDelete = false; }}
              >
                Cancel
              </button>
              <button
                type="button"
                class="rounded-[4px] border border-destructive/60 px-1.5 py-0.5 text-red-400 hover:bg-destructive/20"
                onclick={confirmDelete}
              >
                Delete
              </button>
            </span>
          {:else}
            <button
              type="button"
              class="rounded-[4px] p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onclick={() => { showDelete = true; }}
              title="Delete task"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          {/if}
        {/if}
        <button
          type="button"
          class="rounded-[4px] p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          onclick={onClose}
          title="Close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <!-- Title -->
        <div class="px-4 pt-3 pb-2">
          {#if isUnindexed}
            <div class="mb-2 rounded-[6px] border border-border/80 bg-accent/60 px-2.5 py-2">
              <p class="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">Unindexed</p>
              <p class="mt-0.5 text-[11px] text-muted-foreground">
                This file is not managed by Untask yet. Repair or reindex before editing.
              </p>
            </div>
          {/if}

          {#if editingTitle}
            <input
              type="text"
              bind:value={titleDraft}
              onblur={confirmTitle}
              onkeydown={handleTitleKeydown}
              class="w-full border-b border-border bg-transparent text-[16px] font-medium text-foreground outline-none focus:border-ring"
              autofocus
            />
          {:else}
            <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
            <h2
              class="text-[16px] font-medium text-foreground"
              class:cursor-pointer={!isUnindexed}
              class:hover:text-primary={!isUnindexed}
              onclick={startEditTitle}
            >
              {task.title}
            </h2>
          {/if}
        </div>

        <!-- Metadata row: status, priority, tags -->
        <div class="flex flex-wrap items-center gap-2 px-4 pb-3">
          <!-- Status -->
          <select
            class="h-[20px] rounded-[4px] border border-border bg-card px-1.5 font-mono text-[10px] text-foreground focus:border-ring focus:outline-none"
            value={task.status}
            disabled={isUnindexed}
            onchange={(e) => changeStatus(e.currentTarget.value)}
          >
            {#each statusOptions as col}
              <option value={col.id}>{col.id}</option>
            {/each}
          </select>

          <!-- Priority cycling dot -->
          <button
            type="button"
            class="flex items-center gap-1 rounded-full border border-border/60 px-1.5 py-0.5 transition-colors hover:border-border"
            disabled={isUnindexed}
            onclick={cyclePriority}
            title="Click to cycle priority"
          >
            <PriorityDot tone={priorityTone(task.priority)} />
            <span class="font-mono text-[10px] text-muted-foreground">
              {task.priority ?? "none"}
            </span>
          </button>

          <!-- Tags -->
          {#each task.tags as tag}
            <span class="flex h-[20px] items-center gap-0.5 rounded-[4px] border border-border/60 px-1.5 font-mono text-[10px] text-muted-foreground">
              {tag}
              {#if !isUnindexed}
                <button
                  type="button"
                  class="ml-0.5 text-muted-foreground/60 hover:text-foreground"
                  onclick={() => removeTag(tag)}
                  title="Remove tag"
                >&times;</button>
              {/if}
            </span>
          {/each}

          <!-- Add tag -->
          {#if !isUnindexed}
            {#if addingTag}
              <input
                type="text"
                bind:value={tagDraft}
                onblur={() => { if (!tagDraft.trim()) addingTag = false; else addTag(); }}
                onkeydown={handleTagKeydown}
                placeholder="tag..."
                class="h-[20px] w-[80px] rounded-[4px] border border-dashed border-border bg-transparent px-1.5 font-mono text-[10px] text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-ring"
                autofocus
              />
            {:else}
              <button
                type="button"
                class="flex h-[20px] items-center rounded-[4px] border border-dashed border-border/50 px-1.5 font-mono text-[10px] text-muted-foreground/60 transition-colors hover:border-border hover:text-muted-foreground"
                onclick={() => { addingTag = true; }}
              >
                + tag
              </button>
            {/if}
          {/if}
        </div>

        <!-- Subtask progress -->
        {#if task.subtask_total > 0}
          <div class="flex items-center gap-2 px-4 pb-2">
            <div class="h-1 w-24 overflow-hidden rounded-full bg-border">
              <div
                class="h-full rounded-full bg-foreground/60"
                style="width: {(task.subtask_done / task.subtask_total) * 100}%"
              ></div>
            </div>
            <span class="font-mono text-[10px] text-muted-foreground">
              {task.subtask_done}/{task.subtask_total}
            </span>
          </div>
        {/if}

        <!-- Unmatched status warning -->
        {#if hasUnmatchedStatus}
          <div class="mx-4 mb-2 rounded-[6px] border border-border/80 bg-accent/60 px-2.5 py-1.5">
            <p class="text-[11px] text-muted-foreground">
              Status does not match configured columns. Pick a configured column to normalize.
            </p>
          </div>
        {/if}

        <!-- Body / description -->
        <div class="border-t border-border/60">
          {#if showBody}
            <MilkdownEditor
              content={task.body}
              readonly={isUnindexed}
              saveOnBlur={true}
              onSave={saveBody}
            />
          {:else}
            <button
              type="button"
              class="w-full px-4 py-3 text-left font-mono text-[12px] text-muted-foreground/50 transition-colors hover:text-muted-foreground"
              disabled={isUnindexed}
              onclick={() => { showBody = true; }}
            >
              Add a description...
            </button>
          {/if}
        </div>

        <!-- Dates -->
        <div class="mt-auto border-t border-border/60 px-4 py-2">
          <div class="flex gap-4 font-mono text-[10px] text-muted-foreground/60">
            {#if task.created}
              <span>Created {formatDate(task.created)}</span>
            {/if}
            {#if task.updated}
              <span>Updated {formatDate(task.updated)}</span>
            {/if}
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .task-modal {
    animation: modal-in 300ms ease-out both;
  }

  @keyframes modal-in {
    from {
      opacity: 0;
      transform: scale(0.96);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .error-flash {
    animation: flash-border 800ms ease-out;
  }

  @keyframes flash-border {
    0%, 100% { border-color: var(--color-border); }
    30% { border-color: var(--color-destructive); }
  }
</style>
