<script lang="ts">
  import { getAttachmentDataUrl } from "$lib/api";

  let {
    taskId,
    filename,
  }: {
    taskId: number;
    filename: string;
  } = $props();

  const thumbnailCache = new Map<string, string>();

  let src = $state<string | null>(null);
  let error = $state(false);

  $effect(() => {
    let cancelled = false;
    error = false;

    const cacheKey = `${taskId}:${filename}`;
    const cached = thumbnailCache.get(cacheKey);
    if (cached) {
      src = cached;
      return;
    }

    src = null;

    getAttachmentDataUrl(taskId, filename)
      .then((url) => {
        if (!cancelled) {
          thumbnailCache.set(cacheKey, url);
          src = url;
        }
      })
      .catch(() => {
        if (!cancelled) error = true;
      });

    return () => { cancelled = true; };
  });
</script>

{#if src}
  <img
    {src}
    alt=""
    class="h-[72px] w-full rounded-t-[5px] border-b border-border/40 object-cover"
    draggable="false"
  />
{:else if !error}
  <div class="h-[72px] w-full rounded-t-[5px] border-b border-border/40 bg-accent/30 animate-pulse"></div>
{/if}
