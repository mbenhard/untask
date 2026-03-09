# Subtask Management UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add interactive subtask management (create, check off, reorder, delete) directly in the task modal.

**Architecture:** Subtasks are already stored as markdown checklist items (`- [ ]` / `- [x]`) in the task body. The Rust backend's `count_subtasks()` already parses these. This feature is purely frontend — a new `SubtaskList.svelte` component that parses checklist lines from the body, renders them interactively, and reconstructs the body on changes. No backend changes needed.

**Tech Stack:** Svelte 5, Bits UI (for Checkbox), Tailwind CSS, HTML5 Drag and Drop API

---

### Task 1: Create SubtaskList component — parse, render, toggle

**Files:**
- Create: `apps/desktop/src/lib/components/SubtaskList.svelte`
- Reference: `crates/unship-core/src/task.rs:164-182` (count_subtasks logic to mirror)

**Context:** Subtasks in the markdown body are top-level lines matching `- [ ] text` (unchecked) or `- [x] text` / `- [X] text` (checked). Lines indented with spaces or tabs are nested and should be ignored. The component receives the full body string, parses out checklist items with their line indices, and emits the modified body on changes.

**Step 1: Create the component with parsing logic and checkbox rendering**

```svelte
<!-- apps/desktop/src/lib/components/SubtaskList.svelte -->
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
    done: boolean;
    lineIndex: number;
  };

  let subtasks = $derived.by(() => parseSubtasks(body));

  function parseSubtasks(body: string): Subtask[] {
    const lines = body.split("\n");
    const result: Subtask[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip indented lines (not top-level)
      if (line.startsWith("  ") || line.startsWith("\t")) continue;
      const trimmed = line.trimStart();
      if (trimmed.startsWith("- [x] ") || trimmed.startsWith("- [X] ")) {
        result.push({ text: trimmed.slice(6), done: true, lineIndex: i });
      } else if (trimmed.startsWith("- [ ] ")) {
        result.push({ text: trimmed.slice(6), done: false, lineIndex: i });
      }
    }
    return result;
  }

  function rebuildBody(updatedSubtasks: Subtask[]): string {
    const lines = body.split("\n");
    // Build a map from lineIndex to new line content
    const lineMap = new Map<number, string>();
    for (const st of updatedSubtasks) {
      lineMap.set(st.lineIndex, `- [${st.done ? "x" : " "}] ${st.text}`);
    }
    return lines.map((line, i) => lineMap.has(i) ? lineMap.get(i)! : line).join("\n");
  }

  function toggle(index: number) {
    if (readonly) return;
    const updated = subtasks.map((st, i) =>
      i === index ? { ...st, done: !st.done } : st,
    );
    onBodyChange(rebuildBody(updated));
  }
</script>
```

**Step 2: Add the template with design-language-compliant styling**

Design language rules applied:
- Section label: 10px mono uppercase tracking `0.06em` (`text-muted-foreground/60`)
- Rows: compact, ~28px height, border separators
- Checkboxes: monochrome, thin border when unchecked, filled foreground when checked
- Done text: `line-through text-muted-foreground/50`
- Count badge: 10px mono in `text-muted-foreground`

Add this template below the `</script>` tag:

```svelte
{#if subtasks.length > 0}
  <div class="mx-4 mb-2">
    <div class="flex items-center justify-between mb-1">
      <span class="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/60">
        Subtasks
      </span>
      <span class="font-mono text-[10px] text-muted-foreground/50">
        {subtasks.filter(s => s.done).length}/{subtasks.length}
      </span>
    </div>
    <div class="rounded-[6px] border border-border/60">
      {#each subtasks as subtask, i}
        {#if i > 0}
          <div class="border-t border-border/40"></div>
        {/if}
        <div class="group flex items-center gap-2 px-2 py-1 min-h-[28px]">
          <Checkbox.Root
            checked={subtask.done}
            disabled={readonly}
            onCheckedChange={() => toggle(i)}
            class="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border transition-colors duration-[120ms] {subtask.done ? 'border-foreground/40 bg-foreground/80' : 'border-border hover:border-muted-foreground/60'}"
          >
            {#if subtask.done}
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary-foreground)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            {/if}
          </Checkbox.Root>
          <span
            class="flex-1 text-[12px] leading-tight {subtask.done ? 'line-through text-muted-foreground/40' : 'text-foreground/90'}"
          >
            {subtask.text}
          </span>
        </div>
      {/each}
    </div>
  </div>
{/if}
```

**Step 3: Verify it renders**

Run: `pnpm tauri dev` (in `apps/desktop/`)

Manual verification:
1. Open a task that has checklist items in its body (e.g., `- [ ] First` / `- [x] Second`)
2. Verify the SubtaskList renders above the body editor
3. Verify clicking a checkbox toggles the done state
4. Verify the progress count updates
5. Verify the body markdown is updated (check by reopening the task)

**Step 4: Commit**

```bash
git add apps/desktop/src/lib/components/SubtaskList.svelte
git commit -m "feat: add SubtaskList component with parse and toggle"
```

---

### Task 2: Add delete and inline edit functionality

**Files:**
- Modify: `apps/desktop/src/lib/components/SubtaskList.svelte`

**Step 1: Add delete functionality**

Add a delete button that appears on hover (right side of each row). Uses a small `×` icon, `text-muted-foreground/40` becoming `text-red-400` on hover. The delete function removes the line from the body entirely.

Add these functions to the `<script>` section:

```typescript
function deleteSubtask(index: number) {
  if (readonly) return;
  const lines = body.split("\n");
  const targetLine = subtasks[index].lineIndex;
  lines.splice(targetLine, 1);
  onBodyChange(lines.join("\n"));
}
```

Add the delete button inside each subtask row, after the `<span>` text:

```svelte
{#if !readonly}
  <button
    type="button"
    class="opacity-0 group-hover:opacity-100 shrink-0 rounded-[3px] p-0.5 text-muted-foreground/40 transition-all duration-[120ms] hover:text-red-400"
    onclick={() => deleteSubtask(i)}
    title="Remove subtask"
  >
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  </button>
{/if}
```

**Step 2: Add inline text editing**

Allow double-clicking a subtask to edit its text inline. Add state for editing:

```typescript
let editingIndex = $state<number | null>(null);
let editDraft = $state("");

function startEdit(index: number) {
  if (readonly) return;
  editingIndex = index;
  editDraft = subtasks[index].text;
}

function confirmEdit() {
  if (editingIndex == null) return;
  const trimmed = editDraft.trim();
  if (!trimmed) {
    // Empty text = delete the subtask
    deleteSubtask(editingIndex);
  } else {
    const updated = subtasks.map((st, i) =>
      i === editingIndex ? { ...st, text: trimmed } : st,
    );
    onBodyChange(rebuildBody(updated));
  }
  editingIndex = null;
  editDraft = "";
}

function cancelEdit() {
  editingIndex = null;
  editDraft = "";
}
```

Replace the text `<span>` with a conditional that shows an input when editing:

```svelte
{#if editingIndex === i}
  <input
    type="text"
    bind:value={editDraft}
    onblur={confirmEdit}
    onkeydown={(e) => {
      if (e.key === "Enter") { e.preventDefault(); confirmEdit(); }
      else if (e.key === "Escape") cancelEdit();
    }}
    class="flex-1 bg-transparent text-[12px] leading-tight text-foreground outline-none"
    use:focusOnMount
  />
{:else}
  <button
    type="button"
    class="flex-1 text-left text-[12px] leading-tight {subtask.done ? 'line-through text-muted-foreground/40' : 'text-foreground/90'}"
    ondblclick={() => startEdit(i)}
  >
    {subtask.text}
  </button>
{/if}
```

Note: Need to import or inline a `focusOnMount` action. Simplest is to add to the component:

```typescript
function focusOnMount(el: HTMLElement) {
  requestAnimationFrame(() => {
    el.focus();
    if (el instanceof HTMLInputElement) el.select();
  });
}
```

**Step 3: Verify**

Manual verification:
1. Hover over a subtask row → delete button appears
2. Click delete → subtask removed, body updated
3. Double-click subtask text → inline edit mode
4. Press Enter → saves edit
5. Press Escape → cancels edit
6. Clear text and confirm → deletes subtask

**Step 4: Commit**

```bash
git add apps/desktop/src/lib/components/SubtaskList.svelte
git commit -m "feat: add subtask delete and inline edit"
```

---

### Task 3: Add subtask creation (add new)

**Files:**
- Modify: `apps/desktop/src/lib/components/SubtaskList.svelte`

**Step 1: Add the "add subtask" input**

The add input appears at the bottom of the subtask list. Design: dashed border input matching the `+ tag` pattern from TaskModal (dashed border, 10px mono, muted placeholder).

Add state and function:

```typescript
let adding = $state(false);
let addDraft = $state("");

function addSubtask() {
  const trimmed = addDraft.trim();
  if (!trimmed) { adding = false; return; }
  // Append checklist item to the body
  const newLine = `- [ ] ${trimmed}`;
  const newBody = body.trimEnd() ? body.trimEnd() + "\n" + newLine : newLine;
  onBodyChange(newBody);
  addDraft = "";
  // Keep adding mode open for rapid entry
}

function handleAddKeydown(e: KeyboardEvent) {
  if (e.key === "Enter") {
    e.preventDefault();
    addSubtask();
  } else if (e.key === "Escape") {
    adding = false;
    addDraft = "";
  }
}
```

**Step 2: Add the template for the add button/input**

This goes after the subtask list `</div>`, but still inside the outer wrapper. Also, show the add button even when there are no subtasks yet (so users can create the first one):

```svelte
{#if !readonly}
  <div class="mx-4 mb-2">
    {#if subtasks.length === 0}
      <div class="flex items-center justify-between mb-1">
        <span class="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/60">
          Subtasks
        </span>
      </div>
    {/if}
    {#if adding}
      <div class="flex items-center gap-2 {subtasks.length > 0 ? 'mt-1' : ''}">
        <input
          type="text"
          bind:value={addDraft}
          onblur={() => { if (!addDraft.trim()) adding = false; else addSubtask(); }}
          onkeydown={handleAddKeydown}
          placeholder="subtask..."
          class="h-[28px] flex-1 rounded-[4px] border border-dashed border-border/60 bg-transparent px-2 font-mono text-[11px] text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-border"
          use:focusOnMount
        />
      </div>
    {:else}
      <button
        type="button"
        class="flex h-[24px] items-center rounded-[4px] border border-dashed border-border/60 px-2 font-mono text-[10px] text-muted-foreground/50 transition-colors duration-[120ms] hover:border-border hover:text-muted-foreground {subtasks.length > 0 ? 'mt-1' : ''}"
        onclick={() => { adding = true; }}
      >
        + subtask
      </button>
    {/if}
  </div>
{/if}
```

**Step 3: Verify**

Manual verification:
1. Open a task with no subtasks → "SUBTASKS" header + `+ subtask` button visible
2. Click `+ subtask` → input appears
3. Type text, press Enter → subtask added to body, input stays open for rapid entry
4. Press Escape → input closes
5. Open task with existing subtasks → `+ subtask` appears below the list
6. Verify body markdown is correct (check by looking at the Milkdown editor below)

**Step 4: Commit**

```bash
git add apps/desktop/src/lib/components/SubtaskList.svelte
git commit -m "feat: add subtask creation input"
```

---

### Task 4: Add drag-and-drop reorder

**Files:**
- Modify: `apps/desktop/src/lib/components/SubtaskList.svelte`

**Step 1: Add drag state and handlers**

Use HTML5 drag and drop API. Add a drag handle on the left of each row. Design: 6-dot grip icon, `text-muted-foreground/30`, visible on hover.

Add state and functions:

```typescript
let dragIndex = $state<number | null>(null);
let dragOverIndex = $state<number | null>(null);

function handleDragStart(e: DragEvent, index: number) {
  if (readonly) return;
  dragIndex = index;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
  }
}

function handleDragOver(e: DragEvent, index: number) {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  dragOverIndex = index;
}

function handleDragLeave() {
  dragOverIndex = null;
}

function handleDrop(e: DragEvent, targetIndex: number) {
  e.preventDefault();
  dragOverIndex = null;
  if (dragIndex == null || dragIndex === targetIndex) {
    dragIndex = null;
    return;
  }
  reorderSubtasks(dragIndex, targetIndex);
  dragIndex = null;
}

function handleDragEnd() {
  dragIndex = null;
  dragOverIndex = null;
}

function reorderSubtasks(fromIndex: number, toIndex: number) {
  const lines = body.split("\n");
  const fromLine = subtasks[fromIndex].lineIndex;
  const toLine = subtasks[toIndex].lineIndex;

  // Remove the source line
  const [removed] = lines.splice(fromLine, 1);
  // Adjust target index if source was before target
  const adjustedTarget = fromLine < toLine ? toLine - 1 : toLine;
  lines.splice(adjustedTarget, 0, removed);

  onBodyChange(lines.join("\n"));
}
```

**Step 2: Update the row template with drag attributes**

Update each subtask row `<div>` to include drag handlers and the grip handle:

```svelte
<div
  class="group flex items-center gap-1.5 px-1.5 py-1 min-h-[28px] transition-colors duration-[120ms] {dragOverIndex === i ? 'bg-accent/60' : ''} {dragIndex === i ? 'opacity-40' : ''}"
  draggable={!readonly && editingIndex !== i}
  ondragstart={(e) => handleDragStart(e, i)}
  ondragover={(e) => handleDragOver(e, i)}
  ondragleave={handleDragLeave}
  ondrop={(e) => handleDrop(e, i)}
  ondragend={handleDragEnd}
>
  <!-- Drag handle -->
  {#if !readonly}
    <span class="cursor-grab opacity-0 group-hover:opacity-100 shrink-0 text-muted-foreground/30 transition-opacity duration-[120ms]">
      <svg width="8" height="10" viewBox="0 0 8 10" fill="currentColor">
        <circle cx="2" cy="2" r="1" />
        <circle cx="6" cy="2" r="1" />
        <circle cx="2" cy="5" r="1" />
        <circle cx="6" cy="5" r="1" />
        <circle cx="2" cy="8" r="1" />
        <circle cx="6" cy="8" r="1" />
      </svg>
    </span>
  {/if}
  <!-- ... checkbox, text, delete button ... -->
</div>
```

**Step 3: Verify**

Manual verification:
1. Hover over a subtask → drag handle (6 dots) appears on left
2. Drag a subtask to a new position → body lines reorder correctly
3. Drop indicator shows on target row
4. Dragged item has reduced opacity during drag
5. Verify body markdown order matches visual order after drop

**Step 4: Commit**

```bash
git add apps/desktop/src/lib/components/SubtaskList.svelte
git commit -m "feat: add subtask drag-and-drop reorder"
```

---

### Task 5: Integrate SubtaskList into TaskModal

**Files:**
- Modify: `apps/desktop/src/lib/components/TaskModal.svelte:1-636`

**Step 1: Import the component**

Add to the imports at the top of `TaskModal.svelte`:

```typescript
import SubtaskList from "$lib/components/SubtaskList.svelte";
```

**Step 2: Add the subtask body change handler**

Add this function in the `<script>` section (near the other save functions):

```typescript
function handleSubtaskBodyChange(newBody: string) {
  if (!task || isUnindexed) return;
  // If agent sections exist, we need to reconstruct the full body
  if (hasAgentSections) {
    let full = newBody.trimEnd();
    if (parsedBody.agentSummary != null) {
      full += "\n\n## Agent Summary\n" + parsedBody.agentSummary;
    }
    if (parsedBody.deferred != null) {
      full += "\n\n## Deferred\n" + parsedBody.deferred;
    }
    if (parsedBody.reviewNotes != null) {
      full += "\n\n## Review Notes\n" + parsedBody.reviewNotes;
    }
    full += "\n";
    saveField({ body: full });
  } else {
    saveField({ body: newBody });
  }
}
```

**Step 3: Replace the progress bar with the SubtaskList component**

In the template, replace the progress bar section (lines 624-636):

```svelte
<!-- OLD: Subtask progress bar -->
{#if task.subtask_total > 0}
  <Progress.Root ...>
    ...
  </Progress.Root>
{/if}
```

With:

```svelte
<!-- Subtask management -->
<SubtaskList
  body={hasAgentSections ? parsedBody.description : task.body}
  readonly={isUnindexed}
  onBodyChange={handleSubtaskBodyChange}
/>
```

**Step 4: Add a thin progress bar inside SubtaskList**

The progress bar should be part of the SubtaskList component header (between the "SUBTASKS" label and the count). Update SubtaskList to include it:

In SubtaskList.svelte, after the count `<span>`, add a thin inline progress bar:

```svelte
<div class="flex items-center justify-between mb-1">
  <span class="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/60">
    Subtasks
  </span>
  <div class="flex items-center gap-1.5">
    {#if subtasks.length > 0}
      <div class="h-[2px] w-12 overflow-hidden rounded-full bg-border">
        <div
          class="h-full rounded-full bg-foreground/60 transition-[width] duration-200"
          style="width: {(subtasks.filter(s => s.done).length / subtasks.length) * 100}%"
        ></div>
      </div>
    {/if}
    <span class="font-mono text-[10px] text-muted-foreground/50">
      {subtasks.filter(s => s.done).length}/{subtasks.length}
    </span>
  </div>
</div>
```

**Step 5: Clean up unused Progress import**

If the Progress component is no longer used anywhere in TaskModal.svelte, remove it from the import:

```typescript
// Change:
import { AlertDialog, Dialog, Progress } from "bits-ui";
// To:
import { AlertDialog, Dialog } from "bits-ui";
```

Check if Progress is used in Kanban.svelte or elsewhere — it is, so only remove from TaskModal.

**Step 6: Verify full integration**

Run: `pnpm tauri dev` (in `apps/desktop/`)

Manual verification checklist:
1. Open a task with existing checklist items → SubtaskList renders with checkboxes
2. Toggle checkboxes → body updates, subtask_done/subtask_total recalculates on save
3. Add new subtask → appears in list, body updated
4. Delete a subtask → removed from list and body
5. Reorder subtasks via drag → body lines reorder
6. Double-click to edit text → inline edit works
7. Open a task with NO subtasks → "SUBTASKS" label + `+ subtask` button shown
8. Open a task with agent sections → subtasks parsed only from description portion
9. Progress bar in Kanban cards still works (it reads from `subtask_done`/`subtask_total` fields)
10. Unindexed tasks show subtasks as readonly (no add/delete/reorder)

**Step 7: Commit**

```bash
git add apps/desktop/src/lib/components/TaskModal.svelte apps/desktop/src/lib/components/SubtaskList.svelte
git commit -m "feat: integrate subtask management UI into task modal"
```

---

### Task 6: Final polish and edge cases

**Files:**
- Modify: `apps/desktop/src/lib/components/SubtaskList.svelte`

**Step 1: Handle keyboard shortcuts for accessibility**

Add keyboard support for reordering (Alt+Up / Alt+Down while focused on a subtask):

```typescript
function handleSubtaskKeydown(e: KeyboardEvent, index: number) {
  if (e.altKey && e.key === "ArrowUp" && index > 0) {
    e.preventDefault();
    reorderSubtasks(index, index - 1);
  } else if (e.altKey && e.key === "ArrowDown" && index < subtasks.length - 1) {
    e.preventDefault();
    reorderSubtasks(index, index + 1);
  }
}
```

Wire this to the subtask text button's `onkeydown`.

**Step 2: Hide "SUBTASKS" header and add button when readonly and no subtasks**

Wrap the entire component output in a condition:

```svelte
{#if subtasks.length > 0 || !readonly}
  <!-- ... entire subtask UI ... -->
{/if}
```

**Step 3: Verify edge cases**

Manual verification:
1. Task with empty body → `+ subtask` button shown, clicking it works
2. Task with only description text (no checklists) → `+ subtask` button shown
3. Task with mixed content (description + checklists interspersed) → only top-level checklists shown
4. Task body with only agent sections and no description → handled correctly
5. Rapid add: add 5 subtasks quickly → all appear correctly
6. Reorder with keyboard: Alt+Up/Down moves items
7. Very long subtask text → text truncates or wraps correctly

**Step 4: Commit**

```bash
git add apps/desktop/src/lib/components/SubtaskList.svelte
git commit -m "feat: add subtask keyboard reorder and edge case handling"
```
