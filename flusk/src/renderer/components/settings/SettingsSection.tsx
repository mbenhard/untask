import type { ReactNode } from 'react';

export type SettingsSectionProps = {
  title: string;
  children: ReactNode;
};

export const SettingsSection = ({ title, children }: SettingsSectionProps) => (
  <div className="space-y-0">
    <h3 className="px-0 pb-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
      {title}
    </h3>
    <div className="divide-y divide-border/40">{children}</div>
  </div>
);
