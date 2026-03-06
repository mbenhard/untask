<script lang="ts">
  import {
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
  import TaskDetail from "$lib/components/TaskDetail.svelte";
  import TaskList from "$lib/components/TaskList.svelte";
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

  let restoring = $state(true);
  let selectedTask = $state<TaskDto | null>(null);
  let selectedDoc = $state<DocInfo | null>(null);

  // Auto-restore last project on launch
  $effect(() => {
    restoreLastProject();
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
    projectPath.set(path);
    projectName.set(name);
    selectedTask = null;
    selectedDoc = null;

    await refreshData();
    restoring = false;
  }

  async function refreshData() {
    const [config, taskList, docList] = await Promise.all([
      getConfig().catch(() => ({ columns: [] })),
      listTasks().catch(() => []),
      listDocs().catch(() => []),
    ]);

    columns.set(config.columns);
    tasks.set(taskList);
    docs.set(docList);
  }

  async function refreshTasks() {
    const taskList = await listTasks().catch(() => []);
    tasks.set(taskList);
  }

  function selectView(view: ShellView) {
    activeView.set(view);
    selectedTask = null;
    selectedDoc = null;
  }

  function switchProject() {
    projectPath.set(null);
    projectName.set(null);
    tasks.set([]);
    docs.set([]);
    columns.set([]);
    selectedTask = null;
    selectedDoc = null;
  }

  function onTaskClick(task: TaskDto) {
    selectedTask = task;
  }

  function onTaskClose() {
    selectedTask = null;
  }

  function onDocSelect(doc: DocInfo) {
    selectedDoc = doc;
  }

  function onDocClose() {
    selectedDoc = null;
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
        {#if selectedTask}
          <TaskDetail
            task={selectedTask}
            columns={$columns}
            onClose={onTaskClose}
            onTaskUpdated={refreshTasks}
          />
        {:else if selectedDoc}
          <DocsEditor doc={selectedDoc} onClose={onDocClose} />
        {:else if $activeView === "board"}
          <Kanban
            tasks={$tasks}
            columns={$columns}
            onTaskClick={onTaskClick}
            onTasksChanged={refreshTasks}
          />
        {:else if $activeView === "list"}
          <TaskList tasks={$tasks} onTaskClick={onTaskClick} />
        {:else if $activeView === "docs"}
          <DocsViewer docs={$docs} onDocSelect={onDocSelect} />
        {:else if $activeView === "next"}
          <div class="flex flex-1 items-center justify-center">
            <p class="font-mono text-[11px] text-muted-foreground">Next view — coming soon</p>
          </div>
        {/if}
      </main>
    </div>
  {/if}
</div>
