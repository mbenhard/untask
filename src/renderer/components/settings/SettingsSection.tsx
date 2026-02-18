import type { ReactNode } from 'react';
import { SettingsCard } from './SettingsCard';

export type SettingsSectionProps = {
  title?: string;
  description?: string;
  children: ReactNode;
};

export const SettingsSection = ({ title, description, children }: SettingsSectionProps) => (
  <section className="space-y-1.5">
    {(title || description) && (
      <div className="px-0.5">
        {title && (
          <h3 className="text-[12px] font-medium text-foreground">
            {title}
          </h3>
        )}
        {description && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {description}
          </p>
        )}
      </div>
    )}
    <SettingsCard>{children}</SettingsCard>
  </section>
);
