<script lang="ts">
  import { Dialog } from "bits-ui";
  import {
    attachFile,
    deleteTask,
    getTask,
    updateTask,
    type ColumnDto,
    type TaskDto,
  } from "$lib/api";
  import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
  import { marked } from "marked";
  import { focusOnMount } from "$lib/actions";
  import MilkdownEditor from "$lib/components/MilkdownEditor.svelte";
  import AttachmentList from "$lib/components/AttachmentList.svelte";
  import TaskAgentSections from "$lib/components/TaskAgentSections.svelte";
  import TaskModalActionBar from "$lib/components/TaskModalActionBar.svelte";
  import SubtaskList from "$lib/components/SubtaskList.svelte";
  import TagPicker from "$lib/components/TagPicker.svelte";
  import MetaSelect from "$lib/components/ui/MetaSelect.svelte";
  import MetaTooltip from "$lib/components/ui/MetaTooltip.svelte";
  import { tagColor } from "$lib/tagColor";
  import { composeBodyWithNotesAndSubtasks, parseSubtasks, stripSubtasksFromBody } from "$lib/subtasks";
  import {
    composeTaskBodyFromSections,
    hasEditableTaskNotes,
    parseTaskBodySections,
    replaceOrAppendTaskSection,
  } from "$lib/taskBody";
  import { buildTaskPrompt } from "$lib/taskPrompt";
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
    handleAttach: () => Promise<void>;
  } | null>(null);
  let subtaskListRef = $state<{
    openAddInput: () => void;
  } | null>(null);
  let bodyFocused = $state(false);
  let bodyDirty = $state(false);
  let lastTaskId = $state<number | null | undefined>(undefined);
  let lastRefreshRevision = $state(-1);
  let reviseOpen = $state(false);
  let reviseNotes = $state("");
  let reviseDropdownOpen = $state(false);
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
    reviseOpen = false;
    reviseNotes = "";
    reviseDropdownOpen = false;
    if (id == null) {
      task = snapshot ? { ...snapshot } : null;
      showBody = snapshot ? hasEditableTaskNotes(snapshot.body) : false;
      loading = false;
      return;
    }
    if (snapshot?.id === id) {
      task = snapshot;
      showBody = hasEditableTaskNotes(snapshot.body);
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
        showBody = hasEditableTaskNotes(loaded.body);
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

  // ── Agent section parsing ─────────────────────────────────────────

  let parsedBody = $derived.by(() => {
    if (!task) return { description: "", agentSummary: null, deferred: null, reviewNotes: null };
    return parseTaskBodySections(task.body);
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

  let subtaskBody = $derived(hasAgentSections ? parsedBody.description : (task?.body ?? ""));
  let hasSubtasks = $derived(parseSubtasks(subtaskBody).length > 0);
  let hasAttachments = $derived((task?.attachments ?? []).length > 0);

  async function handleInlineAttach() {
    const id = task?.id;
    if (id == null) return;
    if (attachmentListRef) {
      await attachmentListRef.handleAttach();
    } else {
      const selected = await openFileDialog({ multiple: true, title: "Attach files" });
      if (!selected) return;
      const paths = Array.isArray(selected) ? selected : [selected];
      for (const filePath of paths) {
        task = await attachFile(id, filePath);
      }
      onTaskUpdated();
    }
  }

  // Configure marked for agent section rendering
  const markedInstance = new marked.Renderer();
  const renderMarkdown = (text: string): string => {
    return marked(text, { renderer: markedInstance, async: false }) as string;
  };

  let doneColumnId = $derived(
    columns.find((c) => c.done)?.id ?? "done",
  );

  let isDoneStatus = $derived(task?.status === doneColumnId);

  // ── Review actions ──────────────────────────────────────────────

  async function approveTask() {
    if (!task?.id) return;
    await saveField({ status: doneColumnId });
    handleClose();
  }

  async function reviseTask(andCopy: boolean = true) {
    if (!task?.id) return;
    const notes = reviseNotes.trim();
    if (notes) {
      const body = replaceOrAppendTaskSection(task.body, "Review Notes", notes);
      await saveField({ status: "in-progress", body });
    } else {
      await saveField({ status: "in-progress" });
    }
    if (andCopy) {
      copyPrompt("revise", notes);
    }
    reviseOpen = false;
    reviseNotes = "";
    reviseDropdownOpen = false;
    handleClose();
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
    return composeTaskBodyFromSections(parsedBody, description);
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
  let promptDropdownOpen = $state(false);

  function copyPrompt(mode: string = "implement", reviewNotes: string = "") {
    if (!task) return;
    navigator.clipboard.writeText(buildTaskPrompt(task, mode, reviewNotes));
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
        else if (reviseDropdownOpen) { reviseDropdownOpen = false; }
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
      <div class="flex items-center justify-between border-b border-border/60 p-3">
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
            <div class="mb-2 rounded-[6px] border border-border/60 border-l-2 border-l-border bg-accent/60 px-2.5 py-2">
              <p class="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">Unindexed</p>
              <p class="mt-0.5 text-[11px] text-muted-foreground">
                Run '<span class="select-all font-mono">unship reindex</span>' in terminal to fix
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
                use:focusOnMount={{ autosize: true }}
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

        <!-- Metadata row: status, tags -->
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

          <!-- Inline add buttons (shown when sections are empty) -->
          {#if !isUnindexed && !hasSubtasks}
            <button
              type="button"
              class="inline-flex h-6 items-center gap-1 rounded-[4px] border border-dashed border-border/40 px-2 font-mono text-[10px] leading-none text-muted-foreground/40 transition-colors duration-[120ms] hover:border-border/60 hover:text-muted-foreground"
              onclick={() => subtaskListRef?.openAddInput()}
            >
              + subtask
            </button>
          {/if}
          {#if !isUnindexed && !hasAttachments}
            <button
              type="button"
              class="inline-flex h-6 items-center gap-1 rounded-[4px] border border-dashed border-border/40 px-2 font-mono text-[10px] leading-none text-muted-foreground/40 transition-colors duration-[120ms] hover:border-border/60 hover:text-muted-foreground"
              onclick={handleInlineAttach}
            >
              + attachment
            </button>
          {/if}
        </div>

        {#if saveErrorText}
          <div class="px-4 pb-1">
            <span class="font-mono text-[10px] text-red-400">{saveErrorText}</span>
          </div>
        {/if}

        <!-- Subtask list -->
        <SubtaskList
          bind:this={subtaskListRef}
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
          <TaskAgentSections
            agentSummary={parsedBody.agentSummary}
            deferred={parsedBody.deferred}
            reviewNotes={parsedBody.reviewNotes}
            confidence={task?.confidence ?? null}
            {renderMarkdown}
          />
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

      <!-- Revise notes (inline expand) -->
      {#if reviseOpen}
        <div class="border-t border-border/60 px-4 py-2">
          <textarea
            bind:value={reviseNotes}
            placeholder="What needs fixing? (optional)"
            rows="2"
            class="w-full resize-none rounded-[4px] border border-border/60 bg-transparent px-2.5 py-1.5 font-mono text-[11px] text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-border"
            use:focusOnMount={{ autosize: true }}
            onkeydown={(e) => {
              if (e.key === "Enter" && e.metaKey) { e.preventDefault(); reviseTask(true); }
              else if (e.key === "Escape") { reviseOpen = false; reviseNotes = ""; }
            }}
          ></textarea>
        </div>
      {/if}

      <!-- Footer: delete left, actions right -->
      <TaskModalActionBar
        {bodyDirty}
        {isUnindexed}
        {reviseOpen}
        {showDeleteConfirm}
        {copyFeedback}
        {isReviewStatus}
        {isDoneStatus}
        {reviseDropdownOpen}
        {promptDropdownOpen}
        onToggleDeleteConfirm={(value) => {
          showDeleteConfirm = value;
        }}
        onConfirmDelete={confirmDelete}
        onCancelRevise={() => {
          reviseOpen = false;
          reviseNotes = "";
        }}
        onReviseWithCopy={() => reviseTask(true)}
        onToggleReviseDropdown={() => {
          reviseDropdownOpen = !reviseDropdownOpen;
        }}
        onCloseReviseDropdown={() => {
          reviseDropdownOpen = false;
        }}
        onReviseWithoutCopy={() => {
          reviseDropdownOpen = false;
          return reviseTask(false);
        }}
        onCopyPrompt={() => copyPrompt()}
        onTogglePromptDropdown={() => {
          promptDropdownOpen = !promptDropdownOpen;
        }}
        onClosePromptDropdown={() => {
          promptDropdownOpen = false;
        }}
        onPickPromptMode={pickPromptMode}
        onOpenRevise={() => {
          reviseOpen = true;
        }}
        onApprove={approveTask}
      />
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
