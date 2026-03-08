<script lang="ts">
  import { Checkbox } from "bits-ui";
  import {
    addSubtaskToBody,
    deleteSubtaskFromBody,
    parseSubtasks,
    reorderSubtasksInBody,
    toggleSubtaskInBody,
    updateSubtaskTextInBody,
    type Subtask,
  } from "$lib/subtasks";

  let {
    body,
    readonly = false,
    onBodyChange,
  }: {
    body: string;
    readonly?: boolean;
    onBodyChange: (newBody: string) => void;
  } = $props();

  function addSubtask(text: string) {
    onBodyChange(addSubtaskToBody(body, text));
  }

  function toggleSubtask(index: number) {
    onBodyChange(toggleSubtaskInBody(body, index));
  }

  function deleteSubtask(index: number) {
    onBodyChange(deleteSubtaskFromBody(body, index));
  }

  function moveSubtask(fromIndex: number, toIndex: number) {
    onBodyChange(reorderSubtasksInBody(body, fromIndex, toIndex));
  }

  let subtasks = $derived(parseSubtasks(body));
  let done = $derived(subtasks.filter((s) => s.checked).length);
  let total = $derived(subtasks.length);
  let progressPct = $derived(total > 0 ? (done / total) * 100 : 0);

  let editingIndex = $state<number | null>(null);
  let editDraft = $state("");
  let addingSubtask = $state(false);
  let addDraft = $state("");
  let addInputEl = $state<HTMLInputElement | null>(null);

  let dragFromIndex = $state<number | null>(null);
  let dragOverIndex = $state<number | null>(null);

  function focusOnMount(el: HTMLElement) {
    requestAnimationFrame(() => {
      el.focus();
      if (el instanceof HTMLInputElement) {
        el.select();
      }
    });
  }

  function startEdit(index: number) {
    if (readonly) return;
    editingIndex = index;
    editDraft = subtasks[index]?.text ?? "";
  }

  function confirmEdit(index: number) {
    onBodyChange(updateSubtaskTextInBody(body, index, editDraft));
    editingIndex = null;
    editDraft = "";
  }

  function cancelEdit() {
    editingIndex = null;
    editDraft = "";
  }

  function handleEditKeydown(e: KeyboardEvent, index: number) {
    if (e.key === "Enter") {
      e.preventDefault();
      confirmEdit(index);
    } else if (e.key === "Escape") {
      cancelEdit();
    }
  }

  function handleRowKeydown(e: KeyboardEvent, index: number) {
    if (e.altKey && e.key === "ArrowUp") {
      e.preventDefault();
      moveSubtask(index, index - 1);
    } else if (e.altKey && e.key === "ArrowDown") {
      e.preventDefault();
      moveSubtask(index, index + 1);
    }
  }

  function openAddInput() {
    addingSubtask = true;
    addDraft = "";
    requestAnimationFrame(() => addInputEl?.focus());
  }

  function confirmAdd() {
    const trimmed = addDraft.trim();
    if (trimmed) {
      addSubtask(trimmed);
      addDraft = "";
      // Rapid entry: stay open
      requestAnimationFrame(() => addInputEl?.focus());
    } else {
      addingSubtask = false;
    }
  }

  function cancelAdd() {
    addingSubtask = false;
    addDraft = "";
  }

  function handleAddKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      confirmAdd();
    } else if (e.key === "Escape") {
      cancelAdd();
    }
  }

  function onDragStart(e: DragEvent, index: number) {
    dragFromIndex = index;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
    }
  }

  function onDragOver(e: DragEvent, index: number) {
    e.preventDefault();
    dragOverIndex = index;
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "move";
    }
  }

  function onDrop(e: DragEvent, index: number) {
    e.preventDefault();
    if (dragFromIndex !== null && dragFromIndex !== index) {
      moveSubtask(dragFromIndex, index);
    }
    dragFromIndex = null;
    dragOverIndex = null;
  }

  function onDragEnd() {
    dragFromIndex = null;
    dragOverIndex = null;
  }

  let visible = $derived(!readonly || total > 0);
</script>

{#if visible}
  <div class="mx-4 mb-2 overflow-hidden rounded-[6px] border border-border/60">
    <div class="flex items-center gap-2 border-b border-border/40 px-2.5 py-1.5">
      <span class="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/60">
        Subtasks
      </span>
      {#if total > 0}
        <div class="flex flex-1 items-center gap-2">
          <div class="h-px flex-1 overflow-hidden rounded-full bg-border/70">
            <div
              class="h-full rounded-full bg-foreground/55 transition-[width] duration-[120ms]"
              style="width: {progressPct}%"
            ></div>
          </div>
          <span class="font-mono text-[10px] text-muted-foreground/50">{done}/{total}</span>
        </div>
      {/if}
    </div>

    {#each subtasks as subtask, i (subtask.lineIndex)}
      <div
        role="row"
        tabindex="0"
        class="group flex min-h-[28px] items-center gap-1.5 border-b border-border/40 px-2 py-1 outline-none transition-colors duration-[120ms] focus-visible:bg-accent/20 {dragOverIndex === i && dragFromIndex !== i ? 'bg-accent/25' : ''} {dragFromIndex === i ? 'opacity-55' : ''}"
        draggable={!readonly && editingIndex !== i}
        ondragstart={(e) => onDragStart(e, i)}
        ondragover={(e) => onDragOver(e, i)}
        ondrop={(e) => onDrop(e, i)}
        ondragend={onDragEnd}
        onkeydown={(e) => handleRowKeydown(e, i)}
      >
        {#if !readonly}
          <span
            class="select-none text-muted-foreground/30 opacity-0 transition-opacity duration-[120ms] group-hover:opacity-100"
            aria-hidden="true"
          >
            <svg width="10" height="14" viewBox="0 0 10 14" fill="none">
              <circle cx="3" cy="2.5" r="1" fill="currentColor" />
              <circle cx="7" cy="2.5" r="1" fill="currentColor" />
              <circle cx="3" cy="7" r="1" fill="currentColor" />
              <circle cx="7" cy="7" r="1" fill="currentColor" />
              <circle cx="3" cy="11.5" r="1" fill="currentColor" />
              <circle cx="7" cy="11.5" r="1" fill="currentColor" />
            </svg>
          </span>
        {/if}

        <Checkbox.Root
          checked={subtask.checked}
          disabled={readonly}
          onCheckedChange={() => toggleSubtask(i)}
          class="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border transition-colors duration-[120ms] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed {subtask.checked ? 'border-foreground/65 bg-foreground/70 text-background' : 'border-border/80 bg-transparent text-foreground'}"
        >
          {#snippet children({ checked })}
            {#if checked}
              <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                <path d="M1 3.5L3.5 6L8 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            {/if}
          {/snippet}
        </Checkbox.Root>

        <div class="min-w-0 flex-1">
          {#if editingIndex === i}
            <input
              type="text"
              bind:value={editDraft}
              onblur={() => confirmEdit(i)}
              onkeydown={(e) => handleEditKeydown(e, i)}
              class="w-full bg-transparent text-[12px] leading-[1.35] text-foreground outline-none"
              use:focusOnMount
            />
          {:else}
            <button
              type="button"
              class="w-full text-left text-[12px] leading-[1.35] {subtask.checked ? 'text-muted-foreground/45 line-through' : 'text-foreground/90'} disabled:cursor-default"
              disabled={readonly}
              ondblclick={() => startEdit(i)}
            >
              {subtask.text}
            </button>
          {/if}
        </div>

        {#if !readonly && editingIndex !== i}
          <button
            type="button"
            aria-label="Delete subtask"
            class="ml-1 shrink-0 text-muted-foreground/35 opacity-0 transition-[opacity,color] duration-[120ms] group-hover:opacity-100 hover:text-red-400"
            onclick={() => deleteSubtask(i)}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        {/if}
      </div>
    {/each}

    {#if !readonly}
      {#if addingSubtask}
        <div class="px-2 py-1.5">
          <input
            bind:this={addInputEl}
            type="text"
            bind:value={addDraft}
            placeholder="New subtask..."
            onblur={confirmAdd}
            onkeydown={handleAddKeydown}
            class="w-full rounded-[4px] border border-dashed border-border/60 bg-transparent px-2 py-1 text-[12px] text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-border"
          />
        </div>
      {:else}
        <div class="px-2 py-1.5">
          <button
            type="button"
            class="rounded-[4px] border border-dashed border-border/60 px-2 py-1 font-mono text-[10px] text-muted-foreground/55 transition-colors duration-[120ms] hover:border-border hover:text-muted-foreground"
            onclick={openAddInput}
          >
            + subtask
          </button>
        </div>
      {/if}
    {/if}
  </div>
{/if}
