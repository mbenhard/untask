<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLButtonAttributes } from "svelte/elements";

  import { cn } from "$lib/utils";

  import { buttonVariants, type ButtonVariants } from "./button";

  type Props = HTMLButtonAttributes & {
    variant?: ButtonVariants["variant"];
    size?: ButtonVariants["size"];
    class?: string;
    children?: Snippet;
  };

  let {
    variant = "secondary",
    size = "md",
    class: className = "",
    children,
    ...rest
  }: Props = $props();
</script>

<button class={cn(buttonVariants({ variant, size }), className)} {...rest}>
  {@render children?.()}
</button>
