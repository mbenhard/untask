import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import {
  DayPicker,
  getDefaultClassNames,
  type DayButtonProps,
  type Locale,
} from "react-day-picker"

import { cn } from "../../lib/utils"
import { Button, buttonVariants } from "./button"

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  navLayout = "around",
  buttonVariant = "ghost",
  locale,
  formatters,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: React.ComponentProps<typeof Button>["variant"]
}) {
  const defaultClassNames = getDefaultClassNames()

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        "p-2 [--cell-size:1.75rem]",
        className
      )}
      captionLayout={captionLayout}
      navLayout={navLayout}
      locale={locale}
      formatters={{
        formatMonthDropdown: (date) =>
          date.toLocaleString(locale?.code, { month: "short" }),
        ...formatters,
      }}
      classNames={{
        ...defaultClassNames,
        months: "flex w-full flex-col gap-2 sm:flex-row sm:gap-2",
        month: "grid w-full grid-cols-[auto_1fr_auto] items-center gap-y-1.5",
        month_caption:
          "col-start-2 flex w-full items-center justify-center",
        caption_label: "font-mono text-[11px] font-medium text-muted-foreground",
        nav: "flex items-center gap-0.5",
        button_previous: cn(
          buttonVariants({ variant: "ghost" }),
          "col-start-1 justify-self-start size-6 p-0 text-muted-foreground opacity-70 hover:opacity-100 hover:bg-accent/50"
        ),
        button_next: cn(
          buttonVariants({ variant: "ghost" }),
          "col-start-3 justify-self-end size-6 p-0 text-muted-foreground opacity-70 hover:opacity-100 hover:bg-accent/50"
        ),
        month_grid: "col-span-3 w-full border-collapse",
        weekdays: "flex w-full",
        weekday: "text-muted-foreground/60 flex-1 text-center font-mono text-[9px] font-medium uppercase",
        week: "mt-px flex w-full",
        day: cn(
          "relative flex-1 p-0 text-center focus-within:relative focus-within:z-20",
          "[&:has([aria-selected])]:bg-accent/60",
          "[&:has([aria-selected].day-outside)]:bg-accent/30",
          "[&:has([aria-selected])]:rounded-sm"
        ),
        range_start:
          "day-range-start rounded-s-sm [&:has(>.day-outside)]:bg-accent/30",
        range_end:
          "day-range-end rounded-e-sm [&:has(>.day-outside)]:bg-accent/30",
        selected:
          "bg-foreground text-background hover:bg-foreground hover:text-background focus:bg-foreground focus:text-background",
        today: "bg-accent/80 text-accent-foreground",
        outside:
          "day-outside text-muted-foreground/30 aria-selected:text-muted-foreground/50",
        disabled: "text-muted-foreground/30",
        range_middle:
          "aria-selected:bg-accent aria-selected:text-accent-foreground",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, ...chevronProps }) => {
          const Icon = orientation === "left" ? ChevronLeft : ChevronRight
          return <Icon className="size-3.5" {...chevronProps} />
        },
        DayButton: ({ ...dayButtonProps }) => (
          <CalendarDayButton
            locale={locale}
            buttonVariant={buttonVariant}
            {...dayButtonProps}
          />
        ),
        ...components,
      }}
      {...props}
    />
  )
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  locale,
  buttonVariant,
  ...props
}: DayButtonProps & {
  locale?: Partial<Locale>
  buttonVariant?: React.ComponentProps<typeof Button>["variant"]
}) {
  return (
    <Button
      type="button"
      variant={buttonVariant ?? "ghost"}
      size="icon"
      data-day={day.date.toLocaleDateString(locale?.code)}
      data-selected-single={
        modifiers.selected &&
          !modifiers.range_start &&
          !modifiers.range_middle &&
          !modifiers.range_end
          ? true
          : undefined
      }
      data-range-start={modifiers.range_start ? true : undefined}
      data-range-end={modifiers.range_end ? true : undefined}
      className={cn(
        "h-[var(--cell-size)] w-[var(--cell-size)] rounded-[3px] p-0 font-mono text-[11px] font-normal aria-selected:opacity-100",
        "hover:bg-accent/50",
        "data-[selected-single=true]:rounded-[3px]",
        "data-[range-start=true]:rounded-s-[3px]",
        "data-[range-end=true]:rounded-e-[3px]",
        className
      )}
      {...props}
    />
  )
}

export { Calendar }
