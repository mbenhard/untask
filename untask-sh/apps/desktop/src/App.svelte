<script lang="ts">
  import { listen } from "@tauri-apps/api/event";
  import { onMount } from "svelte";
  import {
    closeProject,
    getConfig,
    getLastProject,
    listDocsTree,
    listTasks,
    openProject,
    type TaskDto,
  } from "$lib/api";
  import { hasKnownStatus } from "$lib/utils";
  import DocsViewer from "$lib/components/DocsViewer.svelte";
  import Kanban from "$lib/components/Kanban.svelte";
  import ProjectPicker from "$lib/components/ProjectPicker.svelte";
  import SidebarNav from "$lib/components/SidebarNav.svelte";
  import TaskList from "$lib/components/TaskList.svelte";
  import TaskModal from "$lib/components/TaskModal.svelte";
  import WindowChrome from "$lib/components/WindowChrome.svelte";
  import {
    activeView,
    columns,
    docs,
    projectName,
    projectPath,
    tasks,
    theme,
    type ShellView,
  } from "$lib/stores";

  type ProjectRefreshEvent = {
    project_path: string;
    changed_paths: string[];
  };

  type TaskHealth = {
    unmatchedCount: number;
    unindexedCount: number;
  };

  let healthDismissed = $state(false);
  let restoring = $state(true);
  let selectedTask = $state<TaskDto | null>(null);
  let refreshRevision = $state(0);
  let showProjectSwitcher = $state(false);
  let projectRevision = $state(0);
  let docsExternalRevision = $state(0);
  let docsExternalPaths = $state<string[]>([]);
  let openProjectPath = $state<string | null>(null);
  let taskHealth = $state<TaskHealth>({ unmatchedCount: 0, unindexedCount: 0 });
  let refreshTimeout: number | null = null;
  let pendingRefreshPaths = $state<Set<string>>(new Set());

  onMount(() => {
    let unlisten: (() => void) | undefined;

    void (async () => {
      unlisten = await listen<ProjectRefreshEvent>(
        "untask://project-refresh",
        (event) => {
          if (!openProjectPath || event.payload.project_path !== openProjectPath) {
            return;
          }

          scheduleRefresh(event.payload.changed_paths);
        },
      );

      await restoreLastProject();
    })();

    // Auto-save any focused editor on app close
    function handleBeforeUnload() {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      if (refreshTimeout !== null) {
        window.clearTimeout(refreshTimeout);
      }
      window.removeEventListener("beforeunload", handleBeforeUnload);
      unlisten?.();
    };
  });

  async function restoreLastProject() {
    try {
      const last = await getLastProject();
      if (last) {
        await openProject(last.path);
        await onProjectOpened(last.path, last.name);
        return;
      }
    } catch {
      // no last project or it's invalid
    }
    restoring = false;
  }

  async function onProjectOpened(path: string, name: string) {
    openProjectPath = path;
    projectPath.set(path);
    projectName.set(name);
    selectedTask = null;

    await refreshData();
    projectRevision += 1;
    restoring = false;
  }

  async function refreshData(options?: { externalPaths?: string[] }) {
    const [config, taskList, docList] = await Promise.all([
      getConfig().catch(() => ({ columns: [] })),
      listTasks().catch(() => []),
      listDocsTree().catch(() => []),
    ]);

    columns.set(config.columns);
    tasks.set(taskList);
    docs.set(docList);
    const nextHealth = summarizeTaskHealth(taskList, config.columns);
    if (nextHealth.unmatchedCount !== taskHealth.unmatchedCount || nextHealth.unindexedCount !== taskHealth.unindexedCount) {
      healthDismissed = false;
    }
    taskHealth = nextHealth;
    refreshRevision += 1;

    if (options?.externalPaths && affectsDocsExternally(options.externalPaths)) {
      docsExternalPaths = options.externalPaths;
      docsExternalRevision += 1;
    }
  }

  async function refreshDocs() {
    const docList = await listDocsTree().catch(() => []);
    docs.set(docList);
    refreshRevision += 1;
  }

  async function refreshTasks() {
    await refreshData();
  }

  function scheduleRefresh(changedPaths: string[]) {
    if (refreshTimeout !== null) {
      window.clearTimeout(refreshTimeout);
    }

    const nextPaths = new Set(pendingRefreshPaths);
    for (const path of changedPaths) {
      nextPaths.add(path);
    }
    pendingRefreshPaths = nextPaths;

    refreshTimeout = window.setTimeout(() => {
      refreshTimeout = null;
      const externalPaths = [...pendingRefreshPaths];
      pendingRefreshPaths = new Set();
      void refreshData(externalPaths.length ? { externalPaths } : undefined);
    }, 120);
  }

  function selectView(view: ShellView) {
    // Trigger blur to auto-save any focused editor before switching
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    activeView.set(view);
    selectedTask = null;
  }

  async function switchProject() {
    try {
      await closeProject();
    } catch {
      // best-effort teardown; clearing local state still returns picker control to the user
    }

    openProjectPath = null;
    projectPath.set(null);
    projectName.set(null);
    tasks.set([]);
    docs.set([]);
    columns.set([]);
    selectedTask = null;
    docsExternalRevision = 0;
    docsExternalPaths = [];
    pendingRefreshPaths = new Set();
    taskHealth = { unmatchedCount: 0, unindexedCount: 0 };
  }

  function affectsDocsExternally(paths: string[]) {
    return paths.some((path) => path === ".untask/config.yml" || !path.startsWith(".untask/tasks/"));
  }

  function onTaskClick(task: TaskDto) {
    selectedTask = task;
  }

  function onTaskClose() {
    selectedTask = null;
  }

  function summarizeTaskHealth(
    taskList: TaskDto[],
    configuredColumns: { id: string; aliases: string[] }[],
  ): TaskHealth {
    let unmatchedCount = 0;
    let unindexedCount = 0;

    for (const task of taskList) {
      if (task.id == null) unindexedCount += 1;
      if (!hasKnownStatus(configuredColumns, task.status)) unmatchedCount += 1;
    }

    return { unmatchedCount, unindexedCount };
  }

  $effect(() => {
    document.documentElement.classList.toggle("dark", $theme === "dark");
  });

  // ── Global view keyboard shortcuts (7.1) ─────────────────────────
  const viewShortcuts: Record<string, ShellView> = {
    "1": "board",
    "2": "list",
    "3": "docs",
    "4": "next",
  };

  onMount(() => {
    function handleGlobalKeydown(e: KeyboardEvent) {
      // Cmd+O: toggle project switcher
      if (e.metaKey && e.key === "o") {
        e.preventDefault();
        if ($projectPath) {
          showProjectSwitcher = !showProjectSwitcher;
        }
        return;
      }

      // Skip when typing in an input, textarea, select, or contenteditable
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.target as HTMLElement)?.isContentEditable) return;
      // Skip when modal is open
      if (selectedTask) return;
      // Skip with modifier keys
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const view = viewShortcuts[e.key];
      if (view && $projectPath) {
        e.preventDefault();
        selectView(view);
      }
    }

    window.addEventListener("keydown", handleGlobalKeydown);
    return () => window.removeEventListener("keydown", handleGlobalKeydown);
  });
</script>

<div class="flex h-screen min-h-screen flex-col bg-background text-foreground">
  <WindowChrome
    title={$projectName ?? "Untask"}
    onProjectClick={$projectPath ? () => { showProjectSwitcher = !showProjectSwitcher; } : undefined}
  />

  {#if restoring}
    <div class="flex min-h-0 flex-1 items-center justify-center">
      <p class="animate-pulse font-mono text-[11px] text-muted-foreground">Loading...</p>
    </div>
  {:else if !$projectPath}
    <div class="flex min-h-0 flex-1 overflow-hidden">
      <ProjectPicker {onProjectOpened} />
    </div>
  {:else}
    <div class="flex min-h-0 flex-1 overflow-hidden">
      <SidebarNav
        activeView={$activeView}
        onSelect={selectView}
      />
      <main class="flex min-w-0 flex-1 flex-col bg-background/80">
        {#if !healthDismissed && (taskHealth.unindexedCount > 0 || taskHealth.unmatchedCount > 0)}
          <div class="flex items-center gap-2 border-b border-border/60 px-4 py-1.5">
            <div class="flex flex-1 flex-wrap items-center gap-2 font-mono text-[10px] text-muted-foreground">
              {#if taskHealth.unmatchedCount > 0}
                <span class="flex items-center gap-1 rounded-[6px] border border-border/60 px-1.5 py-0.5">
                  <span class="inline-block h-1.5 w-1.5 rounded-full bg-priority-medium"></span>
                  {taskHealth.unmatchedCount} unmatched
                </span>
              {/if}
              {#if taskHealth.unindexedCount > 0}
                <span class="flex items-center gap-1 rounded-[6px] border border-border/60 px-1.5 py-0.5">
                  <span class="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/40"></span>
                  {taskHealth.unindexedCount} unindexed
                </span>
              {/if}
            </div>
            <button
              type="button"
              class="rounded-[4px] p-0.5 text-muted-foreground/40 transition-colors duration-[120ms] hover:text-muted-foreground"
              onclick={() => { healthDismissed = true; }}
              title="Dismiss"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        {/if}

        {#key `${projectRevision}-${$activeView}`}
          <div class="view-transition flex min-h-0 flex-1 flex-col">
            {#if $activeView === "board"}
              <Kanban
                tasks={$tasks}
                columns={$columns}
                onTaskClick={onTaskClick}
                onTasksChanged={refreshTasks}
              />
            {:else if $activeView === "list"}
              <TaskList
                tasks={$tasks}
                columns={$columns}
                onTaskClick={onTaskClick}
                onTasksChanged={refreshTasks}
              />
            {:else if $activeView === "docs"}
              <DocsViewer
                docs={$docs}
                refreshRevision={refreshRevision}
                externalRevision={docsExternalRevision}
                externalPaths={docsExternalPaths}
                onDocsChanged={refreshDocs}
              />
            {:else if $activeView === "next"}
              <div class="flex flex-1 items-center justify-center">
                <p class="font-mono text-[11px] text-muted-foreground">Next view — coming soon</p>
              </div>
            {/if}
          </div>
        {/key}
      </main>
    </div>

    {#if selectedTask}
      <TaskModal
        taskId={selectedTask.id}
        initialTask={selectedTask}
        columns={$columns}
        {refreshRevision}
        onClose={onTaskClose}
        onTaskUpdated={refreshTasks}
      />
    {/if}

    {#if showProjectSwitcher}
      <ProjectPicker
        mode="dropdown"
        onProjectOpened={async (path, name) => {
          showProjectSwitcher = false;
          await switchProject();
          await openProject(path);
          await onProjectOpened(path, name);
        }}
        onClose={() => { showProjectSwitcher = false; }}
      />
    {/if}
  {/if}
</div>
