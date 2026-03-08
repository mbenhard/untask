<script lang="ts">
  import { Checkbox } from "bits-ui";

  let {
    body,
    readonly = false,
    onBodyChange,
  }: {
    body: string;
    readonly?: boolean;
    onBodyChange: (newBody: string) => void;
  } = $props();

  type Subtask = {
    text: string;
    checked: boolean;
    lineIndex: number;
  };

  function parseSubtasks(b: string): Subtask[] {
    const lines = b.split("\n");
    const result: Subtask[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith("  ") || line.startsWith("\t")) continue;
      const trimmed = line.trimStart();
      if (trimmed.startsWith("- [x]") || trimmed.startsWith("- [X]")) {
        result.push({ text: trimmed.slice(6), checked: true, lineIndex: i });
      } else if (trimmed.startsWith("- [ ]")) {
        result.push({ text: trimmed.slice(6), checked: false, lineIndex: i });
      }
    }
    return result;
  }

  function rebuildBody(subtasks: Subtask[]): string {
    const lines = body.split("\n");
    const originalIndices = new Set(subtasks.map((s) => s.lineIndex));

    // Remove old subtask lines (they'll be replaced in order)
    const nonSubtaskLines: { line: string; index: number }[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (!originalIndices.has(i)) {
        nonSubtaskLines.push({ line: lines[i], index: i });
      }
    }

    // Rebuild: insert new subtask lines where the first subtask used to appear
    const firstSubtaskIndex =
      subtasks.length > 0 ? Math.min(...subtasks.map((s) => s.lineIndex)) : lines.length;

    const newLines: string[] = [];
    let insertedSubtasks = false;

    for (const { line, index } of nonSubtaskLines) {
      if (!insertedSubtasks && index > firstSubtaskIndex) {
        for (const s of subtasks) {
          const prefix = s.checked ? "- [x]" : "- [ ]";
          newLines.push(`${prefix} ${s.text}`);
        }
        insertedSubtasks = true;
      }
      newLines.push(line);
    }

    if (!insertedSubtasks) {
      for (const s of subtasks) {
        const prefix = s.checked ? "- [x]" : "- [ ]";
        newLines.push(`${prefix} ${s.text}`);
      }
    }

    return newLines.join("\n");
  }

  function addSubtask(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const lines = body.split("\n");
    const newLine = `- [ ] ${trimmed}`;
    // Find position of last subtask line to insert after it
    let lastSubtaskIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith("  ") || lines[i].startsWith("\t")) continue;
      const t = lines[i].trim();
      if (t.startsWith("- [x]") || t.startsWith("- [X]") || t.startsWith("- [ ]")) {
        lastSubtaskIdx = i;
      }
    }
    if (lastSubtaskIdx >= 0) {
      lines.splice(lastSubtaskIdx + 1, 0, newLine);
    } else {
      // Append after a blank line at end
      if (lines.length > 0 && lines[lines.length - 1].trim() !== "") {
        lines.push("");
      }
      lines.push(newLine);
    }
    onBodyChange(lines.join("\n"));
  }

  function toggleSubtask(subtask: Subtask) {
    const lines = body.split("\n");
    const line = lines[subtask.lineIndex];
    if (subtask.checked) {
      lines[subtask.lineIndex] = line.replace(/^- \[[xX]\]/, "- [ ]");
    } else {
      lines[subtask.lineIndex] = line.replace(/^- \[ \]/, "- [x]");
    }
    onBodyChange(lines.join("\n"));
  }

  function deleteSubtask(subtask: Subtask) {
    const lines = body.split("\n");
    lines.splice(subtask.lineIndex, 1);
    onBodyChange(lines.join("\n"));
  }

  function updateSubtaskText(subtask: Subtask, newText: string) {
    const trimmed = newText.trim();
    if (!trimmed) {
      deleteSubtask(subtask);
      return;
    }
    const lines = body.split("\n");
    const prefix = subtask.checked ? "- [x]" : "- [ ]";
    lines[subtask.lineIndex] = `${prefix} ${trimmed}`;
    onBodyChange(lines.join("\n"));
  }

  function moveSubtask(fromIndex: number, toIndex: number) {
    const tasks = parseSubtasks(body);
    if (toIndex < 0 || toIndex >= tasks.length) return;
    const moved = tasks.splice(fromIndex, 1)[0];
    tasks.splice(toIndex, 0, moved);
    onBodyChange(rebuildBody(tasks));
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

  function startEdit(index: number, text: string) {
    if (readonly) return;
    editingIndex = index;
    editDraft = text;
  }

  function confirmEdit(subtask: Subtask) {
    updateSubtaskText(subtask, editDraft);
    editingIndex = null;
    editDraft = "";
  }

  function cancelEdit() {
    editingIndex = null;
    editDraft = "";
  }

  function handleEditKeydown(e: KeyboardEvent, subtask: Subtask) {
    if (e.key === "Enter") {
      e.preventDefault();
      confirmEdit(subtask);
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
  <div class="mx-4 mb-2 rounded-[6px] border border-border/60">
    <!-- Header -->
    <div class="flex items-center gap-2 px-2.5 py-1.5">
      <span class="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/60">
        Subtasks
      </span>
      {#if total > 0}
        <div class="flex flex-1 items-center gap-2">
          <div class="h-[2px] flex-1 overflow-hidden rounded-full bg-border">
            <div
              class="h-full rounded-full bg-foreground/60 transition-[width] duration-[120ms]"
              style="width: {progressPct}%"
            ></div>
          </div>
          <span class="font-mono text-[10px] text-muted-foreground/50">{done}/{total}</span>
        </div>
      {/if}
    </div>

    <!-- Subtask rows -->
    {#each subtasks as subtask, i (subtask.lineIndex)}
      <div
        role="row"
        tabindex="0"
        class="group flex min-h-[28px] items-center gap-1.5 border-t border-border/40 px-2.5 py-1 outline-none transition-colors duration-[120ms] focus-visible:bg-accent/30 {dragOverIndex === i && dragFromIndex !== i ? 'bg-accent/40' : ''}"
        draggable={!readonly && editingIndex !== i}
        ondragstart={(e) => onDragStart(e, i)}
        ondragover={(e) => onDragOver(e, i)}
        ondrop={(e) => onDrop(e, i)}
        ondragend={onDragEnd}
        onkeydown={(e) => handleRowKeydown(e, i)}
      >
        <!-- Drag handle -->
        {#if !readonly}
          <span
            class="cursor-grab opacity-0 transition-opacity duration-[120ms] group-hover:opacity-100 text-muted-foreground/30 select-none"
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

        <!-- Checkbox -->
        <Checkbox.Root
          checked={subtask.checked}
          disabled={readonly}
          onCheckedChange={() => toggleSubtask(subtask)}
          class="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border transition-colors duration-[120ms] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed {subtask.checked ? 'border-foreground/80 bg-foreground/80' : 'border-border bg-transparent'}"
        >
          {#snippet children({ checked })}
            {#if checked}
              <Checkbox.Indicator>
                <svg width="9" height="7" viewBox="0 0 9 7" fill="none" class="text-primary-foreground">
                  <path d="M1 3.5L3.5 6L8 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </Checkbox.Indicator>
            {/if}
          {/snippet}
        </Checkbox.Root>

        <!-- Text -->
        <div class="flex-1 min-w-0">
          {#if editingIndex === i}
            <input
              type="text"
              bind:value={editDraft}
              onblur={() => confirmEdit(subtask)}
              onkeydown={(e) => handleEditKeydown(e, subtask)}
              class="w-full bg-transparent font-mono text-[11px] text-foreground outline-none"
              autofocus
            />
          {:else}
            <button
              type="button"
              class="w-full text-left font-mono text-[11px] leading-relaxed {subtask.checked ? 'text-muted-foreground/40 line-through' : 'text-foreground'} disabled:cursor-default"
              disabled={readonly}
              ondblclick={() => startEdit(i, subtask.text)}
            >
              {subtask.text}
            </button>
          {/if}
        </div>

        <!-- Delete -->
        {#if !readonly && editingIndex !== i}
          <button
            type="button"
            aria-label="Delete subtask"
            class="ml-1 shrink-0 opacity-0 transition-opacity duration-[120ms] group-hover:opacity-100 text-muted-foreground/40 hover:text-red-400"
            onclick={() => deleteSubtask(subtask)}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        {/if}
      </div>
    {/each}

    <!-- Add input / button -->
    {#if !readonly}
      {#if addingSubtask}
        <div class="border-t border-border/40 px-2.5 py-1.5">
          <input
            bind:this={addInputEl}
            type="text"
            bind:value={addDraft}
            placeholder="New subtask..."
            onblur={confirmAdd}
            onkeydown={handleAddKeydown}
            class="w-full rounded-[4px] border border-dashed border-border/60 bg-transparent px-2 py-0.5 font-mono text-[11px] text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-border"
          />
        </div>
      {:else}
        <div class="border-t border-border/40 px-2.5 py-1">
          <button
            type="button"
            class="rounded-[4px] border border-dashed border-border/60 px-2 py-0.5 font-mono text-[10px] text-muted-foreground/50 transition-colors duration-[120ms] hover:border-border hover:text-muted-foreground"
            onclick={openAddInput}
          >
            + subtask
          </button>
        </div>
      {/if}
    {/if}
  </div>
{/if}
