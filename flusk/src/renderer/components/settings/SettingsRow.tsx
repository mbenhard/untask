import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export type SettingsRowProps = {
  label: string;
  hint?: string | ReactNode;
  loading?: boolean;
  children?: ReactNode;
  className?: string;
};

export const SettingsRow = ({ label, hint, loading, children, className }: SettingsRowProps) => (
  <div className={cn("flex min-h-10 items-center justify-between gap-3 px-2 py-2", className)}>
    <div className="min-w-0 flex-1 space-y-0.5">
      <span className="text-[13px] text-foreground">{label}</span>
      {hint ? (
        <div className="text-[11px] text-muted-foreground leading-relaxed">
          {hint}
        </div>
      ) : null}
    </div>
    <div className="flex shrink-0 items-center">
      {loading ? (
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <div className="size-2 animate-pulse rounded-full bg-muted-foreground/30" />
          Loading...
        </span>
      ) : (
        children
      )}
    </div>
  </div>
);
