import type { ChangeEvent } from 'react';

import { cn } from '../../lib/utils';

export type SettingsSelectOption = {
  value: string;
  label: string;
};

export type SettingsSelectProps = {
  options: SettingsSelectOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  'aria-label'?: string;
  className?: string;
};

export const SettingsSelect = ({
  options,
  value,
  onChange,
  disabled,
  'aria-label': ariaLabel,
  className,
}: SettingsSelectProps) => {
  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onChange(event.target.value);
  };

  return (
    <select
      value={value}
      onChange={handleChange}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        'h-7 rounded-md border border-border/60 bg-transparent px-2 text-[11px]',
        className,
      )}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
};
