<script lang="ts">
  let {
    agentSummary = null,
    deferred = null,
    reviewNotes = null,
    confidence = null,
    renderMarkdown,
  }: {
    agentSummary?: string | null;
    deferred?: string | null;
    reviewNotes?: string | null;
    confidence?: string | null;
    renderMarkdown: (text: string) => string;
  } = $props();
</script>

<div class="border-t border-border/60">
  {#if agentSummary != null}
    <div class="speech-bubble speech-bubble--agent mx-4 my-2">
      <div class="mb-1 flex items-center justify-between gap-2">
        <p class="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/60">Agent Summary</p>
        {#if confidence === "low"}
          <span class="inline-flex h-[18px] items-center gap-1 rounded-[3px] bg-rose-500/10 px-1.5 font-mono text-[9px] leading-none text-rose-400/80">
            <span class="text-[8px]">!</span> Needs review
          </span>
        {:else if confidence === "medium"}
          <span class="inline-flex h-[18px] items-center gap-1 rounded-[3px] bg-amber-500/10 px-1.5 font-mono text-[9px] leading-none text-amber-400/80">
            <span class="text-[8px]">~</span> Spot check
          </span>
        {/if}
      </div>
      <div class="agent-md font-mono text-[11px] leading-relaxed text-muted-foreground">
        {@html renderMarkdown(agentSummary)}
      </div>
    </div>
  {/if}

  {#if deferred != null}
    <div class="speech-bubble speech-bubble--agent mx-4 my-2">
      <p class="mb-1 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/60">Deferred</p>
      <div class="agent-md font-mono text-[11px] leading-relaxed text-muted-foreground">
        {@html renderMarkdown(deferred)}
      </div>
    </div>
  {/if}

  {#if reviewNotes != null}
    <div class="speech-bubble speech-bubble--user mx-4 my-2">
      <p class="mb-1 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground/60">Review Notes</p>
      <div class="agent-md font-mono text-[11px] leading-relaxed text-muted-foreground">
        {@html renderMarkdown(reviewNotes)}
      </div>
    </div>
  {/if}
</div>

<style>
  .speech-bubble {
    padding: 10px 14px;
    border: 1px solid var(--color-border);
  }

  .speech-bubble--agent {
    background: color-mix(in srgb, var(--color-foreground) 8%, var(--color-background));
    border-radius: 0 10px 10px 10px;
    margin-right: 24px !important;
  }

  .speech-bubble--user {
    background: color-mix(in srgb, var(--color-foreground) 12%, var(--color-background));
    border-radius: 10px 0 10px 10px;
    margin-left: 24px !important;
  }
</style>
