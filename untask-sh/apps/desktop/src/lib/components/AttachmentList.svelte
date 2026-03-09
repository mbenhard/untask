<script lang="ts">
  import { open } from "@tauri-apps/plugin-dialog";
  import {
    attachFile,
    attachFileBytes,
    deleteAttachment,
    getAttachmentDataUrl,
    getAttachmentPath,
    openAttachment,
    readAttachmentText,
    type AttachmentRefDto,
    type AttachmentTextPreviewDto,
  } from "$lib/api";

  type AttachmentStatus = "pending" | "ready" | "missing" | "invalid";
  type AttachmentPreview =
    | {
        kind: "image" | "pdf";
        filename: string;
        mimeType: string;
        size: number;
        src: string;
      }
    | {
        kind: "text";
        filename: string;
        mimeType: string;
        size: number;
        content: string;
        truncated: boolean;
      }
    | {
        kind: "unsupported";
        filename: string;
        mimeType: string;
        size: number;
      }
    | {
        kind: "broken";
        filename: string;
        mimeType: string;
        size: number;
        reason: "Missing on disk" | "Invalid reference";
      };

  let {
    taskId,
    attachments,
    readonly = false,
    dropActive = false,
    onTaskUpdated,
  }: {
    taskId: number;
    attachments: AttachmentRefDto[];
    readonly?: boolean;
    dropActive?: boolean;
    onTaskUpdated: () => void;
  } = $props();

  let uploading = $state(false);
  let selectedFilename = $state<string | null>(null);
  let preview = $state<AttachmentPreview | null>(null);
  let previewLoading = $state(false);
  let previewError = $state<string | null>(null);
  let attachFeedback = $state<string | null>(null);
  let attachmentState = $state<
    Record<
      string,
      { status: AttachmentStatus; path?: string; thumbnailUrl?: string; error?: string }
    >
  >({});

  const textPreviewExtensions = new Set([
    "txt",
    "md",
    "json",
    "csv",
    "log",
    "yaml",
    "yml",
    "xml",
    "html",
  ]);
  let attachFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

  function isImage(mime: string): boolean {
    return mime.startsWith("image/");
  }

  function isPdf(mime: string): boolean {
    return mime === "application/pdf";
  }

  function supportsTextPreview(filename: string): boolean {
    const ext = filename.split(".").pop()?.toLowerCase();
    return ext ? textPreviewExtensions.has(ext) : false;
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function extFromMime(mime: string): string {
    if (mime === "image/png") return "png";
    if (mime === "image/jpeg") return "jpg";
    if (mime === "image/gif") return "gif";
    if (mime === "image/webp") return "webp";
    return "png";
  }

  function classifyError(error: unknown): "missing" | "invalid" {
    const message =
      error instanceof Error ? error.message : typeof error === "string" ? error : String(error);
    return message.includes("invalid attachment filename") ? "invalid" : "missing";
  }

  function setAttachFeedback(message: string) {
    attachFeedback = message;
    if (attachFeedbackTimer != null) {
      clearTimeout(attachFeedbackTimer);
    }
    attachFeedbackTimer = setTimeout(() => {
      attachFeedback = null;
      attachFeedbackTimer = null;
    }, 1400);
  }

  function metaLabel(att: AttachmentRefDto): string {
    const resolved = attachmentState[att.filename];
    if (resolved?.status === "missing") return "Missing on disk";
    if (resolved?.status === "invalid") return "Invalid reference";
    return `${formatSize(att.size)}${att.mime_type ? ` · ${att.mime_type}` : ""}`;
  }

  async function attachPaths(paths: string[]) {
    if (readonly || paths.length === 0) return;
    uploading = true;
    attachFeedback = null;
    try {
      for (const filePath of paths) {
        await attachFile(taskId, filePath);
      }
      setAttachFeedback(`attached ${paths.length} file${paths.length === 1 ? "" : "s"}`);
      onTaskUpdated();
    } catch (error) {
      console.error("Failed to attach files:", error);
    } finally {
      uploading = false;
    }
  }

  export async function handleAttach() {
    const selected = await open({
      multiple: true,
      title: "Attach files",
    });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    await attachPaths(paths);
  }

  export async function handleDroppedFiles(files: File[]) {
    if (readonly || files.length === 0) return;
    uploading = true;
    attachFeedback = null;
    try {
      for (const file of files) {
        const buffer = await file.arrayBuffer();
        const bytes = Array.from(new Uint8Array(buffer));
        await attachFileBytes(
          taskId,
          bytes,
          file.name || `drop-${Date.now()}`,
          file.type || "application/octet-stream",
        );
      }
      setAttachFeedback(`attached ${files.length} file${files.length === 1 ? "" : "s"}`);
      onTaskUpdated();
    } catch (error) {
      console.error("Failed to attach dropped files:", error);
    } finally {
      uploading = false;
    }
  }

  async function handleDelete(filename: string) {
    try {
      await deleteAttachment(taskId, filename);
      if (selectedFilename === filename) {
        selectedFilename = null;
        preview = null;
        previewError = null;
      }
      onTaskUpdated();
    } catch (error) {
      console.error("Failed to delete attachment:", error);
    }
  }

  export async function handlePaste(e: ClipboardEvent) {
    if (readonly) return;
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (!item.type.startsWith("image/")) continue;

      e.preventDefault();
      const blob = item.getAsFile();
      if (!blob) continue;

      uploading = true;
      attachFeedback = null;
      try {
        const buffer = await blob.arrayBuffer();
        const bytes = Array.from(new Uint8Array(buffer));
        const ext = extFromMime(item.type);
        const filename = `paste-${Date.now()}.${ext}`;
        await attachFileBytes(taskId, bytes, filename, item.type);
        setAttachFeedback("attached 1 file");
        onTaskUpdated();
      } catch (error) {
        console.error("Failed to paste attachment:", error);
      } finally {
        uploading = false;
      }
      return;
    }
  }

  async function ensureResolved(att: AttachmentRefDto) {
    const cached = attachmentState[att.filename];
    if (cached) return cached;

    attachmentState = {
      ...attachmentState,
      [att.filename]: { status: "pending" },
    };

    try {
      const path = await getAttachmentPath(taskId, att.filename);
      const thumbnailUrl = isImage(att.mime_type)
        ? await getAttachmentDataUrl(taskId, att.filename)
        : undefined;
      const resolved = {
        status: "ready" as const,
        path,
        thumbnailUrl,
      };
      attachmentState = {
        ...attachmentState,
        [att.filename]: resolved,
      };
      return resolved;
    } catch (error) {
      const status = classifyError(error);
      const resolved = {
        status,
        error: error instanceof Error ? error.message : String(error),
      };
      attachmentState = {
        ...attachmentState,
        [att.filename]: resolved,
      };
      return resolved;
    }
  }

  async function showPreview(att: AttachmentRefDto) {
    selectedFilename = att.filename;
    previewError = null;
    previewLoading = true;

    try {
      const resolved = await ensureResolved(att);
      if (resolved.status === "missing" || resolved.status === "invalid") {
        preview = {
          kind: "broken",
          filename: att.filename,
          mimeType: att.mime_type,
          size: att.size,
          reason: resolved.status === "invalid" ? "Invalid reference" : "Missing on disk",
        };
        return;
      }

      if (resolved.status === "ready" && isImage(att.mime_type)) {
        const src = resolved.thumbnailUrl ?? (await getAttachmentDataUrl(taskId, att.filename));
        preview = {
          kind: "image",
          filename: att.filename,
          mimeType: att.mime_type,
          size: att.size,
          src,
        };
        return;
      }

      if (resolved.status === "ready" && isPdf(att.mime_type)) {
        const src = await getAttachmentDataUrl(taskId, att.filename);
        preview = {
          kind: "pdf",
          filename: att.filename,
          mimeType: att.mime_type,
          size: att.size,
          src,
        };
        return;
      }

      if (supportsTextPreview(att.filename)) {
        const textPreview: AttachmentTextPreviewDto = await readAttachmentText(taskId, att.filename);
        preview = {
          kind: "text",
          filename: textPreview.filename,
          mimeType: textPreview.mime_type,
          size: att.size,
          content: textPreview.content,
          truncated: textPreview.truncated,
        };
        return;
      }

      preview = {
        kind: "unsupported",
        filename: att.filename,
        mimeType: att.mime_type,
        size: att.size,
      };
    } catch (error) {
      previewError = error instanceof Error ? error.message : String(error);
      preview = {
        kind: "broken",
        filename: att.filename,
        mimeType: att.mime_type,
        size: att.size,
        reason: classifyError(error) === "invalid" ? "Invalid reference" : "Missing on disk",
      };
    } finally {
      previewLoading = false;
    }
  }

  async function openExternal(att: AttachmentRefDto) {
    try {
      const resolved = await ensureResolved(att);
      if (resolved.status !== "ready" || !resolved.path) return;
      await openAttachment(taskId, att.filename);
    } catch (error) {
      console.error("Failed to open attachment:", error);
    }
  }

  let visible = $derived(attachments.length > 0);

  $effect(() => {
    if (selectedFilename && !attachments.some((attachment) => attachment.filename === selectedFilename)) {
      selectedFilename = null;
      preview = null;
      previewError = null;
    }

    for (const attachment of attachments) {
      void ensureResolved(attachment);
    }
  });
</script>

{#if visible}
  <div
    class={`mx-4 mt-2 mb-3 overflow-hidden rounded-[6px] border transition-colors duration-[120ms] ${
      dropActive ? "border-foreground/24 bg-accent/18" : "border-border/60"
    }`}
  >
    <div class="flex items-center gap-2 border-b border-border/40 px-3 py-2">
      <span class="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/60">
        Attachments
      </span>
      <span class="font-mono text-[10px] text-muted-foreground/50">{attachments.length}</span>
      {#if uploading}
        <span class="animate-pulse font-mono text-[10px] text-muted-foreground/40">syncing...</span>
      {:else if attachFeedback}
        <span class="font-mono text-[10px] text-muted-foreground/45">{attachFeedback}</span>
      {/if}
      {#if !readonly}
        <span class="ml-auto font-mono text-[10px] text-muted-foreground/35">
          {dropActive ? "drop to attach" : "paste or drop files"}
        </span>
      {/if}
    </div>

    {#each attachments as att (att.filename)}
      {@const resolved = attachmentState[att.filename]}
      {@const selected = selectedFilename === att.filename}
      <div class="group flex items-stretch gap-2 border-b border-border/40 px-3 py-1.5">
        <button
          type="button"
          class={`flex min-w-0 flex-1 items-center gap-2 rounded-[4px] px-1 py-0.5 text-left transition-colors duration-[120ms] ${
            selected ? "bg-accent/60" : "hover:bg-accent/40"
          }`}
          onclick={() => showPreview(att)}
        >
          {#if isImage(att.mime_type) && resolved?.status === "ready" && resolved.thumbnailUrl}
            <img
              src={resolved.thumbnailUrl}
              alt={att.filename}
              class="h-8 w-8 shrink-0 rounded-[4px] border border-border/40 object-cover"
            />
          {:else}
            <div
              class={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px] border text-muted-foreground/45 ${
                resolved?.status === "missing" || resolved?.status === "invalid"
                  ? "border-dashed border-border/60"
                  : "border-border/40"
              }`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
          {/if}

          <div class="min-w-0 flex-1">
            <p class="truncate text-[12px] leading-tight text-foreground/90">{att.filename}</p>
            <p
              class={`font-mono text-[10px] ${
                resolved?.status === "missing" || resolved?.status === "invalid"
                  ? "text-red-300/65"
                  : "text-muted-foreground/50"
              }`}
            >
              {metaLabel(att)}
            </p>
          </div>
        </button>

        <div class="flex shrink-0 items-center gap-1">
          <button
            type="button"
            class="rounded-[4px] border border-transparent px-1.5 py-1 font-mono text-[10px] text-muted-foreground/50 transition-colors duration-[120ms] hover:border-border/60 hover:text-foreground"
            onclick={() => showPreview(att)}
            title="Preview attachment"
          >
            view
          </button>
          <button
            type="button"
            class="rounded-[4px] border border-transparent px-1.5 py-1 font-mono text-[10px] text-muted-foreground/50 transition-colors duration-[120ms] hover:border-border/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
            onclick={() => openExternal(att)}
            disabled={resolved?.status === "missing" || resolved?.status === "invalid"}
            title="Open with default app"
          >
            open
          </button>
          {#if !readonly}
            <button
              type="button"
              aria-label="Remove attachment"
              class="rounded-[4px] border border-transparent px-1.5 py-1 font-mono text-[10px] text-muted-foreground/45 transition-colors duration-[120ms] hover:border-border/60 hover:text-red-300"
              onclick={() => handleDelete(att.filename)}
            >
              remove
            </button>
          {/if}
        </div>
      </div>
    {/each}

    {#if preview || previewLoading}
      <div class="border-b border-border/40 px-3 py-2">
        <div class="mb-2 flex items-center justify-between gap-2">
          <div class="min-w-0">
            <p class="truncate text-[12px] text-foreground/90">
              {preview?.filename ?? selectedFilename}
            </p>
            {#if preview}
              <p class="font-mono text-[10px] text-muted-foreground/45">
                {preview.mimeType || "application/octet-stream"} · {formatSize(preview.size)}
              </p>
            {/if}
          </div>
          <button
            type="button"
            class="rounded-[4px] border border-transparent px-1.5 py-1 font-mono text-[10px] text-muted-foreground/45 transition-colors duration-[120ms] hover:border-border/60 hover:text-foreground"
            onclick={() => {
              selectedFilename = null;
              preview = null;
              previewError = null;
            }}
          >
            close
          </button>
        </div>

        {#if previewLoading}
          <div class="rounded-[6px] border border-border/50 px-3 py-4">
            <p class="animate-pulse font-mono text-[10px] text-muted-foreground/45">Loading preview...</p>
          </div>
        {:else if preview?.kind === "image"}
          <div class="overflow-hidden rounded-[6px] border border-border/50 bg-black/10">
            <img src={preview.src} alt={preview.filename} class="max-h-[340px] w-full object-contain" />
          </div>
        {:else if preview?.kind === "pdf"}
          <div class="overflow-hidden rounded-[6px] border border-border/50 bg-black/10">
            <iframe title={preview.filename} src={preview.src} class="h-[340px] w-full bg-card"></iframe>
          </div>
        {:else if preview?.kind === "text"}
          <div class="overflow-hidden rounded-[6px] border border-border/50 bg-card/60">
            <pre class="max-h-[320px] overflow-auto px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words text-muted-foreground">{preview.content}</pre>
          </div>
          {#if preview.truncated}
            <p class="mt-2 font-mono text-[10px] text-muted-foreground/45">Preview truncated to 1 MB.</p>
          {/if}
        {:else if preview?.kind === "unsupported"}
          <div class="rounded-[6px] border border-dashed border-border/60 px-3 py-4">
            <p class="text-[12px] text-foreground/85">No inline preview for this file type.</p>
            <p class="mt-1 font-mono text-[10px] text-muted-foreground/45">Use <span class="text-foreground/70">open</span> to inspect it in the default app.</p>
          </div>
        {:else if preview?.kind === "broken"}
          <div class="rounded-[6px] border border-dashed border-border/60 px-3 py-4">
            <p class="text-[12px] text-foreground/85">{preview.reason}</p>
            <p class="mt-1 font-mono text-[10px] text-muted-foreground/45">Remove the reference to clean up this task.</p>
          </div>
        {/if}

        {#if previewError}
          <p class="mt-2 font-mono text-[10px] text-red-300/65">{previewError}</p>
        {/if}
      </div>
    {/if}

    {#if !readonly}
      <div class="flex items-center justify-between px-3 py-1.5">
        <button
          type="button"
          class="px-2.5 py-1.5 font-mono text-[10px] text-muted-foreground/50 transition-colors duration-[120ms] hover:text-muted-foreground"
          onclick={handleAttach}
        >
          + attachment
        </button>
        <span class="font-mono text-[10px] text-muted-foreground/35">images, pdfs, logs, docs</span>
      </div>
    {/if}
  </div>
{/if}
