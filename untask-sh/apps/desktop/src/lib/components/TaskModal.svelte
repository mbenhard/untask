<script lang="ts">
  import { onMount } from "svelte";
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
  import { hasKnownStatus } from "$lib/utils";

  let {
    taskId,
    initialTask = null,
    columns,
    refreshRevision = 0,
    onClose,
    onTaskUpdated,
  }: {
    taskId: number | null;
    initialTask?: TaskDto | null;
    columns: ColumnDto[];
    refreshRevision?: number;
    onClose: () => void;
    onTaskUpdated: () => void;
  } = $props();

  let task = $state<TaskDto | null>(null);
  let loading = $state(true);
  let editingTitle = $state(false);
  let titleDraft = $state("");
  let overflowOpen = $state(false);
  let showDeleteConfirm = $state(false);
  let showBody = $state(false);
  let addingTag = $state(false);
  let tagDraft = $state("");
  let errorFlash = $state<string | null>(null);
  let closing = $state(false);
  let saveErrorText = $state<string | null>(null);
  let bodyFocused = $state(false);
  let bodyDirty = $state(false);
  let lastTaskId = $state<number | null | undefined>(undefined);
  let lastRefreshRevision = $state(-1);
  let modalEl: HTMLDivElement | undefined = $state();
  let triggerEl: Element | null = null;

  const priorityCycle: (Priority | null)[] = [null, "low", "medium", "high"];

  function focusOnMount(el: HTMLElement) {
    requestAnimationFrame(() => el.focus());
  }

  onMount(() => {
    triggerEl = document.activeElement;
    modalEl?.focus();
    return () => {
      if (triggerEl instanceof HTMLElement) triggerEl.focus();
    };
  });

  $effect(() => {
    const id = taskId;
    const snapshot = initialTask;
    if (id === lastTaskId) return;
    lastTaskId = id;
    lastRefreshRevision = refreshRevision;
    editingTitle = false;
    titleDraft = "";
    overflowOpen = false;
    showDeleteConfirm = false;
    addingTag = false;
    tagDraft = "";
    bodyFocused = false;
    bodyDirty = false;
    if (id == null) {
      task = snapshot ? { ...snapshot } : null;
      showBody = (snapshot?.body.trim().length ?? 0) > 0;
      loading = false;
      return;
    }
    if (snapshot?.id === id) {
      task = snapshot;
      showBody = snapshot.body.trim().length > 0;
    }
    void loadTask(id, false);
  });

  $effect(() => {
    const id = taskId;
    const revision = refreshRevision;
    if (id == null || revision === lastRefreshRevision) return;
    lastRefreshRevision = revision;
    void loadTask(id, true);
  });

  async function loadTask(id: number, preserveDrafts: boolean) {
    if (!preserveDrafts) loading = true;
    try {
      const loaded = await getTask(id);
      const preserveBodyDraft = preserveDrafts && (bodyFocused || bodyDirty);
      task = preserveBodyDraft && task ? { ...loaded, body: task.body } : loaded;
      if (!preserveBodyDraft) {
        showBody = loaded.body.trim().length > 0;
      }
    } catch {
      task = null;
      handleClose();
    }
    loading = false;
  }

  let isUnindexed = $derived(task?.id == null);

  let hasUnmatchedStatus = $derived.by(() => {
    if (!task) return false;
    return !hasKnownStatus(columns, task.status);
  });

  let statusOptions = $derived.by(() => {
    if (!task || hasKnownStatus(columns, task.status)) return columns;
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
    saveErrorText = "Save failed";
    setTimeout(() => { saveErrorText = null; }, 3000);
  }

  function handleClose() {
    if (closing) return;
    closing = true;
    setTimeout(() => {
      closing = false;
      onClose();
    }, 120);
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
    if (isUnindexed || !task) return;
    const current = task.priority ?? null;
    const idx = priorityCycle.indexOf(current);
    const next = priorityCycle[(idx + 1) % priorityCycle.length];
    task = { ...task, priority: next };
    saveField({ priority: next });
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

  // Delete (overflow menu flow)
  function toggleOverflow() {
    overflowOpen = !overflowOpen;
    showDeleteConfirm = false;
  }

  async function confirmDelete() {
    if (!task?.id) return;
    try {
      await deleteTask(task.id);
      onTaskUpdated();
      handleClose();
    } catch {
      flashError();
    }
  }

  // Focus trap + keyboard
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      if (overflowOpen) {
        overflowOpen = false;
        showDeleteConfirm = false;
      } else if (editingTitle) {
        cancelTitle();
      } else if (addingTag) {
        addingTag = false;
        tagDraft = "";
      } else {
        handleClose();
      }
      return;
    }

    // Focus trap: Tab cycles within modal
    if (e.key === "Tab" && modalEl) {
      const focusable = modalEl.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  }

  // Close overflow on outside click
  function handleModalClick() {
    if (overflowOpen) {
      overflowOpen = false;
      showDeleteConfirm = false;
    }
  }

  // Build dates line
  let datesLine = $derived.by(() => {
    if (!task) return "";
    const parts: string[] = [];
    if (task.created) parts.push(`Created ${formatDate(task.created)}`);
    if (task.updated) parts.push(`Updated ${formatDate(task.updated)}`);
    if (task.completed) parts.push(`Completed ${formatDate(task.completed)}`);
    return parts.join(" · ");
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px]"
  onkeydown={handleKeydown}
  onclick={handleBackdropClick}
  role="dialog"
  tabindex="-1"
  aria-modal="true"
  bind:this={modalEl}
>
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="task-modal flex max-h-[80vh] w-full max-w-[600px] flex-col overflow-hidden rounded-[12px] border border-border/60 bg-card shadow-[0_12px_36px_-8px_rgba(0,0,0,0.5)]"
    class:error-flash={errorFlash}
    class:task-modal-closing={closing}
    onclick={handleModalClick}
  >
    {#if loading}
      <div class="flex items-center justify-center py-12">
        <span class="font-mono text-[11px] text-muted-foreground animate-pulse">Loading...</span>
      </div>
    {:else if task}
      <!-- Header: ID left, overflow + close right -->
      <div class="flex items-center justify-between border-b border-border/60 px-3 py-1.5">
        <div>
          {#if task.id != null}
            <span class="font-mono text-[10px] text-muted-foreground">#{task.id}</span>
          {/if}
        </div>

        <div class="flex items-center gap-0.5">
          {#if bodyDirty}
            <span class="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/60" title="Unsaved changes"></span>
          {/if}

          {#if !isUnindexed}
            <div class="relative">
              <button
                type="button"
                class="rounded-[4px] p-1 text-muted-foreground transition-colors duration-[120ms] hover:bg-accent hover:text-foreground"
                onclick={(e) => { e.stopPropagation(); toggleOverflow(); }}
                title="More actions"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="5" r="1.5" />
                  <circle cx="12" cy="12" r="1.5" />
                  <circle cx="12" cy="19" r="1.5" />
                </svg>
              </button>

              {#if overflowOpen}
                <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
                <div
                  class="absolute right-0 top-full z-10 mt-1 w-[180px] rounded-[6px] border border-border/60 bg-popover shadow-lg backdrop-blur"
                  onclick={(e) => e.stopPropagation()}
                >
                  {#if showDeleteConfirm}
                    <div class="p-2">
                      <p class="mb-2 font-mono text-[10px] text-muted-foreground">Delete this task?</p>
                      <div class="flex gap-1.5">
                        <button
                          type="button"
                          class="flex-1 rounded-[4px] border border-border px-2 py-1 font-mono text-[10px] text-muted-foreground transition-colors duration-[120ms] hover:bg-accent hover:text-foreground"
                          onclick={() => { showDeleteConfirm = false; }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          class="flex-1 rounded-[4px] bg-destructive px-2 py-1 font-mono text-[10px] text-red-300 transition-colors duration-[120ms] hover:bg-destructive/80"
                          onclick={confirmDelete}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  {:else}
                    <button
                      type="button"
                      class="w-full px-3 py-2 text-left text-[12px] text-red-400 transition-colors duration-[120ms] hover:bg-accent"
                      onclick={() => { showDeleteConfirm = true; }}
                    >
                      Delete task
                    </button>
                  {/if}
                </div>
              {/if}
            </div>
          {/if}

          <button
            type="button"
            class="rounded-[4px] p-1 text-muted-foreground transition-colors duration-[120ms] hover:bg-accent hover:text-foreground"
            onclick={handleClose}
            title="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>

      <div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <!-- Title -->
        <div class="px-4 pt-3 pb-2">
          {#if isUnindexed}
            <div class="mb-2 rounded-[6px] border border-border/60 border-l-2 border-l-priority-medium/60 bg-accent/60 px-2.5 py-2">
              <p class="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">Unindexed</p>
              <p class="mt-0.5 text-[11px] text-muted-foreground">
                Run '<span class="select-all font-mono">untask reindex</span>' in terminal to fix
              </p>
            </div>
          {/if}

          {#if editingTitle}
            <div class="relative">
              <textarea
                bind:value={titleDraft}
                onblur={confirmTitle}
                onkeydown={handleTitleKeydown}
                rows="2"
                class="w-full resize-none bg-transparent text-[16px] font-medium text-foreground/80 outline-none"
                use:focusOnMount
              ></textarea>
            </div>
          {:else}
            {#if isUnindexed}
              <h2 class="break-words text-[16px] font-medium text-foreground">
                {task.title}
              </h2>
            {:else}
              <button
                type="button"
                class="w-full break-words text-left text-[16px] font-medium text-foreground transition-colors duration-[120ms] hover:text-foreground/80"
                onclick={startEditTitle}
              >
                {task.title}
              </button>
            {/if}
          {/if}
        </div>

        <!-- Metadata row: status, priority, tags -->
        <div class="flex max-h-[80px] flex-wrap items-center gap-2 overflow-y-auto px-4 pb-3">
          <!-- Status chip -->
          <select
            class="h-[20px] cursor-pointer rounded-[4px] border border-border/60 bg-card px-1.5 font-mono text-[10px] text-foreground transition-colors duration-[120ms] hover:border-border focus:border-ring focus:outline-none"
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
            class="flex items-center gap-1 rounded-full border border-border/60 px-1.5 py-0.5 transition-colors duration-[120ms] hover:border-border"
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
            <button
              type="button"
              class="flex items-center gap-1 rounded-full border border-border/60 px-1.5 py-0.5 transition-colors duration-[120ms] hover:border-border"
              disabled={isUnindexed}
              onclick={() => removeTag(tag)}
              title={isUnindexed ? tag : "Click to remove"}
            >
              <PriorityDot tone="neutral" />
              <span class="font-mono text-[10px] text-muted-foreground">
                {tag}
              </span>
            </button>
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
                class="w-[80px] rounded-full border border-dashed border-border bg-transparent px-1.5 py-0.5 font-mono text-[10px] text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-ring"
                use:focusOnMount
              />
            {:else}
              <button
                type="button"
                class="flex items-center gap-1 rounded-full border border-dashed border-border/50 px-1.5 py-0.5 transition-colors duration-[120ms] hover:border-border"
                onclick={() => { addingTag = true; }}
              >
                <PriorityDot tone="neutral" />
                <span class="font-mono text-[10px] text-muted-foreground/60">+ tag</span>
              </button>
            {/if}
          {/if}
        </div>

        {#if saveErrorText}
          <div class="px-4 pb-1">
            <span class="font-mono text-[10px] text-red-400">{saveErrorText}</span>
          </div>
        {/if}

        <!-- Subtask progress bar -->
        {#if task.subtask_total > 0}
          <div class="mx-4 mb-2 h-[2px] overflow-hidden rounded-full bg-border">
            <div
              class="h-full rounded-full bg-foreground/60 transition-[width] duration-200"
              style="width: {(task.subtask_done / task.subtask_total) * 100}%"
            ></div>
          </div>
        {/if}

        <!-- Unmatched status warning -->
        {#if hasUnmatchedStatus}
          <div class="mx-4 mb-2 rounded-[6px] border border-border/60 bg-accent/60 px-2.5 py-1.5">
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
              onDirtyChange={(dirty) => { bodyDirty = dirty; }}
              onFocusChange={(focused) => { bodyFocused = focused; }}
            />
          {:else}
            <button
              type="button"
              class="w-full px-4 py-3 text-left font-mono text-[12px] text-muted-foreground/50 transition-colors duration-[120ms] hover:text-muted-foreground"
              disabled={isUnindexed}
              onclick={() => { showBody = true; }}
            >
              Add notes...
            </button>
          {/if}
        </div>

        <!-- Dates footer -->
        {#if datesLine}
          <div class="mt-auto border-t border-border/60 px-4 py-2">
            <p class="font-mono text-[10px] text-muted-foreground/60">{datesLine}</p>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .task-modal {
    animation: modal-in 180ms ease-out both;
  }

  @keyframes modal-in {
    from {
      opacity: 0;
      transform: scale(0.97);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .task-modal-closing {
    animation: modal-out 120ms ease-in both;
  }

  @keyframes modal-out {
    from {
      opacity: 1;
      transform: scale(1);
    }
    to {
      opacity: 0;
      transform: scale(0.98);
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
