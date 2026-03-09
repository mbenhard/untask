<script lang="ts">
  import { readDoc, saveDoc, type DocInfo } from "$lib/api";
  import MilkdownEditor from "$lib/components/MilkdownEditor.svelte";
  import { splitFrontmatter } from "$lib/frontmatter";

  let {
    doc,
    editorKey = doc.path,
    externalRevision = 0,
    externalPaths = [],
    missingOnDisk = false,
    onSaveAsNew,
    onClose,
  }: {
    doc: DocInfo;
    editorKey?: string;
    externalRevision?: number;
    externalPaths?: string[];
    missingOnDisk?: boolean;
    onSaveAsNew?: (content: string) => Promise<void>;
    onClose: () => void;
  } = $props();

  let content = $state<string | null>(null);
  let loading = $state(true);
  let frontmatterPrefix = $state("");
  let loadedEditorKey = $state<string | null>(null);
  let savePath = $state("");
  let liveContent = $state("");
  let lastExternalRevision = $state(0);
  let dirty = $state(false);
  let focused = $state(false);
  let stale = $state(false);
  let staleMessage = $state("File changed on disk.");
  let saveError = $state<string | null>(null);
  let saveAsNewPending = $state(false);
  let saveAsNewError = $state<string | null>(null);

  $effect(() => {
    if (loadedEditorKey !== editorKey) {
      loadedEditorKey = editorKey;
      savePath = doc.path;
      liveContent = "";
      dirty = false;
      focused = false;
      stale = false;
      staleMessage = "File changed on disk.";
      saveAsNewError = null;
      loadDoc(doc.path);
      return;
    }

    if (savePath !== doc.path) {
      savePath = doc.path;
    }
  });

  $effect(() => {
    if (!loadedEditorKey || externalRevision === 0 || externalRevision === lastExternalRevision) {
      return;
    }

    lastExternalRevision = externalRevision;
    if (!externalPathsAffectDoc(doc.path, externalPaths)) {
      return;
    }

    if (dirty || focused) {
      stale = true;
      staleMessage = "File changed on disk while you were editing.";
      return;
    }

    void reloadFromDisk();
  });

  $effect(() => {
    if (!missingOnDisk) {
      return;
    }

    stale = true;
    staleMessage = "File was moved or removed on disk.";
  });

  async function loadDoc(path: string) {
    loading = true;
    try {
      const detail = await readDoc(path);
      const { prefix, body } = splitFrontmatter(detail.content);
      frontmatterPrefix = prefix;
      content = body;
      liveContent = body;
    } catch (e) {
      console.error("Failed to load doc:", e);
      content = "";
      liveContent = "";
    }
    loading = false;
  }

  async function reloadFromDisk() {
    loading = true;
    try {
      const detail = await readDoc(doc.path);
      const { prefix, body } = splitFrontmatter(detail.content);
      frontmatterPrefix = prefix;
      content = body;
      liveContent = body;
      stale = false;
      staleMessage = "File changed on disk.";
    } catch (e) {
      console.error("Failed to reload doc:", e);
      stale = true;
      staleMessage = "File changed or was removed on disk.";
    }
    loading = false;
  }

  async function handleSave(markdown: string) {
    const fullContent = frontmatterPrefix + markdown;
    try {
      await saveDoc(savePath, fullContent);
      liveContent = markdown;
      stale = false;
      saveError = null;
      staleMessage = "File changed on disk.";
    } catch {
      saveError = "Could not save — check file permissions";
    }
  }

  async function handleSaveAsNew() {
    if (!onSaveAsNew || content == null) {
      return;
    }

    saveAsNewPending = true;
    saveAsNewError = null;
    try {
      await onSaveAsNew(frontmatterPrefix + liveContent);
      stale = false;
      staleMessage = "File changed on disk.";
    } catch (e) {
      console.error("Failed to save doc as new:", e);
      saveAsNewError = e instanceof Error ? e.message : String(e);
    } finally {
      saveAsNewPending = false;
    }
  }

  function externalPathsAffectDoc(path: string, paths: string[]) {
    const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    return paths.some((changedPath) => {
      if (changedPath === ".unship/config.yml") return true;
      if (changedPath === path) return true;
      if (parent && changedPath === parent) return true;
      return parent ? changedPath.startsWith(`${parent}/`) : false;
    });
  }
</script>

<div class="flex min-h-0 flex-1 flex-col">
  <!-- Breadcrumb header -->
  <div class="border-b border-border/60 px-4 py-2">
    <div class="flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
      {#each doc.path.split("/").filter(Boolean) as segment, i}
        {#if i > 0}
          <span class="text-muted-foreground/40">&gt;</span>
        {/if}
        {#if i === doc.path.split("/").filter(Boolean).length - 1}
          <span class="text-foreground">{segment}</span>
        {:else}
          <span class="text-muted-foreground/60">{segment}</span>
        {/if}
      {/each}
    </div>
    <p class="mt-0.5 text-[16px] text-foreground">{doc.basename}</p>
  </div>

  {#if stale}
    <div class="mx-4 mt-2 rounded-[6px] border border-border/60 border-l-2 border-l-border px-3 py-2">
      <div class="flex items-center justify-between gap-3">
        <span class="font-mono text-[10px] text-muted-foreground">{staleMessage}</span>
        <div class="flex items-center gap-1.5">
          <button
            type="button"
            class="rounded-[4px] border border-border/60 px-2 py-0.5 font-mono text-[10px] text-foreground transition-colors duration-[120ms] hover:bg-accent"
            onclick={() => void reloadFromDisk()}
          >
            Reload
          </button>
          {#if missingOnDisk && onSaveAsNew}
            <button
              type="button"
              class="rounded-[4px] px-2 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors duration-[120ms] hover:bg-accent hover:text-foreground disabled:opacity-50"
              disabled={saveAsNewPending}
              onclick={() => void handleSaveAsNew()}
            >
              {saveAsNewPending ? "Saving..." : "Save as new"}
            </button>
          {/if}
          <button
            type="button"
            class="rounded-[4px] px-2 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors duration-[120ms] hover:bg-accent hover:text-foreground"
            onclick={() => {
              stale = false;
              staleMessage = "File changed on disk.";
            }}
          >
            Keep editing
          </button>
        </div>
      </div>
      {#if saveAsNewError}
        <p class="mt-1 font-mono text-[10px] text-muted-foreground">{saveAsNewError}</p>
      {/if}
    </div>
  {/if}

  {#if saveError}
    <div class="mx-4 mt-2 flex items-center justify-between rounded-[6px] border border-border/60 border-l-2 border-l-border px-3 py-1.5">
      <span class="font-mono text-[10px] text-muted-foreground">{saveError}</span>
      <button
        type="button"
        aria-label="Dismiss"
        class="rounded-[4px] p-0.5 text-muted-foreground/40 transition-colors duration-[120ms] hover:text-muted-foreground"
        onclick={() => { saveError = null; }}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
  {/if}

  {#if loading}
    <div class="flex flex-1 items-center justify-center">
      <span class="animate-pulse font-mono text-[11px] text-muted-foreground">Loading...</span>
    </div>
  {:else if content != null}
    <div class="min-h-0 flex-1 overflow-y-auto">
      <MilkdownEditor
        content={content}
        saveOnBlur={true}
        onSave={handleSave}
        onContentChange={(value) => (liveContent = value)}
        onDirtyChange={(value) => (dirty = value)}
        onFocusChange={(value) => (focused = value)}
      />
    </div>
  {/if}
</div>
