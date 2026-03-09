<script lang="ts">
  import { Tooltip } from "bits-ui";
  import type { Snippet } from "svelte";

  let {
    text,
    children,
  }: {
    text: string;
    children: Snippet<[{ props: Record<string, unknown> }]>;
  } = $props();
</script>

<Tooltip.Root>
  <Tooltip.Trigger>
    {#snippet child({ props })}
      {@render children({ props })}
    {/snippet}
  </Tooltip.Trigger>
  <Tooltip.Portal>
    <Tooltip.Content
      class="z-50 rounded-[4px] border border-border/60 bg-popover px-2 py-1 font-mono text-[10px] text-muted-foreground shadow-sm backdrop-blur"
      sideOffset={4}
    >
      {text}
    </Tooltip.Content>
  </Tooltip.Portal>
</Tooltip.Root>
