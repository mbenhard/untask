import { tv, type VariantProps } from "tailwind-variants";

export const buttonVariants = tv({
  base: "inline-flex items-center justify-center whitespace-nowrap rounded-[4px] border font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  variants: {
    variant: {
      primary: "border-foreground bg-foreground text-background hover:bg-foreground/92",
      secondary: "border-border bg-card text-foreground hover:border-foreground/30 hover:bg-accent/80",
      ghost: "border-transparent bg-transparent text-muted-foreground hover:border-border hover:bg-accent/60 hover:text-foreground",
    },
    size: {
      sm: "h-8 gap-2 px-3 text-[11px]",
      md: "h-9 gap-2 px-3.5 text-[12px]",
    },
  },
  defaultVariants: {
    variant: "secondary",
    size: "md",
  },
});

export type ButtonVariants = VariantProps<typeof buttonVariants>;
