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
  import DocsEditor from "$lib/components/DocsEditor.svelte";
  import { cn } from "$lib/utils";

  type FlatNode = {
    node: DocNode;
    depth: number;
  };

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

  const totalDocs = $derived(countDocs(docs));
  const flatNodes = $derived(flattenNodes(docs, expandedPaths));
  const selectedNode = $derived(selectedPath ? findNode(docs, selectedPath) : null);
  const selectedDoc = $derived(openDoc);
  const selectedChildren = $derived(selectedNode?.kind === "doc" ? [] : selectedNode?.children ?? []);
  const selectedBreadcrumbs = $derived(
    selectedNode
      ? selectedNode.relative_path.split("/").filter(Boolean)
      : openDoc?.path.split("/").filter(Boolean) ?? [],
  );
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
      for (const ancestor of findAncestors(docs, selectedPath)) {
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

    const currentNode = selectedPath ? findNode(docs, selectedPath) : null;
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
    if (selectedDoc && selectedNode?.doc_type === "prd") {
      getPrdTaskCounts(selectedDoc.path).then((counts) => {
        prdTaskCounts = counts;
      }).catch(() => {
        prdTaskCounts = null;
      });
    } else {
      prdTaskCounts = null;
    }
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
    const parent = findClosestExistingAncestor(docs, selectedPath ?? openDoc?.path ?? null);
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
        const parent = findParentPath(docs, current.node_path);
        if (parent) {
          const parentNode = findNode(docs, parent);
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
      findClosestExistingAncestor(docs, openDoc.path) ?? findWritableRootForPath(docs, openDoc.path);
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
        const parent = findClosestExistingAncestor(docs, selectedNode.relative_path);
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

  function folderKindLabel(node: DocNode) {
    if (node.kind === "root") {
      return node.read_only ? "read-only source" : "writable source";
    }
    return node.read_only ? "read-only folder" : "folder";
  }

  function countDocs(nodes: DocNode[]): number {
    return nodes.reduce((count, node) => {
      if (node.kind === "doc") return count + 1;
      return count + countDocs(node.children);
    }, 0);
  }

  function flattenNodes(nodes: DocNode[], expanded: Set<string>, depth = 0): FlatNode[] {
    const items: FlatNode[] = [];
    for (const node of nodes) {
      items.push({ node, depth });
      if (node.kind !== "doc" && expanded.has(node.node_path)) {
        items.push(...flattenNodes(node.children, expanded, depth + 1));
      }
    }
    return items;
  }

  function findNode(nodes: DocNode[], nodePath: string): DocNode | null {
    for (const node of nodes) {
      if (node.node_path === nodePath) return node;
      const child = findNode(node.children, nodePath);
      if (child) return child;
    }
    return null;
  }

  function findAncestors(nodes: DocNode[], nodePath: string, trail: string[] = []): string[] {
    for (const node of nodes) {
      const nextTrail = [...trail, node.node_path];
      if (node.node_path === nodePath) {
        return trail;
      }
      const childTrail = findAncestors(node.children, nodePath, nextTrail);
      if (childTrail.length) return childTrail;
    }
    return [];
  }

  function findParentPath(nodes: DocNode[], nodePath: string, parent: string | null = null): string | null {
    for (const node of nodes) {
      if (node.node_path === nodePath) return parent;
      const childParent = findParentPath(node.children, nodePath, node.node_path);
      if (childParent !== null) return childParent;
    }
    return null;
  }

  function findRootPath(nodes: DocNode[], nodePath: string, currentRoot: string | null = null): string | null {
    for (const node of nodes) {
      const nextRoot = node.kind === "root" ? node.node_path : currentRoot;
      if (node.node_path === nodePath) return nextRoot;
      const childRoot = findRootPath(node.children, nodePath, nextRoot);
      if (childRoot !== null) return childRoot;
    }
    return null;
  }

  function findClosestExistingAncestor(nodes: DocNode[], path: string | null) {
    if (!path) return null;

    let current = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    while (current) {
      if (findNode(nodes, current)) {
        return current;
      }
      current = current.includes("/") ? current.slice(0, current.lastIndexOf("/")) : "";
    }

    return null;
  }

  function findWritableRootForPath(nodes: DocNode[], path: string) {
    for (const node of nodes) {
      if (
        node.kind === "root" &&
        !node.read_only &&
        (path === node.relative_path || path.startsWith(`${node.relative_path}/`))
      ) {
        return node.relative_path;
      }
    }

    return null;
  }

  function collectMoveTargets(nodes: DocNode[], target: DocNode): DocNode[] {
    const rootPath = findRootPath(nodes, target.node_path);
    if (!rootPath) return [];

    const items: DocNode[] = [];
    visitNodes(nodes, (node) => {
      if (node.kind === "doc" || node.read_only) return;
      if (findRootPath(nodes, node.node_path) !== rootPath) return;
      if (node.node_path === target.node_path) return;
      if (target.kind !== "doc" && node.node_path.startsWith(`${target.node_path}/`)) return;
      items.push(node);
    });

    return items.sort((left, right) => left.relative_path.localeCompare(right.relative_path));
  }

  function visitNodes(nodes: DocNode[], callback: (node: DocNode) => void) {
    for (const node of nodes) {
      callback(node);
      visitNodes(node.children, callback);
    }
  }

  function defaultMoveDestination(nodes: DocNode[], target: DocNode, options: DocNode[]) {
    const currentParent = findParentPath(nodes, target.node_path);
    if (currentParent && options.some((node) => node.relative_path === currentParent)) {
      return currentParent;
    }
    return options[0]?.relative_path ?? "";
  }

  function canCreateInSelectedNode(node: DocNode | null) {
    return !!node && node.kind !== "doc" && node.can_create;
  }

  function renderActionTitle(node: DocNode) {
    if (node.kind === "doc") return "Document actions";
    return "Folder actions";
  }

  function basenameFromPath(path: string) {
    return path.split("/").pop() ?? path;
  }

  function restoredBasename(name: string) {
    const dot = name.lastIndexOf(".");
    if (dot <= 0) {
      return `${name}-restored`;
    }

    return `${name.slice(0, dot)}-restored${name.slice(dot)}`;
  }

  function suggestAvailableName(nodes: DocNode[], parentPath: string, baseName: string) {
    let candidate = baseName;
    let counter = 2;

    while (hasChildNamed(nodes, parentPath, candidate)) {
      candidate = appendOrdinal(baseName, counter);
      counter += 1;
    }

    return candidate;
  }

  function hasChildNamed(nodes: DocNode[], parentPath: string, name: string) {
    const parent = findNode(nodes, parentPath);
    return parent?.children.some((child) => child.name === name) ?? false;
  }

  function appendOrdinal(name: string, counter: number) {
    const dot = name.lastIndexOf(".");
    if (dot <= 0) {
      return `${name}-${counter}`;
    }

    return `${name.slice(0, dot)}-${counter}${name.slice(dot)}`;
  }
</script>

<div class="flex min-h-0 flex-1 overflow-hidden">
  <aside class="flex w-[240px] min-w-[240px] flex-col border-r border-border/60">
    <div class="flex items-center justify-between border-b border-border/60 px-3 py-2">
      <span class="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
        Documents
      </span>
      <span class="font-mono text-[10px] text-muted-foreground/60">
        {totalDocs}
      </span>
    </div>

    <div
      class="docs-tree flex-1 overflow-y-auto overflow-x-auto outline-none"
      role="tree"
      tabindex="0"
      onkeydown={handleTreeKeydown}
    >
      {#if flatNodes.length === 0}
        <div class="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground/30">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
            <polyline points="14,2 14,8 20,8" />
          </svg>
          <span class="font-mono text-[12px] text-muted-foreground/50">No documents</span>
        </div>
      {:else}
        {#each flatNodes as item}
          <button
            type="button"
            class={cn(
              "flex h-8 w-full items-center transition-colors duration-[120ms] hover:bg-accent/30",
              selectedPath === item.node.node_path && "bg-accent/50 border-l-2 border-l-ring",
            )}
            style={`padding-left: ${Math.min(12 + item.depth * 16, 108)}px;`}
            onclick={() => onNodeSelect(item.node)}
          >
            {#if item.node.kind === "doc"}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="mr-1.5 shrink-0 text-muted-foreground/50">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                <polyline points="14,2 14,8 20,8" />
              </svg>
            {:else}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <span
                class="mr-1 flex shrink-0 cursor-pointer items-center justify-center text-muted-foreground/50 transition-transform duration-[120ms]"
                class:rotate-90={expandedPaths.has(item.node.node_path)}
                onclick={(e) => { e.stopPropagation(); onToggle(item.node); }}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3.5,2 6.5,5 3.5,8" />
                </svg>
              </span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="mr-1.5 shrink-0 text-muted-foreground/50">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2Z" />
              </svg>
            {/if}

            <span class="min-w-0 flex-1 truncate text-left text-[12px] text-foreground">{item.node.name}</span>

            {#if item.node.doc_type === "prd"}
              <span class="ml-1 shrink-0 rounded-[3px] border border-border/60 px-1 font-mono text-[9px] leading-[14px] text-muted-foreground">
                PRD
              </span>
            {/if}

            {#if item.node.read_only}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="ml-1 shrink-0 text-muted-foreground/30">
                <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            {/if}
          </button>
        {/each}
      {/if}
    </div>
  </aside>

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

          <div class="flex shrink-0 items-center gap-1">
            {#if canCreateInSelectedNode(selectedNode)}
              <button
                type="button"
                class="rounded-[4px] border border-border/60 px-2 py-0.5 font-mono text-[10px] text-foreground transition-colors duration-[120ms] hover:bg-accent"
                onclick={startNewDoc}
              >
                New doc
              </button>
              <button
                type="button"
                class="rounded-[4px] border border-border/60 px-2 py-0.5 font-mono text-[10px] text-foreground transition-colors duration-[120ms] hover:bg-accent"
                onclick={startNewFolder}
              >
                New folder
              </button>
            {/if}

            {#if selectedNode.can_rename}
              <button
                type="button"
                class="rounded-[4px] border border-border/60 px-2 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors duration-[120ms] hover:bg-accent hover:text-foreground"
                onclick={startRename}
              >
                Rename
              </button>
            {/if}

            {#if selectedNode.can_move}
              <button
                type="button"
                class="rounded-[4px] border border-border/60 px-2 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors duration-[120ms] hover:bg-accent hover:text-foreground"
                onclick={startMove}
              >
                Move
              </button>
            {/if}

            {#if selectedNode.can_delete}
              <button
                type="button"
                class="rounded-[4px] border border-border/60 px-2 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors duration-[120ms] hover:bg-accent hover:text-foreground"
                onclick={startDelete}
              >
                Delete
              </button>
            {/if}
          </div>
        </div>

        {#if actionMode}
          <div class="mt-2 flex flex-wrap items-center gap-2 border-t border-border/40 pt-2">
            {#if actionMode === "move"}
              <select
                bind:value={moveDestination}
                class="min-w-[220px] rounded-[4px] border border-border/60 bg-background px-2 py-1 font-mono text-[11px] text-foreground outline-none focus:border-ring"
              >
                {#each moveTargets as target}
                  <option value={target.relative_path}>{target.relative_path}</option>
                {/each}
              </select>
            {:else if actionMode === "delete"}
              <span class="font-mono text-[10px] text-muted-foreground">
                {selectedNode.kind === "doc"
                  ? `Delete ${selectedNode.name}?`
                  : `Delete empty folder ${selectedNode.name}?`}
              </span>
            {:else if actionMode === "new-doc"}
              <select
                bind:value={newDocType}
                class="rounded-[4px] border border-border/60 bg-background px-2 py-1 font-mono text-[11px] text-foreground outline-none focus:border-ring"
              >
                <option value="doc">Doc</option>
                <option value="prd">PRD</option>
              </select>
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
      <div class="flex min-h-0 flex-1 flex-col">
        <div class="border-b border-border/60 px-4 py-2.5">
          <div class="flex items-center gap-2">
            <span class="text-[14px] text-foreground">{selectedNode.name}</span>
            <span class="font-mono text-[10px] text-muted-foreground/60">
              {selectedChildren.length} items
            </span>
            {#if selectedNode.read_only}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground/40">
                <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            {/if}
          </div>
        </div>

        <div class="flex-1 overflow-y-auto">
          {#if selectedChildren.length === 0}
            <div class="flex h-full items-center justify-center px-6 py-12">
              <div class="text-center">
                <span class="font-mono text-[12px] text-muted-foreground/50">No documents</span>
              </div>
            </div>
          {:else}
            {#each selectedChildren as child}
              <button
                type="button"
                class="flex h-8 w-full items-center gap-1.5 border-b border-border/30 px-4 text-left transition-colors duration-[120ms] hover:bg-accent/30"
                onclick={() => onNodeSelect(child)}
              >
                {#if child.kind === "doc"}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 text-muted-foreground/50">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                    <polyline points="14,2 14,8 20,8" />
                  </svg>
                {:else}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 text-muted-foreground/50">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2Z" />
                  </svg>
                {/if}
                <span class="min-w-0 flex-1 truncate text-[12px] text-foreground">{child.name}</span>
                {#if child.doc_type === "prd"}
                  <span class="ml-1 shrink-0 rounded-[3px] border border-border/60 px-1 font-mono text-[9px] leading-[14px] text-muted-foreground">
                    PRD
                  </span>
                {/if}
              </button>
            {/each}
          {/if}
        </div>
      </div>
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

<style>
  .docs-tree {
    scrollbar-width: thin;
    scrollbar-color: rgb(42 42 42 / 0.4) transparent;
  }

  .docs-tree::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }

  .docs-tree::-webkit-scrollbar-track {
    background: transparent;
  }

  .docs-tree::-webkit-scrollbar-thumb {
    background: rgb(42 42 42 / 0.4);
    border-radius: 3px;
  }
</style>
