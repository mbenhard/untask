<script lang="ts">
  import { readDoc, saveDoc, type DocInfo } from "$lib/api";
  import MilkdownEditor from "$lib/components/MilkdownEditor.svelte";

  let {
    doc,
    onClose,
  }: {
    doc: DocInfo;
    onClose: () => void;
  } = $props();

  let content = $state<string | null>(null);
  let loading = $state(true);
  let frontmatter = $state("");

  $effect(() => {
    loadDoc(doc.path);
  });

  async function loadDoc(path: string) {
    loading = true;
    try {
      const detail = await readDoc(path);
      const { fm, body } = splitFrontmatter(detail.content);
      frontmatter = fm;
      content = body;
    } catch (e) {
      console.error("Failed to load doc:", e);
      content = "";
    }
    loading = false;
  }

  function splitFrontmatter(raw: string): { fm: string; body: string } {
    const trimmed = raw.trimStart();
    if (!trimmed.startsWith("---")) return { fm: "", body: raw };

    const afterOpen = trimmed.indexOf("\n", 3);
    if (afterOpen === -1) return { fm: "", body: raw };

    const closeIdx = trimmed.indexOf("\n---", afterOpen + 1);
    if (closeIdx === -1) return { fm: "", body: raw };

    const fmEnd = closeIdx + 4;
    const restOfLine = trimmed.indexOf("\n", fmEnd);
    const fm = trimmed.slice(0, restOfLine === -1 ? fmEnd : restOfLine + 1);
    const body = restOfLine === -1 ? "" : trimmed.slice(restOfLine + 1);

    return { fm, body };
  }

  async function handleSave(markdown: string) {
    const fullContent = frontmatter ? frontmatter + "\n" + markdown : markdown;
    try {
      await saveDoc(doc.path, fullContent);
    } catch (e) {
      console.error("Failed to save doc:", e);
    }
  }
</script>

<div class="flex min-h-0 flex-1 flex-col">
  <!-- Header -->
  <div class="flex items-center gap-2 border-b border-border/80 px-4 py-2.5">
    <button
      type="button"
      class="rounded-[4px] border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      onclick={onClose}
    >
      &larr; Back
    </button>
    <span class="text-[13px] font-medium text-foreground">{doc.basename}</span>
    <span class="font-mono text-[10px] text-muted-foreground">{doc.path}</span>
  </div>

  {#if loading}
    <div class="flex flex-1 items-center justify-center">
      <span class="font-mono text-[11px] text-muted-foreground">Loading...</span>
    </div>
  {:else if content != null}
    <div class="min-h-0 flex-1 overflow-y-auto">
      <MilkdownEditor content={content} onSave={handleSave} />
    </div>
  {/if}
</div>
