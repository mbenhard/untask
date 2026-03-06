<script lang="ts">
  import { open } from "@tauri-apps/plugin-dialog";

  import {
    getLastProject,
    getRecentProjects,
    initProject,
    openProject,
    type RecentProject,
  } from "$lib/api";
  import Button from "$lib/components/ui/Button.svelte";

  let {
    onProjectOpened,
  }: {
    onProjectOpened: (path: string, name: string) => void;
  } = $props();

  let recentProjects = $state<RecentProject[]>([]);
  let initPrompt = $state<string | null>(null);
  let error = $state<string | null>(null);
  let loading = $state(false);

  $effect(() => {
    loadRecents();
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
      onProjectOpened(selection, name);
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
      onProjectOpened(initPrompt, name);
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
      onProjectOpened(project.path, project.name);
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  }
</script>

<section class="flex min-w-0 flex-1 items-center justify-center bg-background/80">
  <div class="w-full max-w-[380px] space-y-4 px-4">
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
      <div class="rounded-[6px] border border-border/80 bg-card/80 p-3">
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
      <p class="text-[12px] text-destructive">{error}</p>
    {/if}

    {#if recentProjects.length > 0}
      <div class="rounded-[6px] border border-border/80 bg-card/80">
        <div class="border-b border-border/80 px-3 py-2">
          <p
            class="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground"
          >
            Recent
          </p>
        </div>
        <div class="divide-y divide-border/80">
          {#each recentProjects as project}
            <button
              type="button"
              class="flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-accent/60"
              onclick={() => openRecent(project)}
            >
              <div>
                <p class="text-[13px] font-medium text-foreground">
                  {project.name}
                </p>
                <p class="font-mono text-[10px] text-muted-foreground">
                  {project.path}
                </p>
              </div>
            </button>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</section>
