import type { ReactNode } from 'react';

export type SettingsRowProps = {
  label: string;
  hint?: string;
  loading?: boolean;
  children?: ReactNode;
};

export const SettingsRow = ({ label, hint, loading, children }: SettingsRowProps) => (
  <div className="flex items-start justify-between gap-4 px-0 py-2.5">
    <div className="min-w-0 flex-1 space-y-0.5">
      <span className="text-[13px] text-foreground">{label}</span>
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
    <div className="flex shrink-0 items-center">
      {loading ? (
        <span className="text-[11px] text-muted-foreground">Loading...</span>
      ) : (
        children
      )}
    </div>
  </div>
);
