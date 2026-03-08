<script lang="ts">
  import { Dialog } from "bits-ui";
  import {
    deleteTask,
    getTask,
    updateTask,
    type ColumnDto,
    type Priority,
    type TaskDto,
  } from "$lib/api";
  import { marked } from "marked";
  import MilkdownEditor from "$lib/components/MilkdownEditor.svelte";
  import PriorityDot from "$lib/components/PriorityDot.svelte";
  import type { PriorityTone } from "$lib/components/PriorityDot.svelte";
  import AttachmentList from "$lib/components/AttachmentList.svelte";
  import SubtaskList from "$lib/components/SubtaskList.svelte";
  import TagPicker from "$lib/components/TagPicker.svelte";
  import MetaSelect from "$lib/components/ui/MetaSelect.svelte";
  import MetaTooltip from "$lib/components/ui/MetaTooltip.svelte";
  import { tagColor } from "$lib/tagColor";
  import { composeBodyWithNotesAndSubtasks, stripSubtasksFromBody } from "$lib/subtasks";
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
  let copyFeedback = $state(false);
  let dropActive = $state(false);
  let dragDepth = $state(0);
  let showBody = $state(false);
  let errorFlash = $state<string | null>(null);
  let closing = $state(false);
  let saveErrorText = $state<string | null>(null);
  let attachmentListRef = $state<{
    handlePaste: (e: ClipboardEvent) => Promise<void>;
    handleDroppedFiles: (files: File[]) => Promise<void>;
  } | null>(null);
  let bodyFocused = $state(false);
  let bodyDirty = $state(false);
  let lastTaskId = $state<number | null | undefined>(undefined);
  let lastRefreshRevision = $state(-1);
  let kickBackOpen = $state(false);
  let kickBackNotes = $state("");
  let bodySaveRevision = 0;
  let dropActivateTimer: ReturnType<typeof setTimeout> | null = null;
  const closeAnimationMs = 220;
  let overlayClass = $derived(
    `task-modal-shell fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px]${
      closing ? " task-modal-shell-closing" : ""
    }`,
  );
  let contentClass = $derived(
    `task-modal fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 flex min-h-[200px] max-h-[80vh] w-full max-w-[600px] flex-col overflow-hidden rounded-[12px] border border-border/60 bg-card shadow-[0_12px_36px_-8px_rgba(0,0,0,0.5)]${
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

  function hasDraggedFiles(e: DragEvent): boolean {
    const types = e.dataTransfer?.types;
    return !!types && Array.from(types).includes("Files");
  }

  function clearDropActivationTimer() {
    if (dropActivateTimer != null) {
      clearTimeout(dropActivateTimer);
      dropActivateTimer = null;
    }
  }

  function clearDropState() {
    clearDropActivationTimer();
    dragDepth = 0;
    dropActive = false;
  }

  function scheduleDropActive() {
    if (dropActive || dropActivateTimer != null) return;
    dropActivateTimer = setTimeout(() => {
      dropActive = true;
      dropActivateTimer = null;
    }, 75);
  }

  function handleFileDragEnter(e: DragEvent) {
    if (!task?.id || !attachmentListRef || !hasDraggedFiles(e)) return;
    e.preventDefault();
    dragDepth += 1;
    scheduleDropActive();
  }

  function handleFileDragOver(e: DragEvent) {
    if (!task?.id || !attachmentListRef || !hasDraggedFiles(e)) return;
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "copy";
    }
    scheduleDropActive();
  }

  function handleFileDragLeave(e: DragEvent) {
    if (!hasDraggedFiles(e) && dragDepth === 0) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) {
      clearDropState();
    }
  }

  function handleFileDrop(e: DragEvent) {
    if (!task?.id || !attachmentListRef || !hasDraggedFiles(e)) return;
    e.preventDefault();
    clearDropState();
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length === 0) return;
    void attachmentListRef.handleDroppedFiles(files);
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
    copyFeedback = false;
    clearDropState();
    bodyFocused = false;
    bodyDirty = false;
    kickBackOpen = false;
    kickBackNotes = "";
    if (id == null) {
      task = snapshot ? { ...snapshot } : null;
      showBody = snapshot ? hasEditableNotes(snapshot.body) : false;
      loading = false;
      return;
    }
    if (snapshot?.id === id) {
      task = snapshot;
      showBody = hasEditableNotes(snapshot.body);
      loading = false;
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
    if (!preserveDrafts && task == null) loading = true;
    try {
      const loaded = await getTask(id);
      const preserveBodyDraft = preserveDrafts && (bodyFocused || bodyDirty);
      task = preserveBodyDraft && task ? { ...loaded, body: task.body } : loaded;
      if (!preserveBodyDraft) {
        showBody = hasEditableNotes(loaded.body);
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

  // ── Agent section parsing ─────────────────────────────────────────

  const AGENT_HEADINGS = ["agent summary", "deferred", "review notes"];

  /** Check if body has editable notes (description portion, excluding agent sections and subtasks). */
  function hasEditableNotes(body: string): boolean {
    const parsed = parseBodySections(body);
    const desc = parsed.agentSummary != null || parsed.deferred != null || parsed.reviewNotes != null
      ? parsed.description
      : body;
    return stripSubtasksFromBody(desc).length > 0;
  }

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

  let editableNotesBody = $derived.by(() => {
    if (!task) return "";
    const description = hasAgentSections ? parsedBody.description : task.body;
    return stripSubtasksFromBody(description);
  });

  let isReviewStatus = $derived(task?.status === "review");

  // Configure marked for agent section rendering
  const markedInstance = new marked.Renderer();
  const renderMarkdown = (text: string): string => {
    return marked(text, { renderer: markedInstance, async: false }) as string;
  };

  let doneColumnId = $derived(
    columns.find((c) => c.done)?.id ?? "done",
  );

  // ── Review actions ──────────────────────────────────────────────

  async function approveTask() {
    if (!task?.id) return;
    await saveField({ status: doneColumnId });
    handleClose();
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
    handleClose();
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
  function toggleTag(tag: string) {
    if (!task || isUnindexed) return;
    const has = task.tags.includes(tag);
    const newTags = has ? task.tags.filter((t) => t !== tag) : [...task.tags, tag];
    saveField({ tags: newTags });
  }

  function addNewTag(tag: string) {
    if (!task || isUnindexed) return;
    if (task.tags.includes(tag)) return;
    saveField({ tags: [...task.tags, tag] });
  }

  // Body
  function saveBody(markdown: string) {
    if (!task) return;
    const description = hasAgentSections ? parsedBody.description : task.body;
    persistDescription(composeBodyWithNotesAndSubtasks(markdown, description));
  }

  function handleSubtaskBodyChange(newDescription: string) {
    persistDescription(composeBodyWithNotesAndSubtasks(editableNotesBody, newDescription));
  }

  function composeTaskBody(description: string): string {
    const sections: string[] = [];
    const trimmedDescription = description.trimEnd();
    if (trimmedDescription) sections.push(trimmedDescription);
    if (parsedBody.agentSummary != null) sections.push(`## Agent Summary\n${parsedBody.agentSummary}`);
    if (parsedBody.deferred != null) sections.push(`## Deferred\n${parsedBody.deferred}`);
    if (parsedBody.reviewNotes != null) sections.push(`## Review Notes\n${parsedBody.reviewNotes}`);
    if (sections.length === 0) return "";
    return `${sections.join("\n\n")}\n`;
  }

  async function persistDescription(description: string) {
    if (!task?.id) return;
    const body = hasAgentSections ? composeTaskBody(description) : description;
    const requestRevision = ++bodySaveRevision;
    const taskId = task.id;
    task = { ...task, body };
    try {
      const loaded = await updateTask(taskId, { body });
      if (requestRevision !== bodySaveRevision) return;
      task = loaded;
      onTaskUpdated();
    } catch {
      if (requestRevision !== bodySaveRevision) return;
      flashError();
      void loadTask(taskId, false);
    }
  }

  // Copy as agent prompt (split button)
  const PROMPT_MODES = [
    { id: "implement", label: "Implement", desc: "build it now" },
    { id: "plan", label: "Plan", desc: "outline the approach" },
    { id: "explore", label: "Explore", desc: "discuss before acting" },
  ] as const;

  let promptDropdownOpen = $state(false);

  function copyPrompt(mode: string = "implement") {
    if (!task) return;

    const meta = [
      task.priority ? `Priority: ${task.priority}` : "",
      task.tags.length > 0 ? `Tags: ${task.tags.join(", ")}` : "",
    ].filter(Boolean).join(" | ");

    const formatAttachmentSize = (bytes: number): string => {
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const attachmentManifest = task.attachments.length > 0
      ? `\n\nAttachments:\n${task.attachments
        .map((attachment) =>
          `- ${attachment.filename} (${attachment.mime_type || "application/octet-stream"}, ${formatAttachmentSize(attachment.size)})`,
        )
        .join("\n")}\nAttached files exist and should be inspected separately if relevant.`
      : "";

    let prompt = "";
    if (mode === "implement") {
      prompt = `Implement task #${task.id}: ${task.title}`;
    } else if (mode === "plan") {
      prompt = `Create an implementation plan for task #${task.id}: ${task.title}\nDo not implement — outline the approach, key decisions, affected files, and risks.`;
    } else if (mode === "explore") {
      prompt = `Analyze task #${task.id}: ${task.title}\nExplore the problem space, surface questions, tradeoffs, and considerations before taking action.`;
    } else {
      prompt = `Implement task #${task.id}: ${task.title}`;
    }
    if (task.body.trim()) prompt += `\n\n${task.body.trim()}`;
    if (meta) prompt += `\n\n${meta}`;
    prompt += attachmentManifest;

    navigator.clipboard.writeText(prompt);
    copyFeedback = true;
    setTimeout(() => { copyFeedback = false; }, 1200);
  }

  function pickPromptMode(mode: string) {
    promptDropdownOpen = false;
    copyPrompt(mode);
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
        else if (promptDropdownOpen) { promptDropdownOpen = false; }
        else if (!closing) { handleClose(); }
      }}
      ondragenter={handleFileDragEnter}
      ondragover={handleFileDragOver}
      ondragleave={handleFileDragLeave}
      ondrop={handleFileDrop}
      onpaste={(e) => {
        if (e.clipboardData?.items) {
          for (const item of e.clipboardData.items) {
            if (item.type.startsWith("image/")) {
              void attachmentListRef?.handlePaste(e);
              return;
            }
          }
        }
      }}
    >
    {#if dropActive && task?.id != null}
      <div class="pointer-events-none fixed left-1/2 top-1/2 z-10 flex min-h-[200px] max-h-[80vh] w-full max-w-[600px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[12px] border border-foreground/16 bg-card/56 backdrop-blur-[1px]">
        <div class="rounded-[6px] border border-border/70 bg-card/94 px-3 py-2 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.55)]">
          <div class="flex items-center gap-2">
            <span class="inline-block h-1.5 w-1.5 rounded-full bg-foreground/60"></span>
            <p class="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/55">Drop files to attach</p>
          </div>
        </div>
      </div>
    {/if}
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
        <button
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
      </div>

      <div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <!-- Title -->
        <div class="shrink-0 px-4 pt-3 pb-1">
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
        <div class="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-border/40 px-4 pb-3">
          <!-- Status -->
          <div class="flex items-center gap-1.5">
            <span class="shrink-0 select-none font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/70">Status</span>
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
              <span class="shrink-0 select-none font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/70">Confidence</span>
              <span class="inline-flex h-6 items-center rounded-[4px] border border-border/60 px-2 font-mono text-[10px] leading-none text-muted-foreground">
                {task.confidence}
              </span>
            </div>
          {/if}

          <!-- Priority -->
          <div class="flex items-center gap-1.5">
            <span class="shrink-0 select-none font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/70">Priority</span>
            <MetaTooltip text="Cycle priority">
              {#snippet children({ props })}
                <button
                  {...props}
                  type="button"
                  class="inline-flex h-6 items-center gap-1 rounded-[4px] border border-border/60 px-2 font-mono text-[10px] leading-none text-muted-foreground transition-colors duration-[120ms] hover:border-border focus-visible:border-ring focus-visible:outline-none"
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
              <span class="shrink-0 select-none font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/70">Tags</span>
              {#each task.tags as tag}
                <button
                  type="button"
                  class="inline-flex h-6 items-center gap-1 rounded-[4px] border border-border/60 px-2 font-mono text-[10px] leading-none text-muted-foreground transition-colors duration-[120ms] hover:border-border focus-visible:border-ring focus-visible:outline-none"
                  disabled={isUnindexed}
                  onclick={() => toggleTag(tag)}
                  title={isUnindexed ? tag : "Click to remove"}
                >
                  <span class="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style="background-color: {tagColor(tag)}"></span>
                  {tag}
                </button>
              {/each}

              {#if !isUnindexed}
                <TagPicker
                  currentTags={task.tags}
                  onToggle={toggleTag}
                  onAdd={addNewTag}
                />
              {/if}
            </div>
          {/if}

          <!-- Owner -->
          {#if !isUnindexed}
            <div class="flex items-center gap-1.5">
              <span class="shrink-0 select-none font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/70">Owner</span>
              <button
                type="button"
                class="inline-flex h-6 items-center gap-1 rounded-[4px] border px-2 font-mono text-[10px] leading-none transition-colors duration-[120ms] hover:border-border focus-visible:border-ring focus-visible:outline-none {task?.owner === 'user' ? 'border-foreground/30 text-foreground' : 'border-border/60 text-muted-foreground'}"
                onclick={() => {
                  const newOwner = task?.owner === "user" ? null : "user";
                  saveField({ owner: newOwner });
                }}
              >
                {#if task?.owner === "user"}
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                  User
                {:else}
                  AI
                {/if}
              </button>
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

        <!-- Attachments -->
        {#if task.id != null}
          <AttachmentList
            bind:this={attachmentListRef}
            taskId={task.id}
            attachments={task.attachments ?? []}
            readonly={isUnindexed}
            {dropActive}
            onTaskUpdated={async () => {
              if (task?.id) {
                const loaded = await getTask(task.id);
                task = loaded;
              }
              onTaskUpdated();
            }}
          />
        {/if}

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
                <div class="agent-md font-mono text-[11px] leading-relaxed text-muted-foreground">{@html renderMarkdown(parsedBody.agentSummary)}</div>
              </div>
            {/if}
            {#if parsedBody.deferred != null}
              <div class="border-l-2 border-l-border px-4 py-2.5 mx-3 my-2">
                <p class="mb-1 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/60">Deferred</p>
                <div class="agent-md font-mono text-[11px] leading-relaxed text-muted-foreground">{@html renderMarkdown(parsedBody.deferred)}</div>
              </div>
            {/if}
            {#if parsedBody.reviewNotes != null}
              <div class="border-l-2 border-l-border px-4 py-2.5 mx-3 my-2">
                <p class="mb-1 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/60">Review Notes</p>
                <div class="agent-md font-mono text-[11px] leading-relaxed text-muted-foreground">{@html renderMarkdown(parsedBody.reviewNotes)}</div>
              </div>
            {/if}
          </div>
        {/if}

        <!-- Body / description -->
        <div class="border-t border-border/60">
          {#if showBody}
            <MilkdownEditor
              content={editableNotesBody}
              readonly={isUnindexed}
              saveOnBlur={true}
              onSave={saveBody}
              onDirtyChange={(dirty) => { bodyDirty = dirty; }}
              onFocusChange={(focused) => { bodyFocused = focused; }}
            />
          {:else}
            <button
              type="button"
              class="w-full px-4 py-3 text-left text-[13px] text-muted-foreground/50 transition-colors duration-[120ms] hover:text-muted-foreground"
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
              class="rounded-[4px] border border-border/60 px-2.5 py-1 font-mono text-[10px] text-muted-foreground transition-colors duration-[120ms] hover:border-border hover:text-foreground"
              onclick={() => { kickBackOpen = false; kickBackNotes = ""; }}
            >
              Cancel
            </button>
            <button
              type="button"
              class="rounded-[4px] border border-border/60 px-2.5 py-1 font-mono text-[10px] text-muted-foreground transition-colors duration-[120ms] hover:border-border hover:text-foreground"
              onclick={kickBack}
            >
              Kick back
            </button>
          </div>
        </div>
      {/if}

      <!-- Footer: delete left, actions right -->
      <div class="flex items-center justify-between border-t border-border/60 px-3 py-2">
        <div class="flex items-center gap-1.5">
          {#if bodyDirty}
            <span class="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/60" title="Unsaved changes"></span>
          {/if}
          {#if !isUnindexed}
            <!-- Delete (inline confirm) -->
            {#if showDeleteConfirm}
              <span class="inline-flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                <button
                  type="button"
                  class="rounded-[4px] border border-border/60 px-2 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors duration-[120ms] hover:border-border hover:text-foreground"
                  onclick={() => { showDeleteConfirm = false; }}
                >
                  No
                </button>
                <button
                  type="button"
                  class="rounded-[4px] border border-border/60 bg-destructive/10 px-2 py-0.5 font-mono text-[10px] text-red-400 transition-colors duration-[120ms] hover:bg-destructive hover:text-red-300"
                  onclick={confirmDelete}
                >
                  Yes
                </button>
                <span class="text-red-400">Delete?</span>
              </span>
            {:else}
              <button
                type="button"
                class="rounded-[4px] p-1 text-muted-foreground/60 transition-colors duration-[120ms] hover:bg-accent hover:text-red-400"
                title="Delete task"
                onclick={() => { showDeleteConfirm = true; }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            {/if}
          {/if}
        </div>

        {#if !isUnindexed}
          <div class="flex items-center gap-1">
            <!-- Review actions -->
            {#if isReviewStatus}
              <button
                type="button"
                class="rounded-[4px] border border-border/60 px-2.5 py-1 font-mono text-[10px] text-muted-foreground transition-colors duration-[120ms] hover:border-border hover:text-foreground"
                onclick={() => { kickBackOpen = !kickBackOpen; }}
              >
                Kick back
              </button>
              <button
                type="button"
                class="rounded-[4px] border border-border/60 bg-foreground/5 px-2.5 py-1 font-mono text-[10px] text-foreground transition-colors duration-[120ms] hover:bg-foreground/10"
                onclick={approveTask}
              >
                Approve
              </button>
              <span class="mx-0.5 h-3 w-px bg-border/60"></span>
            {/if}
            <!-- Copy as agent prompt (split button) -->
            {#if copyFeedback}
              <span class="inline-flex items-center gap-1 rounded-[4px] border border-border/60 px-2.5 py-1 font-mono text-[10px] text-muted-foreground">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                Copied
              </span>
            {:else}
              <div class="inline-flex items-stretch">
                <button
                  type="button"
                  class="inline-flex items-center gap-1 rounded-l-[4px] border border-r-0 border-foreground/20 bg-foreground px-2.5 py-1 font-mono text-[10px] text-background transition-colors duration-[120ms] hover:bg-foreground/85"
                  onclick={() => copyPrompt()}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                  Copy for AI
                </button>
                <div class="relative flex">
                  <button
                    type="button"
                    class="inline-flex items-center rounded-r-[4px] border border-foreground/20 bg-foreground px-2 py-1 text-background transition-colors duration-[120ms] hover:bg-foreground/85"
                    onclick={() => { promptDropdownOpen = !promptDropdownOpen; }}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  </button>
                  {#if promptDropdownOpen}
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div
                      class="absolute bottom-full right-0 mb-1 w-[200px] rounded-[6px] border border-border/60 bg-popover py-0.5 shadow-[0_8px_24px_-4px_rgba(0,0,0,0.4)]"
                      onmouseleave={() => { promptDropdownOpen = false; }}
                    >
                      {#each PROMPT_MODES as mode}
                        <button
                          type="button"
                          class="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left font-mono text-[10px] text-muted-foreground transition-colors duration-[80ms] hover:bg-accent hover:text-foreground"
                          onclick={() => pickPromptMode(mode.id)}
                        >
                          <span>{mode.label}<span class="text-muted-foreground/40"> — {mode.desc}</span></span>
                        </button>
                      {/each}
                    </div>
                  {/if}
                </div>
              </div>
            {/if}
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
      scale: 0.944;
    }
    to {
      opacity: 1;
      scale: 1;
    }
  }

  :global(.task-modal-closing) {
    animation: modal-out 220ms cubic-bezier(0.32, 0.72, 0, 1) both;
  }

  @keyframes modal-out {
    from {
      opacity: 1;
      scale: 1;
    }
    to {
      opacity: 0;
      scale: 0.956;
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

  /* Agent section rendered markdown */
  :global(.agent-md p) {
    margin: 0.2em 0;
  }

  :global(.agent-md ul),
  :global(.agent-md ol) {
    padding-left: 1.25em;
    margin: 0.2em 0;
  }

  :global(.agent-md li) {
    margin: 0.1em 0;
  }

  :global(.agent-md code) {
    font-family: var(--font-mono);
    font-size: 10px;
    background: var(--color-accent);
    border: 1px solid var(--color-border);
    border-radius: 3px;
    padding: 1px 3px;
  }

  :global(.agent-md pre) {
    font-family: var(--font-mono);
    font-size: 10px;
    background: var(--color-accent);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    padding: 6px 8px;
    margin: 0.3em 0;
    overflow-x: auto;
  }

  :global(.agent-md pre code) {
    background: none;
    border: none;
    padding: 0;
  }

  :global(.agent-md strong) {
    font-weight: 600;
    color: var(--color-foreground);
  }

  :global(.agent-md a) {
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  :global(.agent-md blockquote) {
    border-left: 2px solid var(--color-border);
    padding-left: 8px;
    margin: 0.3em 0;
  }
</style>
