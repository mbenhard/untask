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
        "p-3 [--cell-size:2rem] [--cell-radius:calc(var(--cell-size)/2)]",
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
        months: "flex flex-col gap-4 sm:flex-row sm:gap-2",
        month: "grid grid-cols-[auto_1fr_auto] items-center gap-y-4",
        month_caption:
          "col-start-2 flex w-full items-center justify-center pt-1",
        caption_label: "text-sm font-medium",
        nav: "flex items-center gap-1",
        button_previous: cn(
          buttonVariants({ variant: "outline" }),
          "col-start-1 justify-self-start size-7 bg-transparent p-0 opacity-60 hover:opacity-100"
        ),
        button_next: cn(
          buttonVariants({ variant: "outline" }),
          "col-start-3 justify-self-end size-7 bg-transparent p-0 opacity-60 hover:opacity-100"
        ),
        month_grid: "col-span-3 w-full border-collapse",
        weekdays: "flex",
        weekday: "text-muted-foreground w-[var(--cell-size)] rounded-md text-center text-[0.8rem] font-normal",
        week: "mt-1 flex w-full",
        day: cn(
          "relative h-[var(--cell-size)] w-[var(--cell-size)] p-0 text-center text-sm focus-within:relative focus-within:z-20",
          "[&:first-child[data-selected=true]_button]:rounded-s-[var(--cell-radius)]",
          "[&:last-child[data-selected=true]_button]:rounded-e-[var(--cell-radius)]",
          "[&:nth-child(2)[data-selected=true]_button]:rounded-s-[var(--cell-radius)]",
          "[&:has([aria-selected])]:bg-accent",
          "[&:has([aria-selected].day-outside)]:bg-accent/50",
          "[&:has([aria-selected])]:rounded-[var(--cell-radius)]"
        ),
        range_start:
          "day-range-start rounded-s-[var(--cell-radius)] [&:has(>.day-outside)]:bg-accent/50",
        range_end:
          "day-range-end rounded-e-[var(--cell-radius)] [&:has(>.day-outside)]:bg-accent/50",
        selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        today: "bg-accent text-accent-foreground",
        outside:
          "day-outside text-muted-foreground aria-selected:text-muted-foreground",
        disabled: "text-muted-foreground opacity-50",
        range_middle:
          "aria-selected:bg-accent aria-selected:text-accent-foreground",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, ...chevronProps }) => {
          const Icon = orientation === "left" ? ChevronLeft : ChevronRight
          return <Icon className="size-4" {...chevronProps} />
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
        "h-[var(--cell-size)] w-[var(--cell-size)] p-0 font-normal aria-selected:opacity-100",
        "data-[selected-single=true]:rounded-[var(--cell-radius)]",
        "data-[range-start=true]:rounded-s-[var(--cell-radius)]",
        "data-[range-end=true]:rounded-e-[var(--cell-radius)]",
        className
      )}
      {...props}
    />
  )
}

export { Calendar }
