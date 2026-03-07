<script lang="ts">
  import { onMount, tick } from "svelte";
  import { open } from "@tauri-apps/plugin-dialog";

  import {
    getRecentProjects,
    initProject,
    openProject,
    type RecentProject,
  } from "$lib/api";
  import Button from "$lib/components/ui/Button.svelte";

  let {
    mode = "fullpage",
    onProjectOpened,
    onClose,
  }: {
    mode?: "fullpage" | "dropdown";
    onProjectOpened: (path: string, name: string) => Promise<void>;
    onClose?: () => void;
  } = $props();

  let recentProjects = $state<RecentProject[]>([]);
  let initPrompt = $state<string | null>(null);
  let error = $state<string | null>(null);
  let loading = $state(false);
  let filterQuery = $state("");
  let selectedIndex = $state(0);
  let filterInputEl = $state<HTMLInputElement | null>(null);
  let backdropEl = $state<HTMLDivElement | null>(null);

  const filteredProjects = $derived(
    filterQuery.trim()
      ? recentProjects.filter((p) => {
          const q = filterQuery.toLowerCase();
          return p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q);
        })
      : recentProjects,
  );

  // Reset selected index when filter changes
  $effect(() => {
    // Access filteredProjects.length to track it
    void filteredProjects.length;
    selectedIndex = 0;
  });

  onMount(() => {
    void loadRecents();

    if (mode === "dropdown") {
      void tick().then(() => {
        filterInputEl?.focus();
      });
    }
  });

  async function loadRecents() {
    try {
      recentProjects = await getRecentProjects();
    } catch {
      // no recents yet
    }
  }

  async function chooseFolder() {
    const selection = await open({
      directory: true,
      multiple: false,
      title: "Choose an Untask project",
    });

    if (typeof selection !== "string") return;

    error = null;

    try {
      loading = true;
      await openProject(selection);
      const name =
        selection.split("/").filter(Boolean).pop() ?? selection;
      await onProjectOpened(selection, name);
    } catch (e) {
      const msg = String(e);
      if (msg.includes("not an untask project")) {
        initPrompt = selection;
      } else {
        error = msg;
      }
    } finally {
      loading = false;
    }
  }

  async function confirmInit() {
    if (!initPrompt) return;
    error = null;
    try {
      loading = true;
      await initProject(initPrompt);
      await openProject(initPrompt);
      const name =
        initPrompt.split("/").filter(Boolean).pop() ?? initPrompt;
      await onProjectOpened(initPrompt, name);
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
      initPrompt = null;
    }
  }

  function cancelInit() {
    initPrompt = null;
  }

  async function openRecent(project: RecentProject) {
    error = null;
    try {
      loading = true;
      await openProject(project.path);
      await onProjectOpened(project.path, project.name);
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === backdropEl) {
      onClose?.();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (mode !== "dropdown") return;

    if (e.key === "Escape") {
      e.preventDefault();
      onClose?.();
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (filteredProjects.length > 0) {
        selectedIndex = (selectedIndex + 1) % filteredProjects.length;
      }
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (filteredProjects.length > 0) {
        selectedIndex = (selectedIndex - 1 + filteredProjects.length) % filteredProjects.length;
      }
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      if (filteredProjects.length > 0 && filteredProjects[selectedIndex]) {
        void openRecent(filteredProjects[selectedIndex]);
      }
      return;
    }
  }

  function relativeTime(isoDate: string): string {
    try {
      const date = new Date(isoDate);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHr = Math.floor(diffMin / 60);
      const diffDay = Math.floor(diffHr / 24);
      const diffWeek = Math.floor(diffDay / 7);

      if (diffSec < 60) return "just now";
      if (diffMin < 60) return `${diffMin}m ago`;
      if (diffHr < 24) return `${diffHr}h ago`;
      if (diffDay < 7) return `${diffDay}d ago`;
      if (diffWeek < 52) return `${diffWeek}w ago`;
      return `${Math.floor(diffDay / 365)}y ago`;
    } catch {
      return "";
    }
  }
</script>

{#if mode === "dropdown"}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-40 flex items-start justify-center pt-12 bg-black/30 backdrop-blur-[2px]"
    bind:this={backdropEl}
    onclick={handleBackdropClick}
    onkeydown={handleKeydown}
  >
    <div class="picker-dropdown w-full max-w-[320px] rounded-[6px] border border-border/60 bg-card shadow-[0_12px_36px_-8px_rgba(0,0,0,0.4)]">
      <div class="border-b border-border/60 px-3 py-2">
        <input
          bind:this={filterInputEl}
          bind:value={filterQuery}
          type="text"
          placeholder="Search projects..."
          class="w-full bg-transparent font-mono text-[11px] text-foreground placeholder:text-muted-foreground/40 border-transparent outline-none focus:border-border transition-colors duration-[120ms]"
        />
      </div>

      {#if filteredProjects.length > 0}
        <div class="max-h-[280px] overflow-y-auto divide-y divide-border/40">
          {#each filteredProjects as project, i}
            <button
              type="button"
              class="flex w-full items-center justify-between px-3 py-2 text-left transition-colors duration-[120ms] {i === selectedIndex ? 'bg-accent/60' : 'hover:bg-accent/40'}"
              onclick={() => openRecent(project)}
              onmouseenter={() => { selectedIndex = i; }}
            >
              <div class="min-w-0 flex-1">
                <p class="text-[12px] font-medium text-foreground truncate">
                  {project.name}
                </p>
                <p class="font-mono text-[10px] text-muted-foreground truncate">
                  {project.path}
                </p>
              </div>
              {#if project.last_opened}
                <span class="ml-2 shrink-0 font-mono text-[10px] text-muted-foreground/40">
                  {relativeTime(project.last_opened)}
                </span>
              {/if}
            </button>
          {/each}
        </div>
      {:else if filterQuery.trim()}
        <div class="px-3 py-4">
          <p class="font-mono text-[10px] text-muted-foreground/60 text-center">No matches</p>
        </div>
      {/if}

      <div class="border-t border-border/60 px-3 py-2">
        <button
          type="button"
          class="flex w-full items-center gap-2 rounded-[4px] px-2 py-1.5 text-left font-mono text-[11px] text-muted-foreground transition-colors duration-[120ms] hover:bg-accent/40 hover:text-foreground"
          onclick={chooseFolder}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          Open folder...
        </button>
      </div>
    </div>
  </div>
{:else}
  <section class="flex min-w-0 flex-1 items-center justify-center bg-background/80">
    <div class="w-full max-w-[320px] space-y-4 px-4">
      <div>
        <p
          class="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground"
        >
          Project
        </p>
        <h2 class="mt-1 text-[18px] font-medium text-foreground">
          Open a project
        </h2>
        <p class="mt-1 text-[12px] leading-[1.45] text-muted-foreground">
          Choose a directory containing an <span class="font-mono">.untask/</span> folder,
          or select any folder to initialize one.
        </p>
      </div>

      <Button variant="primary" class="w-full" onclick={chooseFolder} disabled={loading}>
        Choose folder
      </Button>

      {#if initPrompt}
        <div class="rounded-[6px] border border-border/60 bg-card/80 p-3">
          <p class="text-[12px] text-foreground">
            No <span class="font-mono">.untask/</span> directory found.
          </p>
          <p class="mt-1 text-[12px] text-muted-foreground">
            Initialize untask in <span class="font-mono text-[11px]">{initPrompt}</span>?
          </p>
          <div class="mt-3 flex gap-2">
            <Button variant="primary" onclick={confirmInit} disabled={loading}>
              Initialize
            </Button>
            <Button variant="ghost" onclick={cancelInit}>Cancel</Button>
          </div>
        </div>
      {/if}

      {#if error}
        <div class="rounded-[6px] border border-border/60 border-l-2 border-l-priority-medium/60 px-3 py-2">
          <p class="font-mono text-[10px] text-muted-foreground">{error}</p>
        </div>
      {/if}

      {#if recentProjects.length > 0}
        <div class="rounded-[6px] border border-border/60 bg-card/80">
          <div class="border-b border-border/60 px-3 py-2">
            <input
              bind:value={filterQuery}
              type="text"
              placeholder="Search projects..."
              class="w-full bg-transparent font-mono text-[11px] text-foreground placeholder:text-muted-foreground/40 border-transparent outline-none focus:border-border transition-colors duration-[120ms]"
            />
          </div>
          <div class="divide-y divide-border/80">
            {#each filteredProjects as project}
              <button
                type="button"
                class="flex w-full items-center justify-between px-3 py-2 text-left transition-colors duration-[120ms] hover:bg-accent/60"
                onclick={() => openRecent(project)}
              >
                <div class="min-w-0 flex-1">
                  <p class="text-[13px] font-medium text-foreground truncate">
                    {project.name}
                  </p>
                  <p class="font-mono text-[10px] text-muted-foreground truncate">
                    {project.path}
                  </p>
                </div>
                {#if project.last_opened}
                  <span class="ml-2 shrink-0 font-mono text-[10px] text-muted-foreground/40">
                    {relativeTime(project.last_opened)}
                  </span>
                {/if}
              </button>
            {/each}
            {#if filteredProjects.length === 0 && filterQuery.trim()}
              <div class="px-3 py-3">
                <p class="font-mono text-[10px] text-muted-foreground/60 text-center">No matches</p>
              </div>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  </section>
{/if}

<style>
  .picker-dropdown {
    animation: picker-in 150ms ease-out both;
  }

  @keyframes picker-in {
    from {
      opacity: 0;
      transform: scale(0.97);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
</style>
