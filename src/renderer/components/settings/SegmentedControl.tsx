import { cn } from '../../lib/utils';

export type SegmentedOption<T extends string = string> = {
  value: T;
  label: string;
};

export type SegmentedControlProps<T extends string = string> = {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
};

export const SegmentedControl = <T extends string = string>({
  options,
  value,
  onChange,
  disabled,
}: SegmentedControlProps<T>) => (
  <div className="inline-flex items-center gap-0.5 rounded-lg bg-accent/50 p-0.5">
    {options.map((opt) => (
      <button
        key={opt.value}
        type="button"
        onClick={() => onChange(opt.value)}
        disabled={disabled}
        className={cn(
          'rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
          value === opt.value
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground/80',
        )}
      >
        {opt.label}
      </button>
    ))}
  </div>
);
