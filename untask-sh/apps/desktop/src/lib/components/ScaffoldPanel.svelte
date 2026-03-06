<script lang="ts">
  import type { ShellView } from "$lib/stores";

  import Button from "$lib/components/ui/Button.svelte";
  import PriorityDot from "$lib/components/PriorityDot.svelte";

  const scaffoldChecks = [
    {
      label: "Dialog plugin available on both sides",
      detail: "Frontend can open a project folder without placeholder IPC glue.",
      tone: "high" as const,
    },
    {
      label: "Shared component slots ready",
      detail: "Chrome, sidebar, and empty-state surfaces are split out for later task views.",
      tone: "medium" as const,
    },
    {
      label: "Typography now resolves to Geist",
      detail: "The shell self-hosts Geist Variable and Geist Mono instead of relying on OS luck.",
      tone: "low" as const,
    },
  ];

  const laneCards: Record<ShellView, { title: string; meta: string }[]> = {
    board: [
      { title: "Backlog stays terse", meta: "40px rows · border-led" },
      { title: "Move tasks without loud badges", meta: "priority dots only" },
      { title: "Docs warnings stay non-destructive", meta: "inline utility copy" },
    ],
    list: [
      { title: "Single-column keyboard mode", meta: "dense sort + filter bar" },
      { title: "Mono metadata in the margins", meta: "quiet timestamps" },
      { title: "Editor opens from row or detail", meta: "no generic cards" },
    ],
    docs: [
      { title: "Repo docs live beside tasks", meta: "scoped discovery" },
      { title: "Frontmatter remains intact", meta: "editor-safe round trips" },
      { title: "Warnings explain, never auto-fix", meta: "repair stays explicit" },
    ],
    next: [
      { title: "Commits, open work, cleanup hints", meta: "daily brief" },
      { title: "Empty sections disappear cleanly", meta: "no filler text" },
      { title: "Recent completions use completed timestamps", meta: "chronology matters" },
    ],
  };

  let {
    activeView,
    projectPath,
    onChooseProject,
  }: {
    activeView: ShellView;
    projectPath: string | null;
    onChooseProject: () => Promise<void> | void;
  } = $props();
</script>

<section class="flex min-w-0 flex-1 flex-col bg-background/80">
  <div class="flex items-center justify-between border-b border-border/80 px-5 py-4">
    <div>
      <p class="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
        Foundation
      </p>
      <h2 class="mt-1 text-[18px] font-medium text-foreground">Desktop scaffold</h2>
      <p class="mt-1 text-[12px] leading-[1.45] text-muted-foreground">
        The placeholder starter is gone. This shell is already shaped like Untask.
      </p>
    </div>

    <div class="flex items-center gap-2">
      <Button variant="primary" onclick={onChooseProject}>Choose Project</Button>
      <Button variant="ghost">Restore Last Project</Button>
    </div>
  </div>

  <div class="grid min-h-0 flex-1 grid-cols-[1.4fr_0.9fr] gap-4 p-4">
    <section class="flex min-h-0 flex-col rounded-[10px] border border-border/80 bg-card/80">
      <div class="flex items-center justify-between border-b border-border/80 px-4 py-3">
        <div>
          <p class="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            Active View
          </p>
          <p class="mt-1 text-[13px] font-medium text-foreground">{activeView}</p>
        </div>

        <div class="rounded-full border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          {projectPath ?? "No project selected"}
        </div>
      </div>

      <div class="grid flex-1 grid-cols-3 gap-px bg-border/80">
        {#each laneCards[activeView] as card}
          <article class="flex min-h-[220px] flex-col justify-between bg-card px-3 py-3">
            <div>
              <p class="text-[13px] font-medium text-foreground">{card.title}</p>
              <p class="mt-2 text-[12px] leading-[1.45] text-muted-foreground">{card.meta}</p>
            </div>

            <div class="flex items-center justify-between border-t border-border/70 pt-3">
              <span class="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                Untask
              </span>
              <PriorityDot tone="neutral" />
            </div>
          </article>
        {/each}
      </div>
    </section>

    <section class="flex min-h-0 flex-col gap-4">
      <article class="rounded-[10px] border border-border/80 bg-card/80">
        <div class="border-b border-border/80 px-4 py-3">
          <p class="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            Project Selection
          </p>
        </div>
        <div class="space-y-3 px-4 py-4">
          <p class="text-[13px] text-foreground">
            {#if projectPath}
              Using <span class="font-mono text-[12px]">{projectPath}</span>
            {:else}
              Choose a repository directory to prove the dialog plugin and lifecycle entry point.
            {/if}
          </p>
          <p class="text-[12px] leading-[1.45] text-muted-foreground">
            Later tasks can replace this preview with recent-project persistence and inline init.
          </p>
        </div>
      </article>

      <article class="rounded-[10px] border border-border/80 bg-card/80">
        <div class="border-b border-border/80 px-4 py-3">
          <p class="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            Review Fixes
          </p>
        </div>

        <div class="divide-y divide-border/80">
          {#each scaffoldChecks as check}
            <div class="flex items-start gap-3 px-4 py-3">
              <div class="pt-[6px]">
                <PriorityDot tone={check.tone} />
              </div>
              <div>
                <p class="text-[13px] font-medium text-foreground">{check.label}</p>
                <p class="mt-1 text-[12px] leading-[1.45] text-muted-foreground">{check.detail}</p>
              </div>
            </div>
          {/each}
        </div>
      </article>
    </section>
  </div>
</section>
