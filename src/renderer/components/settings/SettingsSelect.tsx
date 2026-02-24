import type { ChangeEvent } from 'react';

import { cn } from '../../lib/utils';

export type SettingsSelectOption = {
  value: string;
  label: string;
};

export type SettingsSelectGroup = {
  label: string;
  options: SettingsSelectOption[];
};

export type SettingsSelectProps = {
  options: (SettingsSelectOption | SettingsSelectGroup)[];
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
      {options.map((optOrGroup, i) => {
        if ('options' in optOrGroup) {
          return (
            <optgroup key={`group-${i}-${optOrGroup.label}`} label={optOrGroup.label}>
              {optOrGroup.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </optgroup>
          );
        }

        return (
          <option key={optOrGroup.value} value={optOrGroup.value}>
            {optOrGroup.label}
          </option>
        );
      })}
    </select>
  );
};
