<script lang="ts">
  import { open } from "@tauri-apps/plugin-dialog";

  import ScaffoldPanel from "$lib/components/ScaffoldPanel.svelte";
  import SidebarNav from "$lib/components/SidebarNav.svelte";
  import WindowChrome from "$lib/components/WindowChrome.svelte";
  import { activeView, selectedProjectPath, theme, type ShellView } from "$lib/stores";

  async function chooseProject() {
    const selection = await open({
      directory: true,
      multiple: false,
      title: "Choose an Untask project",
    });

    if (typeof selection === "string") {
      selectedProjectPath.set(selection);
    }
  }

  function selectView(view: ShellView) {
    activeView.set(view);
  }

  $effect(() => {
    document.documentElement.classList.toggle("dark", $theme === "dark");
  });
</script>

<div class="flex h-screen min-h-screen flex-col bg-background text-foreground">
  <WindowChrome />

  <div class="flex min-h-0 flex-1 overflow-hidden">
    <SidebarNav activeView={$activeView} onSelect={selectView} />
    <ScaffoldPanel
      activeView={$activeView}
      projectPath={$selectedProjectPath}
      onChooseProject={chooseProject}
    />
  </div>
</div>
