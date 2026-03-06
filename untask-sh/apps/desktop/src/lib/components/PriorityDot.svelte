<script lang="ts">
  export type PriorityTone = "low" | "medium" | "high" | "neutral";

  let { tone = "neutral" }: { tone?: PriorityTone } = $props();

  const toneClass: Record<PriorityTone, string> = {
    low: "bg-priority-low",
    medium: "bg-priority-medium",
    high: "bg-priority-high",
    neutral: "bg-border",
  };
</script>

<span class={`inline-flex h-[5px] w-[5px] rounded-full ${toneClass[tone]}`} aria-hidden="true"></span>
