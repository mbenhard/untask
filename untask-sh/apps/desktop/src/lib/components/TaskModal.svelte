<script lang="ts">
  import { AlertDialog, Dialog } from "bits-ui";
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
  import SubtaskList from "$lib/components/SubtaskList.svelte";
  import MetaSelect from "$lib/components/ui/MetaSelect.svelte";
  import MetaTooltip from "$lib/components/ui/MetaTooltip.svelte";
  import { hasKnownStatus } from "$lib/utils";

  let {
    taskId,
    initialTask = null,
    columns,
    refreshRevision = 0,
    onClosingStart,
    onClose,
    onTaskUpdated,
  }: {
    taskId: number | null;
    initialTask?: TaskDto | null;
    columns: ColumnDto[];
    refreshRevision?: number;
    onClosingStart: () => void;
    onClose: () => void;
    onTaskUpdated: () => void;
  } = $props();

  let task = $state<TaskDto | null>(null);
  let loading = $state(true);
  let editingTitle = $state(false);
  let titleDraft = $state("");
  let showDeleteConfirm = $state(false);
  let dateIndex = $state(0);
  let copyFeedback = $state(false);
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
  let kickBackOpen = $state(false);
  let kickBackNotes = $state("");
  const closeAnimationMs = 220;
  let overlayClass = $derived(
    `task-modal-shell fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px]${
      closing ? " task-modal-shell-closing" : ""
    }`,
  );
  let contentClass = $derived(
    `task-modal fixed left-1/2 top-1/2 z-50 flex max-h-[80vh] w-full max-w-[600px] flex-col overflow-hidden rounded-[12px] border border-border/60 bg-card shadow-[0_12px_36px_-8px_rgba(0,0,0,0.5)]${
      errorFlash ? " error-flash" : ""
    }${closing ? " task-modal-closing" : ""}`,
  );

  const priorityCycle: (Priority | null)[] = [null, "low", "medium", "high"];

  function focusOnMount(el: HTMLElement) {
    requestAnimationFrame(() => {
      el.focus();
      if (el instanceof HTMLTextAreaElement) {
        el.style.height = 'auto';
        el.style.height = el.scrollHeight + 'px';
      }
    });
  }

  $effect(() => {
    const id = taskId;
    const snapshot = initialTask;
    if (id === lastTaskId) return;
    lastTaskId = id;
    lastRefreshRevision = refreshRevision;
    editingTitle = false;
    titleDraft = "";
    showDeleteConfirm = false;
    dateIndex = 0;
    copyFeedback = false;
    addingTag = false;
    tagDraft = "";
    bodyFocused = false;
    bodyDirty = false;
    kickBackOpen = false;
    kickBackNotes = "";
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
    if (p === "high") return "high";
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

  // ── Agent section parsing ─────────────────────────────────────────

  const AGENT_HEADINGS = ["agent summary", "deferred", "review notes"];

  type ParsedBody = {
    description: string;
    agentSummary: string | null;
    deferred: string | null;
    reviewNotes: string | null;
  };

  function parseBodySections(body: string): ParsedBody {
    const lines = body.split("\n");
    const sections: { heading: string; startLine: number }[] = [];

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^##\s+(.+)$/);
      if (match) {
        const heading = match[1].trim().toLowerCase();
        if (AGENT_HEADINGS.includes(heading)) {
          sections.push({ heading, startLine: i });
        }
      }
    }

    if (sections.length === 0) {
      return { description: body, agentSummary: null, deferred: null, reviewNotes: null };
    }

    // Everything before the first agent section is the description
    const firstSectionLine = Math.min(...sections.map((s) => s.startLine));
    const description = lines.slice(0, firstSectionLine).join("\n").trimEnd();

    // Extract each section's content
    function extractSection(heading: string): string | null {
      const section = sections.find((s) => s.heading === heading);
      if (!section) return null;
      const nextSection = sections
        .filter((s) => s.startLine > section.startLine)
        .sort((a, b) => a.startLine - b.startLine)[0];
      const endLine = nextSection ? nextSection.startLine : lines.length;
      return lines
        .slice(section.startLine + 1, endLine)
        .join("\n")
        .trim();
    }

    return {
      description,
      agentSummary: extractSection("agent summary"),
      deferred: extractSection("deferred"),
      reviewNotes: extractSection("review notes"),
    };
  }

  let parsedBody = $derived.by(() => {
    if (!task) return { description: "", agentSummary: null, deferred: null, reviewNotes: null };
    return parseBodySections(task.body);
  });

  let hasAgentSections = $derived(
    parsedBody.agentSummary != null || parsedBody.deferred != null || parsedBody.reviewNotes != null,
  );

  let isReviewStatus = $derived(task?.status === "review");

  let doneColumnId = $derived(
    columns.find((c) => c.done)?.id ?? "done",
  );

  // ── Review actions ──────────────────────────────────────────────

  async function approveTask() {
    if (!task?.id) return;
    await saveField({ status: doneColumnId });
  }

  async function kickBack() {
    if (!task?.id) return;
    const notes = kickBackNotes.trim();
    if (notes) {
      // Append or replace ## Review Notes in the body
      const body = replaceOrAppendSection(task.body, "Review Notes", notes);
      await saveField({ status: "in-progress", body });
    } else {
      await saveField({ status: "in-progress" });
    }
    kickBackOpen = false;
    kickBackNotes = "";
  }

  function replaceOrAppendSection(body: string, heading: string, content: string): string {
    const lines = body.split("\n");
    const headingLower = heading.toLowerCase();
    let sectionStart = -1;
    let sectionEnd = lines.length;

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^##\s+(.+)$/);
      if (match) {
        const h = match[1].trim().toLowerCase();
        if (h === headingLower) {
          sectionStart = i;
        } else if (sectionStart >= 0 && sectionEnd === lines.length) {
          sectionEnd = i;
        }
      }
    }

    const newSection = `## ${heading}\n${content}`;

    if (sectionStart >= 0) {
      const before = lines.slice(0, sectionStart).join("\n");
      const after = lines.slice(sectionEnd).join("\n");
      return [before, newSection, after].filter(Boolean).join("\n");
    }

    return body.trimEnd() + "\n\n" + newSection + "\n";
  }

  // ── Field updates ────────────────────────────────────────────────

  async function saveField(updates: Parameters<typeof updateTask>[1]) {
    if (!task?.id) return;
    try {
      const currentBody = task.body;
      const preserveBody = (bodyFocused || bodyDirty) && !("body" in updates);
      const loaded = await updateTask(task.id, updates);
      task = preserveBody ? { ...loaded, body: currentBody } : loaded;
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
    onClosingStart();
    setTimeout(() => {
      closing = false;
      onClose();
    }, closeAnimationMs);
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
    if (!task || !hasAgentSections) {
      saveField({ body: markdown });
      return;
    }
    // Reconstruct full body: edited description + preserved agent sections
    let full = markdown.trimEnd();
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
  }

  function handleSubtaskBodyChange(newDescription: string) {
    if (!task) return;
    if (!hasAgentSections) {
      saveField({ body: newDescription });
      return;
    }
    let full = newDescription.trimEnd();
    if (parsedBody.agentSummary != null) full += "\n\n## Agent Summary\n" + parsedBody.agentSummary;
    if (parsedBody.deferred != null) full += "\n\n## Deferred\n" + parsedBody.deferred;
    if (parsedBody.reviewNotes != null) full += "\n\n## Review Notes\n" + parsedBody.reviewNotes;
    full += "\n";
    saveField({ body: full });
  }

  // Copy as agent prompt
  function copyAsPrompt() {
    if (!task) return;
    const parts = [`Work on task #${task.id}: ${task.title}`];
    if (task.body.trim()) parts.push(task.body.trim());
    const tags = task.tags.length > 0 ? `Tags: ${task.tags.join(", ")}` : "";
    const priority = task.priority ? `Priority: ${task.priority}` : "";
    const meta = [tags, priority].filter(Boolean).join(" | ");
    if (meta) parts.push(meta);
    navigator.clipboard.writeText(parts.join("\n\n"));
    copyFeedback = true;
    setTimeout(() => { copyFeedback = false; }, 1200);
  }

  // Delete
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

  // Date cycling
  let dateEntries = $derived.by(() => {
    if (!task) return [];
    const entries: { label: string; value: string }[] = [];
    if (task.created) entries.push({ label: "Created", value: formatDate(task.created) });
    if (task.updated) entries.push({ label: "Updated", value: formatDate(task.updated) });
    if (task.completed) entries.push({ label: "Completed", value: formatDate(task.completed) });
    return entries;
  });

  function cycleDate() {
    if (dateEntries.length === 0) return;
    dateIndex = (dateIndex + 1) % dateEntries.length;
  }
</script>

<Dialog.Root open>
  <Dialog.Portal>
    <Dialog.Overlay
      class={overlayClass}
    />
    <Dialog.Content
      class={contentClass}
      onInteractOutside={(e) => { e.preventDefault(); if (!closing) handleClose(); }}
      onEscapeKeydown={(e) => {
        e.preventDefault();
        if (editingTitle) { cancelTitle(); }
        else if (addingTag) { addingTag = false; tagDraft = ""; }
        else if (!closing) { handleClose(); }
      }}
    >
    {#if loading}
      <div class="flex items-center justify-center py-12">
        <span class="font-mono text-[11px] text-muted-foreground animate-pulse">Loading...</span>
      </div>
    {:else if task}
      <!-- Header: ID left, close right -->
      <div class="flex items-center justify-between border-b border-border/60 px-3 py-1.5">
        <div>
          {#if task.id != null}
            <span class="font-mono text-[10px] text-muted-foreground">#{task.id}</span>
          {/if}
        </div>
        <MetaTooltip text="Close">
          {#snippet children({ props })}
            <button
              {...props}
              type="button"
              aria-label="Close"
              class="rounded-[4px] p-1 text-muted-foreground transition-colors duration-[120ms] hover:bg-accent hover:text-foreground"
              onclick={handleClose}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          {/snippet}
        </MetaTooltip>
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
                rows="1"
                class="w-full resize-none border-0 bg-transparent p-0 text-[16px] font-medium text-foreground outline-none focus:outline-none focus:ring-0 focus:shadow-none"
                style="overflow:hidden; box-shadow:none"
                oninput={(e) => { const el = e.currentTarget; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }}
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
        <div class="flex max-h-[80px] flex-wrap items-center gap-x-3 gap-y-1.5 overflow-y-auto px-4 pb-3">
          <!-- Status -->
          <div class="flex items-center gap-1.5">
            <span class="shrink-0 select-none font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/50">Status</span>
            <MetaSelect
              value={task.status}
              items={statusOptions.map(col => ({ value: col.id, label: col.id }))}
              disabled={isUnindexed}
              onValueChange={changeStatus}
            />
          </div>

          <!-- Confidence (review only) -->
          {#if task.confidence}
            <div class="flex items-center gap-1.5">
              <span class="shrink-0 select-none font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/50">Confidence</span>
              <span class="inline-flex h-5 items-center rounded-[4px] border border-border/60 px-1.5 font-mono text-[10px] leading-none text-muted-foreground">
                {task.confidence}
              </span>
            </div>
          {/if}

          <!-- Priority -->
          <div class="flex items-center gap-1.5">
            <span class="shrink-0 select-none font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/50">Priority</span>
            <MetaTooltip text="Cycle priority">
              {#snippet children({ props })}
                <button
                  {...props}
                  type="button"
                  class="inline-flex h-5 items-center gap-1 rounded-[4px] border border-border/60 px-1.5 font-mono text-[10px] leading-none text-muted-foreground transition-colors duration-[120ms] hover:border-border focus-visible:border-ring focus-visible:outline-none"
                  disabled={isUnindexed}
                  onclick={cyclePriority}
                >
                  <PriorityDot tone={priorityTone(task?.priority ?? null)} />
                  <span>{task?.priority ?? "none"}</span>
                </button>
              {/snippet}
            </MetaTooltip>
          </div>

          <!-- Tags -->
          {#if task.tags.length > 0 || !isUnindexed}
            <div class="flex items-center gap-1.5">
              <span class="shrink-0 select-none font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/50">Tags</span>
              {#each task.tags as tag}
                <button
                  type="button"
                  class="inline-flex h-5 items-center rounded-[4px] border border-border/60 px-1.5 font-mono text-[10px] leading-none text-muted-foreground transition-colors duration-[120ms] hover:border-border focus-visible:border-ring focus-visible:outline-none"
                  disabled={isUnindexed}
                  onclick={() => removeTag(tag)}
                  title={isUnindexed ? tag : "Click to remove"}
                >
                  {tag}
                </button>
              {/each}

              {#if !isUnindexed}
                {#if addingTag}
                  <input
                    type="text"
                    bind:value={tagDraft}
                    onblur={() => { if (!tagDraft.trim()) addingTag = false; else addTag(); }}
                    onkeydown={handleTagKeydown}
                    placeholder="tag..."
                    class="h-5 w-[80px] rounded-[4px] border border-dashed border-border/60 bg-transparent px-1.5 font-mono text-[10px] leading-none text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-border"
                    use:focusOnMount
                  />
                {:else}
                  <button
                    type="button"
                    class="inline-flex h-5 items-center rounded-[4px] border border-dashed border-border/60 px-1.5 font-mono text-[10px] leading-none text-muted-foreground/60 transition-colors duration-[120ms] hover:border-border hover:text-muted-foreground"
                    onclick={() => { addingTag = true; }}
                  >
                    + tag
                  </button>
                {/if}
              {/if}
            </div>
          {/if}
        </div>

        {#if saveErrorText}
          <div class="px-4 pb-1">
            <span class="font-mono text-[10px] text-red-400">{saveErrorText}</span>
          </div>
        {/if}

        <!-- Subtask list -->
        <SubtaskList
          body={hasAgentSections ? parsedBody.description : task.body}
          readonly={isUnindexed}
          onBodyChange={handleSubtaskBodyChange}
        />

        <!-- Unmatched status warning -->
        {#if hasUnmatchedStatus}
          <div class="mx-4 mb-2 rounded-[6px] border border-border/60 bg-accent/60 px-2.5 py-1.5">
            <p class="text-[11px] text-muted-foreground">
              Status does not match configured columns. Pick a configured column to normalize.
            </p>
          </div>
        {/if}

        <!-- Agent sections (rendered above editor when present) -->
        {#if hasAgentSections}
          <div class="border-t border-border/60">
            {#if parsedBody.agentSummary != null}
              <div class="border-l-2 border-l-border px-4 py-2.5 mx-3 my-2">
                <p class="mb-1 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/60">Agent Summary</p>
                <p class="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-muted-foreground">{parsedBody.agentSummary}</p>
              </div>
            {/if}
            {#if parsedBody.deferred != null}
              <div class="border-l-2 border-l-border px-4 py-2.5 mx-3 my-2">
                <p class="mb-1 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/60">Deferred</p>
                <p class="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-muted-foreground">{parsedBody.deferred}</p>
              </div>
            {/if}
            {#if parsedBody.reviewNotes != null}
              <div class="border-l-2 border-l-border px-4 py-2.5 mx-3 my-2">
                <p class="mb-1 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/60">Review Notes</p>
                <p class="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-muted-foreground">{parsedBody.reviewNotes}</p>
              </div>
            {/if}
          </div>
        {/if}

        <!-- Body / description -->
        <div class="border-t border-border/60">
          {#if showBody}
            <MilkdownEditor
              content={hasAgentSections ? parsedBody.description : task.body}
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

      </div>

      <!-- Kick-back notes input -->
      {#if kickBackOpen}
        <div class="border-t border-border/60 px-3 py-2">
          <p class="mb-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/60">What needs fixing?</p>
          <textarea
            bind:value={kickBackNotes}
            placeholder="Optional — describe what needs to change..."
            rows="2"
            class="w-full resize-none rounded-[4px] border border-border/60 bg-transparent px-2.5 py-1.5 font-mono text-[11px] text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-border"
            use:focusOnMount
            onkeydown={(e) => {
              if (e.key === "Enter" && e.metaKey) { e.preventDefault(); kickBack(); }
              else if (e.key === "Escape") { kickBackOpen = false; kickBackNotes = ""; }
            }}
          ></textarea>
          <div class="mt-1.5 flex justify-end gap-1.5">
            <button
              type="button"
              class="rounded-[4px] border border-border/60 px-2 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors duration-[120ms] hover:border-border hover:text-foreground"
              onclick={() => { kickBackOpen = false; kickBackNotes = ""; }}
            >
              Cancel
            </button>
            <button
              type="button"
              class="rounded-[4px] border border-border/60 px-2 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors duration-[120ms] hover:border-border hover:text-foreground"
              onclick={kickBack}
            >
              Kick back
            </button>
          </div>
        </div>
      {/if}

      <!-- Footer: date cycling left, actions right -->
      <div class="flex items-center justify-between border-t border-border/60 px-3 py-1.5">
        <div class="flex items-center gap-1.5">
          {#if bodyDirty}
            <span class="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/60" title="Unsaved changes"></span>
          {/if}
          {#if dateEntries.length > 0}
            <MetaTooltip text="Cycle dates">
              {#snippet children({ props })}
                <button
                  {...props}
                  type="button"
                  class="inline-flex appearance-none items-center gap-[3px] border-0 bg-transparent p-0 text-muted-foreground transition-colors duration-[120ms] hover:text-foreground/80"
                  onclick={cycleDate}
                >
                  <span class="font-mono text-[10px] leading-none text-muted-foreground/60">
                    {dateEntries[dateIndex % dateEntries.length].label}
                  </span>
                  <span class="font-mono text-[10px] leading-none">
                    {dateEntries[dateIndex % dateEntries.length].value}
                  </span>
                </button>
              {/snippet}
            </MetaTooltip>
          {/if}
        </div>

        {#if !isUnindexed}
          <div class="flex items-center gap-0.5">
            <!-- Review actions -->
            {#if isReviewStatus}
              <button
                type="button"
                class="rounded-[4px] border border-border/60 px-2 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors duration-[120ms] hover:border-border hover:text-foreground"
                onclick={() => { kickBackOpen = !kickBackOpen; }}
              >
                Kick back
              </button>
              <button
                type="button"
                class="rounded-[4px] border border-border/60 bg-foreground/5 px-2 py-0.5 font-mono text-[10px] text-foreground transition-colors duration-[120ms] hover:bg-foreground/10"
                onclick={approveTask}
              >
                Approve
              </button>
              <span class="mx-0.5 h-3 w-px bg-border/60"></span>
            {/if}
            <!-- Copy as agent prompt -->
            <MetaTooltip text="Copy as agent prompt">
              {#snippet children({ props })}
                <button
                  {...props}
                  type="button"
                  class="rounded-[4px] p-1 text-muted-foreground/60 transition-colors duration-[120ms] hover:bg-accent hover:text-foreground"
                  onclick={copyAsPrompt}
                >
                  {#if copyFeedback}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  {:else}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                  {/if}
                </button>
              {/snippet}
            </MetaTooltip>

            <!-- Delete -->
            <AlertDialog.Root bind:open={showDeleteConfirm}>
              <AlertDialog.Trigger
                class="rounded-[4px] p-1 text-muted-foreground/60 transition-colors duration-[120ms] hover:bg-accent hover:text-red-400"
                title="Delete task"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </AlertDialog.Trigger>
              <AlertDialog.Portal>
                <AlertDialog.Overlay class="fixed inset-0 z-[60] bg-black/30" />
                <AlertDialog.Content class="fixed left-1/2 top-1/2 z-[60] w-full max-w-[280px] -translate-x-1/2 -translate-y-1/2 rounded-[8px] border border-border/60 bg-card p-4 shadow-lg">
                  <AlertDialog.Title class="font-mono text-[12px] font-medium text-foreground">
                    Delete task?
                  </AlertDialog.Title>
                  <AlertDialog.Description class="mt-1 text-[11px] text-muted-foreground">
                    This action cannot be undone.
                  </AlertDialog.Description>
                  <div class="mt-3 flex justify-end gap-2">
                    <AlertDialog.Cancel
                      class="rounded-[4px] border border-border/60 px-2.5 py-1 font-mono text-[10px] text-muted-foreground transition-colors duration-[120ms] hover:bg-accent hover:text-foreground"
                    >
                      Cancel
                    </AlertDialog.Cancel>
                    <AlertDialog.Action
                      class="rounded-[4px] border border-border/60 bg-destructive/10 px-2.5 py-1 font-mono text-[10px] text-red-400 transition-colors duration-[120ms] hover:bg-destructive hover:text-red-300"
                      onclick={confirmDelete}
                    >
                      Delete
                    </AlertDialog.Action>
                  </div>
                </AlertDialog.Content>
              </AlertDialog.Portal>
            </AlertDialog.Root>
          </div>
        {/if}
      </div>
    {/if}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  :global(.task-modal-shell) {
    animation: modal-shell-in 190ms linear both;
  }

  @keyframes modal-shell-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  :global(.task-modal-shell-closing) {
    animation: modal-shell-out 200ms linear both;
  }

  @keyframes modal-shell-out {
    from {
      opacity: 1;
    }
    to {
      opacity: 0;
    }
  }

  :global(.task-modal) {
    transform-origin: center center;
    animation: modal-in 220ms cubic-bezier(0.16, 1, 0.3, 1) both;
  }

  @keyframes modal-in {
    from {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.944);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
  }

  :global(.task-modal-closing) {
    animation: modal-out 220ms cubic-bezier(0.32, 0.72, 0, 1) both;
  }

  @keyframes modal-out {
    from {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
    to {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.956);
    }
  }

  :global(.error-flash) {
    animation: flash-border 800ms ease-out;
  }

  @keyframes flash-border {
    0%, 100% { border-color: var(--color-border); }
    30% { border-color: var(--color-destructive); }
  }

  /* Override global :focus-visible outline on title edit textarea */
  textarea:focus,
  textarea:focus-visible {
    outline: none;
    border-color: transparent;
    box-shadow: none;
  }
</style>
