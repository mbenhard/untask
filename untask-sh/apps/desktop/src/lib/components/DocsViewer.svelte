<script lang="ts">
  import {
    createDoc,
    createDocFolder,
    deleteDocFolder,
    deleteDocPath,
    getPrdTaskCounts,
    moveDocPath,
    renameDocPath,
    type DocInfo,
    type DocNode,
  } from "$lib/api";
  import { DropdownMenu, Select } from "bits-ui";
  import DocsEditor from "$lib/components/DocsEditor.svelte";
  import DocsFolderView from "$lib/components/DocsFolderView.svelte";
  import DocsTreePane from "$lib/components/DocsTreePane.svelte";
  import {
    type FlatDocNode,
    basenameFromPath,
    canCreateInDocNode,
    collectMoveTargets,
    countDocs,
    defaultMoveDestination,
    findClosestExistingDocAncestor,
    findDocAncestors,
    findDocNode,
    findParentDocPath,
    findWritableDocRootForPath,
    flattenDocNodes,
    restoredBasename,
    suggestAvailableName,
  } from "$lib/docsTree";

  type ActionMode = "new-doc" | "new-folder" | "rename" | "move" | "delete" | null;

  let {
    docs,
    refreshRevision = 0,
    externalRevision = 0,
    externalPaths = [],
    onDocsChanged,
  }: {
    docs: DocNode[];
    refreshRevision?: number;
    externalRevision?: number;
    externalPaths?: string[];
    onDocsChanged?: () => Promise<void>;
  } = $props();

  let selectedPath = $state<string | null>(null);
  let expandedPaths = $state<Set<string>>(new Set());
  let editorKey = $state<string | null>(null);
  let openDoc = $state<DocInfo | null>(null);
  let openDocMissing = $state(false);
  let actionMode = $state<ActionMode>(null);
  let draftName = $state("");
  let moveDestination = $state("");
  let actionError = $state<string | null>(null);
  let actionPending = $state(false);
  let prdTaskCounts = $state<[number, number] | null>(null);
  let newDocType = $state<"doc" | "prd">("doc");
  let prdCountsRequestId = 0;

  const totalDocs = $derived(countDocs(docs));
  const flatNodes = $derived<FlatDocNode[]>(flattenDocNodes(docs, expandedPaths));
  const selectedNode = $derived(selectedPath ? findDocNode(docs, selectedPath) : null);
  const selectedDoc = $derived(openDoc);
  const selectedChildren = $derived(selectedNode?.kind === "doc" ? [] : selectedNode?.children ?? []);
  const moveTargets = $derived(selectedNode ? collectMoveTargets(docs, selectedNode) : []);

  $effect(() => {
    refreshRevision;

    const nextExpanded = new Set(expandedPaths);
    let expandedChanged = false;
    for (const root of docs) {
      if (!nextExpanded.has(root.node_path)) {
        nextExpanded.add(root.node_path);
        expandedChanged = true;
      }
    }

    if (selectedPath) {
      for (const ancestor of findDocAncestors(docs, selectedPath)) {
        if (!nextExpanded.has(ancestor)) {
          nextExpanded.add(ancestor);
          expandedChanged = true;
        }
      }
    }

    if (expandedChanged) {
      expandedPaths = nextExpanded;
    }

    if (!docs.length) {
      selectedPath = null;
      openDoc = null;
      openDocMissing = false;
      actionMode = null;
      return;
    }

    const currentNode = selectedPath ? findDocNode(docs, selectedPath) : null;
    if (currentNode?.kind === "doc") {
      openDoc = {
        path: currentNode.relative_path,
        basename: currentNode.name,
        doc_type: currentNode.doc_type ?? "doc",
      };
      openDocMissing = false;
    }

    if (!currentNode) {
      if (actionPending) {
        return;
      }
      if (openDoc) {
        openDocMissing = true;
        actionMode = null;
        actionError = null;
        return;
      }
      selectedPath = docs[0]?.node_path ?? null;
      actionMode = null;
      actionError = null;
    }
  });

  $effect(() => {
    refreshRevision;
    externalRevision;

    const prdPath = selectedDoc?.path;
    const isPrd = selectedNode?.doc_type === "prd";
    if (!prdPath || !isPrd) {
      prdCountsRequestId += 1;
      prdTaskCounts = null;
      return;
    }

    const requestId = ++prdCountsRequestId;
    getPrdTaskCounts(prdPath)
      .then((counts) => {
        if (
          requestId === prdCountsRequestId &&
          selectedDoc?.path === prdPath &&
          selectedNode?.doc_type === "prd"
        ) {
          prdTaskCounts = counts;
        }
      })
      .catch(() => {
        if (requestId === prdCountsRequestId) {
          prdTaskCounts = null;
        }
      });
  });

  function onNodeSelect(node: DocNode) {
    selectedPath = node.node_path;
    actionMode = null;
    actionError = null;

    if (node.kind === "doc") {
      openDoc = {
        path: node.relative_path,
        basename: node.name,
        doc_type: node.doc_type ?? "doc",
      };
      openDocMissing = false;
      editorKey = node.node_path;
      return;
    }

    openDoc = null;
    openDocMissing = false;
    expandedPaths = new Set(expandedPaths).add(node.node_path);
  }

  function onToggle(node: DocNode) {
    if (node.kind === "doc") return;

    const next = new Set(expandedPaths);
    if (next.has(node.node_path)) {
      next.delete(node.node_path);
    } else {
      next.add(node.node_path);
    }
    expandedPaths = next;
  }

  function onEditorClose() {
    const parent = findClosestExistingDocAncestor(docs, selectedPath ?? openDoc?.path ?? null);
    selectedPath = parent ?? docs[0]?.node_path ?? null;
    openDoc = null;
    openDocMissing = false;
    actionMode = null;
    actionError = null;
  }

  function handleTreeKeydown(event: KeyboardEvent) {
    if (!flatNodes.length || !selectedPath) return;

    const index = flatNodes.findIndex((item) => item.node.node_path === selectedPath);
    if (index === -1) return;

    const current = flatNodes[index].node;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      const next = flatNodes[index + 1]?.node;
      if (next) onNodeSelect(next);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      const previous = flatNodes[index - 1]?.node;
      if (previous) onNodeSelect(previous);
      return;
    }

    if (event.key === "ArrowRight" && current.kind !== "doc") {
      event.preventDefault();
      if (!expandedPaths.has(current.node_path)) {
        onToggle(current);
      } else if (current.children[0]) {
        onNodeSelect(current.children[0]);
      }
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (current.kind !== "doc" && expandedPaths.has(current.node_path)) {
        onToggle(current);
      } else {
        const parent = findParentDocPath(docs, current.node_path);
        if (parent) {
          const parentNode = findDocNode(docs, parent);
          if (parentNode) onNodeSelect(parentNode);
        }
      }
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onNodeSelect(current);
    }
  }

  function startNewDoc() {
    actionMode = "new-doc";
    draftName = "untitled.md";
    newDocType = "doc";
    actionError = null;
  }

  function startNewFolder() {
    actionMode = "new-folder";
    draftName = "new-folder";
    actionError = null;
  }

  function startRename() {
    if (!selectedNode) return;
    actionMode = "rename";
    draftName = selectedNode.name;
    actionError = null;
  }

  function startMove() {
    if (!selectedNode) return;
    actionMode = "move";
    moveDestination = defaultMoveDestination(docs, selectedNode, moveTargets);
    actionError = null;
  }

  function startDelete() {
    actionMode = "delete";
    actionError = null;
  }

  function cancelAction() {
    actionMode = null;
    actionError = null;
  }

  async function refreshDocs() {
    await onDocsChanged?.();
  }

  async function handleSaveAsNew(content: string) {
    if (!openDoc) {
      throw new Error("No document is open.");
    }

    const parent =
      findClosestExistingDocAncestor(docs, openDoc.path) ??
      findWritableDocRootForPath(docs, openDoc.path);
    if (!parent) {
      throw new Error("No writable folder is available for this document.");
    }

    const suggestedName = suggestAvailableName(docs, parent, restoredBasename(openDoc.basename));
    const created = await createDoc(parent, suggestedName, content);
    selectedPath = created.path;
    openDoc = created;
    openDocMissing = false;
    editorKey = created.path;
    await refreshDocs();
  }

  async function submitAction() {
    if (!selectedNode || !actionMode) return;
    actionPending = true;
    actionError = null;

    try {
      if (actionMode === "new-doc") {
        const initialContent = newDocType === "prd"
          ? `---\ntype: prd\n---\n`
          : "";
        const created = await createDoc(selectedNode.relative_path, draftName, initialContent);
        selectedPath = created.path;
        openDoc = created;
        openDocMissing = false;
        editorKey = created.path;
        await refreshDocs();
      } else if (actionMode === "new-folder") {
        const path = await createDocFolder(selectedNode.relative_path, draftName);
        selectedPath = path;
        openDoc = null;
        openDocMissing = false;
        await refreshDocs();
      } else if (actionMode === "rename") {
        const nextPath = await renameDocPath(selectedNode.relative_path, draftName);
        selectedPath = nextPath;
        if (selectedNode.kind === "doc") {
          openDoc = {
            path: nextPath,
            basename: basenameFromPath(nextPath),
            doc_type: selectedNode.doc_type ?? "doc",
          };
          openDocMissing = false;
        }
        await refreshDocs();
      } else if (actionMode === "move") {
        const nextPath = await moveDocPath(selectedNode.relative_path, moveDestination);
        selectedPath = nextPath;
        if (selectedNode.kind === "doc") {
          openDoc = {
            path: nextPath,
            basename: basenameFromPath(nextPath),
            doc_type: selectedNode.doc_type ?? "doc",
          };
          openDocMissing = false;
        }
        await refreshDocs();
      } else if (actionMode === "delete") {
        const parent = findClosestExistingDocAncestor(docs, selectedNode.relative_path);
        if (selectedNode.kind === "doc") {
          await deleteDocPath(selectedNode.relative_path);
          openDoc = null;
          openDocMissing = false;
        } else {
          await deleteDocFolder(selectedNode.relative_path);
        }
        selectedPath = parent;
        editorKey = parent;
        await refreshDocs();
      }

      actionMode = null;
    } catch (error) {
      actionError = error instanceof Error ? error.message : String(error);
    } finally {
      actionPending = false;
    }
  }
</script>

<div class="flex min-h-0 flex-1 overflow-hidden">
  <DocsTreePane
    {totalDocs}
    {flatNodes}
    {selectedPath}
    {expandedPaths}
    onTreeKeydown={handleTreeKeydown}
    onNodeSelect={onNodeSelect}
    onToggle={onToggle}
  />

  <section class="flex min-w-0 flex-1 flex-col">
    {#if selectedNode}
      <div class="border-b border-border/60 px-4 py-2">
        <div class="flex items-center justify-between gap-4">
          <div class="min-w-0">
            <p class="truncate font-mono text-[10px] text-muted-foreground">
              {selectedNode.relative_path}
            </p>
          </div>

          {#if prdTaskCounts && prdTaskCounts[1] > 0}
            <span class="font-mono text-[10px] text-muted-foreground">
              {prdTaskCounts[1]} tasks · {prdTaskCounts[0]} done
            </span>
          {/if}

          {#if canCreateInDocNode(selectedNode) || selectedNode.can_rename || selectedNode.can_move || selectedNode.can_delete}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger
                class="rounded-[4px] border border-border/60 px-1.5 py-0.5 text-muted-foreground transition-colors duration-[120ms] hover:bg-accent hover:text-foreground"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="5" cy="12" r="1.5" />
                  <circle cx="12" cy="12" r="1.5" />
                  <circle cx="19" cy="12" r="1.5" />
                </svg>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  class="z-50 min-w-[140px] rounded-[6px] border border-border/60 bg-popover p-0.5 shadow-lg backdrop-blur"
                  sideOffset={4}
                  align="end"
                >
                  {#if canCreateInDocNode(selectedNode)}
                    <DropdownMenu.Item
                      class="cursor-pointer rounded-[4px] px-2.5 py-1.5 font-mono text-[11px] text-foreground outline-none transition-colors duration-75 data-[highlighted]:bg-accent/50"
                      onSelect={startNewDoc}
                    >
                      New doc
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      class="cursor-pointer rounded-[4px] px-2.5 py-1.5 font-mono text-[11px] text-foreground outline-none transition-colors duration-75 data-[highlighted]:bg-accent/50"
                      onSelect={startNewFolder}
                    >
                      New folder
                    </DropdownMenu.Item>
                  {/if}
                  {#if canCreateInDocNode(selectedNode) && (selectedNode.can_rename || selectedNode.can_move || selectedNode.can_delete)}
                    <DropdownMenu.Separator class="my-0.5 h-px bg-border/60" />
                  {/if}
                  {#if selectedNode.can_rename}
                    <DropdownMenu.Item
                      class="cursor-pointer rounded-[4px] px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground outline-none transition-colors duration-75 data-[highlighted]:bg-accent/50 data-[highlighted]:text-foreground"
                      onSelect={startRename}
                    >
                      Rename
                    </DropdownMenu.Item>
                  {/if}
                  {#if selectedNode.can_move}
                    <DropdownMenu.Item
                      class="cursor-pointer rounded-[4px] px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground outline-none transition-colors duration-75 data-[highlighted]:bg-accent/50 data-[highlighted]:text-foreground"
                      onSelect={startMove}
                    >
                      Move
                    </DropdownMenu.Item>
                  {/if}
                  {#if selectedNode.can_delete}
                    <DropdownMenu.Item
                      class="cursor-pointer rounded-[4px] px-2.5 py-1.5 font-mono text-[11px] text-red-400 outline-none transition-colors duration-75 data-[highlighted]:bg-red-400/10"
                      onSelect={startDelete}
                    >
                      Delete
                    </DropdownMenu.Item>
                  {/if}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          {/if}
        </div>

        {#if actionMode}
          <div class="mt-2 flex flex-wrap items-center gap-2 border-t border-border/40 pt-2">
            {#if actionMode === "move"}
              <Select.Root type="single" bind:value={moveDestination} items={moveTargets.map(t => ({ value: t.relative_path, label: t.relative_path }))}>
                <Select.Trigger class="min-w-[220px] inline-flex items-center rounded-[4px] border border-border/60 bg-background px-2 py-1 font-mono text-[11px] text-foreground outline-none focus:border-ring">
                  {moveDestination || "Select destination"}
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content class="z-50 max-h-[200px] rounded-[6px] border border-border/60 bg-popover shadow-lg backdrop-blur" sideOffset={4}>
                    <Select.Viewport class="p-0.5">
                      {#each moveTargets as target}
                        <Select.Item class="cursor-pointer rounded-[4px] px-2 py-1 font-mono text-[11px] text-foreground outline-none transition-colors duration-75 data-[highlighted]:bg-accent/50" value={target.relative_path} label={target.relative_path}>
                          {target.relative_path}
                        </Select.Item>
                      {/each}
                    </Select.Viewport>
                  </Select.Content>
                </Select.Portal>
              </Select.Root>
            {:else if actionMode === "delete"}
              <span class="font-mono text-[10px] text-muted-foreground">
                {selectedNode.kind === "doc"
                  ? `Delete ${selectedNode.name}?`
                  : `Delete empty folder ${selectedNode.name}?`}
              </span>
            {:else if actionMode === "new-doc"}
              <Select.Root type="single" bind:value={newDocType} items={[{ value: "doc", label: "Doc" }, { value: "prd", label: "PRD" }]}>
                <Select.Trigger class="inline-flex items-center rounded-[4px] border border-border/60 bg-background px-2 py-1 font-mono text-[11px] text-foreground outline-none focus:border-ring">
                  {newDocType === "prd" ? "PRD" : "Doc"}
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content class="z-50 rounded-[6px] border border-border/60 bg-popover shadow-lg backdrop-blur" sideOffset={4}>
                    <Select.Viewport class="p-0.5">
                      <Select.Item class="cursor-pointer rounded-[4px] px-2 py-1 font-mono text-[11px] text-foreground outline-none transition-colors duration-75 data-[highlighted]:bg-accent/50" value="doc" label="Doc">Doc</Select.Item>
                      <Select.Item class="cursor-pointer rounded-[4px] px-2 py-1 font-mono text-[11px] text-foreground outline-none transition-colors duration-75 data-[highlighted]:bg-accent/50" value="prd" label="PRD">PRD</Select.Item>
                    </Select.Viewport>
                  </Select.Content>
                </Select.Portal>
              </Select.Root>
              <input
                bind:value={draftName}
                class="min-w-[220px] rounded-[4px] border border-border/60 bg-background px-2 py-1 font-mono text-[11px] text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-ring"
                placeholder="untitled.md"
              />
            {:else}
              <input
                bind:value={draftName}
                class="min-w-[220px] rounded-[4px] border border-border/60 bg-background px-2 py-1 font-mono text-[11px] text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-ring"
                placeholder="name"
              />
            {/if}

            <button
              type="button"
              class="rounded-[4px] border border-border/60 px-2 py-1 font-mono text-[10px] text-foreground transition-colors duration-[120ms] hover:bg-accent disabled:opacity-50"
              disabled={actionPending || (actionMode === "move" && !moveDestination)}
              onclick={() => void submitAction()}
            >
              {actionPending
                ? "Working..."
                : actionMode === "delete"
                  ? "Confirm"
                  : actionMode === "move"
                    ? "Move"
                    : "Save"}
            </button>
            <button
              type="button"
              class="rounded-[4px] border border-border/60 px-2 py-1 font-mono text-[10px] text-muted-foreground transition-colors duration-[120ms] hover:bg-accent hover:text-foreground"
              onclick={cancelAction}
            >
              Cancel
            </button>
          </div>
        {/if}

        {#if actionError}
          <p class="mt-2 font-mono text-[10px] text-muted-foreground">{actionError}</p>
        {/if}
      </div>
    {/if}

    {#if selectedDoc}
      <DocsEditor
        doc={selectedDoc}
        editorKey={editorKey ?? undefined}
        {externalRevision}
        {externalPaths}
        missingOnDisk={openDocMissing}
        onSaveAsNew={handleSaveAsNew}
        onClose={onEditorClose}
      />
    {:else if selectedNode}
      <DocsFolderView
        {selectedNode}
        {selectedChildren}
        onNodeSelect={onNodeSelect}
      />
    {:else}
      <div class="flex flex-1 flex-col items-center justify-center gap-2">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground/30">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
          <polyline points="14,2 14,8 20,8" />
        </svg>
        <span class="font-mono text-[12px] text-muted-foreground/50">Select a document</span>
      </div>
    {/if}
  </section>
</div>
