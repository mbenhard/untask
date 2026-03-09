<script lang="ts">
  import type { TaskDto } from "$lib/api";
  import CardThumbnail from "$lib/components/CardThumbnail.svelte";
  import { tagColor } from "$lib/tagColor";

  let {
    task,
    thumbnail = null,
    muted = false,
    draggable = false,
    dragged = false,
    dropBefore = false,
    settled = false,
    showOwnerIndicator = true,
    showUnindexedBadge = true,
    onTaskClick,
    onDragStart,
    onDragEnd,
    onDragOver,
    onDrop,
  }: {
    task: TaskDto;
    thumbnail?: string | null;
    muted?: boolean;
    draggable?: boolean;
    dragged?: boolean;
    dropBefore?: boolean;
    settled?: boolean;
    showOwnerIndicator?: boolean;
    showUnindexedBadge?: boolean;
    onTaskClick: (task: TaskDto) => void;
    onDragStart: (event: DragEvent, task: TaskDto) => void;
    onDragEnd: () => void;
    onDragOver: (event: DragEvent) => void;
    onDrop: (event: DragEvent) => void;
  } = $props();

  const cardClass = $derived(
    `kanban-card group relative cursor-pointer rounded-[6px] border px-2.5 py-2 transition-all duration-[120ms] ${
      muted ? "done-card border-border/30 bg-card" : "border-border/60 bg-card"
    }`,
  );
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
  class={cardClass}
  class:opacity-30={dragged}
  class:dragging={dragged}
  class:drop-before={dropBefore}
  class:kanban-card-settled={settled}
  {draggable}
  ondragstart={(event) => onDragStart(event, task)}
  ondragend={onDragEnd}
  ondragover={onDragOver}
  ondrop={onDrop}
  onclick={() => onTaskClick(task)}
  role="button"
  tabindex="0"
  title={task.title}
>
  {#if task.id != null && thumbnail}
    <div class={`-mx-2.5 -mt-2 mb-1.5 ${muted ? "opacity-60" : ""}`}>
      <CardThumbnail taskId={task.id} filename={thumbnail} />
    </div>
  {/if}

  <div class="flex items-start gap-1.5">
    <span class={`min-w-0 flex-1 text-[13px] leading-snug ${muted ? "text-muted-foreground/60" : "text-foreground"}`}>
      {task.title}
    </span>
    {#if showUnindexedBadge && task.id == null}
      <span class="shrink-0 rounded-[4px] border border-border/60 px-1 py-0.5 font-mono text-[9px] text-muted-foreground">
        unindexed
      </span>
    {/if}
  </div>

  {#if task.tags.length > 0}
    <div class="mt-1.5 flex flex-wrap items-center gap-1">
      {#each task.tags.slice(0, 2) as tag}
        <span
          class={`inline-flex items-center gap-1 rounded-full px-1.5 py-px font-mono text-[10px] ${
            muted
              ? "border border-border/30 bg-border/10 text-muted-foreground/40"
              : "border border-border/40 bg-border/15 text-muted-foreground/70"
          }`}
        >
          <span
            class={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${muted ? "opacity-50" : ""}`}
            style="background-color: {tagColor(tag)}"
          ></span>
          {tag}
        </span>
      {/each}
      {#if task.tags.length > 2}
        <span class={`font-mono text-[10px] ${muted ? "text-muted-foreground/30" : "text-muted-foreground/40"}`}>
          +{task.tags.length - 2}
        </span>
      {/if}
    </div>
  {/if}

  {#if task.body?.trim() || task.subtask_total > 0 || task.attachments?.length > 0 || (showOwnerIndicator && task.owner === "user")}
    <div class="mt-1.5 flex items-center gap-1.5">
      {#if task.body?.trim()}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class={`shrink-0 ${muted ? "text-muted-foreground/25" : "text-muted-foreground/40"}`}
          aria-label="Has notes"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10 9 9 9 8 9"/>
        </svg>
      {/if}
      {#if showOwnerIndicator && task.owner === "user"}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 text-muted-foreground/40">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
      {/if}
      {#if task.attachments?.length > 0}
        <span
          class={`inline-flex items-center gap-0.5 font-mono text-[9px] ${muted ? "text-muted-foreground/25" : "text-muted-foreground/40"}`}
          title={!muted ? `${task.attachments.length} attachment${task.attachments.length > 1 ? "s" : ""}` : undefined}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
          </svg>
          {task.attachments.length}
        </span>
      {/if}
      {#if task.subtask_total > 0}
        <span class={`inline-flex items-center gap-0.5 font-mono text-[9px] ${muted ? "text-muted-foreground/25" : "text-muted-foreground/40"}`}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
          {task.subtask_done}/{task.subtask_total}
        </span>
      {/if}
    </div>
  {/if}
</div>
