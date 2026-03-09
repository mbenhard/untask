<script lang="ts">
  import { Select } from "bits-ui";

  let {
    value = $bindable(),
    items,
    disabled = false,
    onValueChange,
  }: {
    value: string;
    items: { value: string; label: string }[];
    disabled?: boolean;
    onValueChange?: (value: string) => void;
  } = $props();

  const selectedLabel = $derived(
    items.find((item) => item.value === value)?.label ?? value
  );
</script>

<Select.Root type="single" bind:value {disabled} {items} onValueChange={onValueChange}>
  <Select.Trigger
    class="inline-flex h-6 cursor-pointer items-center gap-1 rounded-[4px] border border-border/60 pl-2 pr-1.5 font-mono text-[10px] leading-none text-muted-foreground transition-colors duration-[120ms] hover:border-border focus-visible:border-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
  >
    {selectedLabel}
    <svg width="8" height="5" viewBox="0 0 8 5" fill="none" class="shrink-0 opacity-60">
      <path d="M1 1l3 3 3-3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </Select.Trigger>
  <Select.Portal>
    <Select.Content
      class="z-50 rounded-[6px] border border-border/60 bg-popover shadow-lg backdrop-blur"
      sideOffset={4}
    >
      <Select.Viewport class="p-0.5">
        {#each items as item (item.value)}
          <Select.Item
            class="cursor-pointer rounded-[4px] px-2.5 py-1.5 font-mono text-[11px] outline-none transition-colors duration-75 data-[highlighted]:bg-accent/50"
            value={item.value}
            label={item.label}
          >
            {#snippet children({ selected })}
              <span class={selected ? "text-foreground" : "text-muted-foreground"}>
                {item.label}
              </span>
            {/snippet}
          </Select.Item>
        {/each}
      </Select.Viewport>
    </Select.Content>
  </Select.Portal>
</Select.Root>
