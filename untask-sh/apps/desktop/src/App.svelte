<script lang="ts">
  import { listen } from "@tauri-apps/api/event";
  import { onMount } from "svelte";
  import {
    closeProject,
    getConfig,
    getLastProject,
    listDocs,
    listTasks,
    openProject,
    type DocInfo,
    type TaskDto,
  } from "$lib/api";
  import DocsEditor from "$lib/components/DocsEditor.svelte";
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
  };

  type TaskHealth = {
    unmatchedCount: number;
    unindexedCount: number;
  };

  let restoring = $state(true);
  let selectedTaskId = $state<number | null>(null);
  let selectedDoc = $state<DocInfo | null>(null);
  let refreshRevision = $state(0);
  let openProjectPath = $state<string | null>(null);
  let taskHealth = $state<TaskHealth>({ unmatchedCount: 0, unindexedCount: 0 });
  let refreshTimeout: number | null = null;

  onMount(() => {
    let unlisten: (() => void) | undefined;

    void (async () => {
      unlisten = await listen<ProjectRefreshEvent>(
        "untask://project-refresh",
        (event) => {
          if (!openProjectPath || event.payload.project_path !== openProjectPath) {
            return;
          }

          scheduleRefresh();
        },
      );

      await restoreLastProject();
    })();

    return () => {
      if (refreshTimeout !== null) {
        window.clearTimeout(refreshTimeout);
      }
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
    selectedTaskId = null;
    selectedDoc = null;

    await refreshData();
    restoring = false;
  }

  async function refreshData() {
    const selectedDocPath = selectedDoc?.path ?? null;
    const [config, taskList, docList] = await Promise.all([
      getConfig().catch(() => ({ columns: [] })),
      listTasks().catch(() => []),
      listDocs().catch(() => []),
    ]);

    columns.set(config.columns);
    tasks.set(taskList);
    docs.set(docList);
    taskHealth = summarizeTaskHealth(taskList, config.columns);
    refreshRevision += 1;

    if (selectedDocPath) {
      selectedDoc = docList.find((entry) => entry.path === selectedDocPath) ?? null;
    }
  }

  async function refreshTasks() {
    await refreshData();
  }

  function scheduleRefresh() {
    if (refreshTimeout !== null) {
      window.clearTimeout(refreshTimeout);
    }

    refreshTimeout = window.setTimeout(() => {
      refreshTimeout = null;
      void refreshData();
    }, 120);
  }

  function selectView(view: ShellView) {
    activeView.set(view);
    selectedTaskId = null;
    selectedDoc = null;
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
    selectedTaskId = null;
    selectedDoc = null;
    taskHealth = { unmatchedCount: 0, unindexedCount: 0 };
  }

  function onTaskClick(task: TaskDto) {
    selectedTaskId = task.id;
  }

  function onTaskClose() {
    selectedTaskId = null;
  }

  function onDocSelect(doc: DocInfo) {
    selectedDoc = doc;
  }

  function onDocClose() {
    selectedDoc = null;
  }

  function summarizeTaskHealth(
    taskList: TaskDto[],
    configuredColumns: { id: string; aliases: string[] }[],
  ): TaskHealth {
    const columnIds = new Set(configuredColumns.map((column) => column.id));
    const aliases = new Map<string, string>();
    for (const column of configuredColumns) {
      for (const alias of column.aliases) {
        aliases.set(alias.toLowerCase(), column.id);
      }
    }

    let unmatchedCount = 0;
    let unindexedCount = 0;

    for (const task of taskList) {
      if (task.id == null) {
        unindexedCount += 1;
      }

      const normalizedStatus = task.status.toLowerCase();
      if (!columnIds.has(normalizedStatus) && !aliases.has(normalizedStatus)) {
        unmatchedCount += 1;
      }
    }

    return { unmatchedCount, unindexedCount };
  }

  $effect(() => {
    document.documentElement.classList.toggle("dark", $theme === "dark");
  });
</script>

<div class="flex h-screen min-h-screen flex-col bg-background text-foreground">
  <WindowChrome title={$projectName ?? "Untask"} />

  {#if restoring}
    <div class="flex min-h-0 flex-1 items-center justify-center">
      <p class="font-mono text-[11px] text-muted-foreground">Loading...</p>
    </div>
  {:else if !$projectPath}
    <div class="flex min-h-0 flex-1 overflow-hidden">
      <ProjectPicker {onProjectOpened} />
    </div>
  {:else}
    <div class="flex min-h-0 flex-1 overflow-hidden">
      <SidebarNav
        activeView={$activeView}
        projectName={$projectName}
        onSelect={selectView}
        onSwitchProject={switchProject}
      />
      <main class="flex min-w-0 flex-1 flex-col bg-background/80">
        {#if taskHealth.unindexedCount > 0 || taskHealth.unmatchedCount > 0}
          <div class="border-b border-border/80 px-4 py-2">
            <div class="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
              {#if taskHealth.unindexedCount > 0}
                <span class="rounded-[4px] border border-border/70 px-1.5 py-0.5">
                  {taskHealth.unindexedCount} unindexed
                </span>
              {/if}
              {#if taskHealth.unmatchedCount > 0}
                <span class="rounded-[4px] border border-border/70 px-1.5 py-0.5">
                  {taskHealth.unmatchedCount} unmatched
                </span>
              {/if}
              <span class="text-[11px] normal-case tracking-normal text-muted-foreground">
                Visible for review only until you normalize or repair them.
              </span>
            </div>
          </div>
        {/if}
        {#if selectedDoc}
          <DocsEditor doc={selectedDoc} onClose={onDocClose} />
        {:else if $activeView === "board"}
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
          <DocsViewer docs={$docs} onDocSelect={onDocSelect} />
        {:else if $activeView === "next"}
          <div class="flex flex-1 items-center justify-center">
            <p class="font-mono text-[11px] text-muted-foreground">Next view — coming soon</p>
          </div>
        {/if}
      </main>
    </div>

    {#if selectedTaskId != null}
      <TaskModal
        taskId={selectedTaskId}
        columns={$columns}
        {refreshRevision}
        onClose={onTaskClose}
        onTaskUpdated={refreshTasks}
      />
    {/if}
  {/if}
</div>
