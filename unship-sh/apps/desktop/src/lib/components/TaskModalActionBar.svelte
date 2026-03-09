<script lang="ts">
  import { PROMPT_MODES } from "$lib/taskPrompt";

  let {
    isUnindexed,
    reviseOpen,
    showDeleteConfirm,
    copyFeedback,
    isReviewStatus,
    isDoneStatus,
    reviseDropdownOpen,
    promptDropdownOpen,
    onToggleDeleteConfirm,
    onConfirmDelete,
    onCancelRevise,
    onReviseWithCopy,
    onToggleReviseDropdown,
    onCloseReviseDropdown,
    onReviseWithoutCopy,
    onCopyPrompt,
    onTogglePromptDropdown,
    onClosePromptDropdown,
    onPickPromptMode,
    onOpenRevise,
    onApprove,
  }: {
    isUnindexed: boolean;
    reviseOpen: boolean;
    showDeleteConfirm: boolean;
    copyFeedback: boolean;
    isReviewStatus: boolean;
    isDoneStatus: boolean;
    reviseDropdownOpen: boolean;
    promptDropdownOpen: boolean;
    onToggleDeleteConfirm: (value: boolean) => void;
    onConfirmDelete: () => void | Promise<void>;
    onCancelRevise: () => void;
    onReviseWithCopy: () => void | Promise<void>;
    onToggleReviseDropdown: () => void;
    onCloseReviseDropdown: () => void;
    onReviseWithoutCopy: () => void | Promise<void>;
    onCopyPrompt: () => void;
    onTogglePromptDropdown: () => void;
    onClosePromptDropdown: () => void;
    onPickPromptMode: (mode: string) => void;
    onOpenRevise: () => void;
    onApprove: () => void | Promise<void>;
  } = $props();
</script>

<div class="flex items-center justify-between border-t border-border/60 p-3">
  <div class="flex items-center gap-1.5">
    {#if !isUnindexed && !reviseOpen}
      {#if showDeleteConfirm}
        <span class="inline-flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
          <button
            type="button"
            class="rounded-[4px] border border-border/60 px-2 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors duration-[120ms] hover:border-border hover:text-foreground"
            onclick={() => onToggleDeleteConfirm(false)}
          >
            No
          </button>
          <button
            type="button"
            class="rounded-[4px] border border-border/60 bg-destructive/10 px-2 py-0.5 font-mono text-[10px] text-red-400 transition-colors duration-[120ms] hover:bg-destructive hover:text-red-300"
            onclick={() => void onConfirmDelete()}
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
          onclick={() => onToggleDeleteConfirm(true)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      {/if}
    {/if}
  </div>

  {#if reviseOpen}
    <div class="flex items-center gap-1.5">
      <button
        type="button"
        class="rounded-[4px] px-2.5 py-1 font-mono text-[10px] text-muted-foreground/60 transition-colors duration-[120ms] hover:text-muted-foreground"
        onclick={onCancelRevise}
      >
        Cancel
      </button>
      <div class="relative inline-flex items-stretch">
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-l-[4px] border border-r-0 border-foreground/20 bg-foreground px-2.5 py-1 font-mono text-[10px] text-background transition-colors duration-[120ms] hover:bg-foreground/85"
          onclick={() => void onReviseWithCopy()}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          Revise & copy
        </button>
        <button
          type="button"
          aria-label="Open revise actions"
          class="inline-flex items-center rounded-r-[4px] border border-foreground/20 bg-foreground px-2 py-1 text-background transition-colors duration-[120ms] hover:bg-foreground/85"
          onclick={onToggleReviseDropdown}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
        {#if reviseDropdownOpen}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="absolute bottom-full right-0 mb-1 w-[200px] rounded-[6px] border border-border/60 bg-popover py-0.5 shadow-[0_8px_24px_-4px_rgba(0,0,0,0.4)]"
            onmouseleave={onCloseReviseDropdown}
          >
            <button
              type="button"
              class="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left font-mono text-[10px] text-muted-foreground transition-colors duration-[80ms] hover:bg-accent hover:text-foreground"
              onclick={() => void onReviseWithoutCopy()}
            >
              <span>Revise<span class="text-muted-foreground/40"> — without copying</span></span>
            </button>
          </div>
        {/if}
      </div>
    </div>
  {:else if !isUnindexed && !isDoneStatus}
    <div class="flex items-center gap-1.5">
      {#if copyFeedback}
        <span class="inline-flex items-center gap-1 px-2.5 py-1 font-mono text-[10px] text-muted-foreground">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          Copied
        </span>
      {:else if isReviewStatus}
        <div class="relative inline-flex items-stretch">
          <button
            type="button"
            class="inline-flex items-center gap-1 rounded-l-[4px] border border-r-0 border-dashed border-border/60 px-2.5 py-1 font-mono text-[10px] text-muted-foreground/60 transition-colors duration-[120ms] hover:border-border hover:text-muted-foreground"
            onclick={onCopyPrompt}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            Copy for AI
          </button>
          <button
            type="button"
            aria-label="Choose prompt mode"
            class="inline-flex items-center rounded-r-[4px] border border-dashed border-border/60 px-1.5 py-1 text-muted-foreground/60 transition-colors duration-[120ms] hover:border-border hover:text-muted-foreground"
            onclick={onTogglePromptDropdown}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
          {#if promptDropdownOpen}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="absolute bottom-full right-0 mb-1 w-[200px] rounded-[6px] border border-border/60 bg-popover py-0.5 shadow-[0_8px_24px_-4px_rgba(0,0,0,0.4)]"
              onmouseleave={onClosePromptDropdown}
            >
              {#each PROMPT_MODES as mode}
                <button
                  type="button"
                  class="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left font-mono text-[10px] text-muted-foreground transition-colors duration-[80ms] hover:bg-accent hover:text-foreground"
                  onclick={() => onPickPromptMode(mode.id)}
                >
                  <span>{mode.label}<span class="text-muted-foreground/40"> — {mode.desc}</span></span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
        <button
          type="button"
          class="rounded-[4px] border border-border/60 px-2.5 py-1 font-mono text-[10px] text-foreground transition-colors duration-[120ms] hover:border-border"
          onclick={onOpenRevise}
        >
          Revise
        </button>
        <button
          type="button"
          class="rounded-[4px] border border-foreground/20 bg-foreground px-2.5 py-1 font-mono text-[10px] text-background transition-colors duration-[120ms] hover:bg-foreground/85"
          onclick={() => void onApprove()}
        >
          Approve
        </button>
      {:else}
        <div class="inline-flex items-stretch">
          <button
            type="button"
            class="inline-flex items-center gap-1 rounded-l-[4px] border border-r-0 border-foreground/20 bg-foreground px-2.5 py-1 font-mono text-[10px] text-background transition-colors duration-[120ms] hover:bg-foreground/85"
            onclick={onCopyPrompt}
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
              aria-label="Choose prompt mode"
              class="inline-flex items-center rounded-r-[4px] border border-foreground/20 bg-foreground px-2 py-1 text-background transition-colors duration-[120ms] hover:bg-foreground/85"
              onclick={onTogglePromptDropdown}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>
            {#if promptDropdownOpen}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="absolute bottom-full right-0 mb-1 w-[200px] rounded-[6px] border border-border/60 bg-popover py-0.5 shadow-[0_8px_24px_-4px_rgba(0,0,0,0.4)]"
                onmouseleave={onClosePromptDropdown}
              >
                {#each PROMPT_MODES as mode}
                  <button
                    type="button"
                    class="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left font-mono text-[10px] text-muted-foreground transition-colors duration-[80ms] hover:bg-accent hover:text-foreground"
                    onclick={() => onPickPromptMode(mode.id)}
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
