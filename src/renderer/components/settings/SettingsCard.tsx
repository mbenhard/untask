import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

type SettingsCardProps = {
    children: ReactNode;
    className?: string;
};

export const SettingsCard = ({ children, className }: SettingsCardProps) => {
    return (
        <div
            className={cn(
                'overflow-hidden rounded-md border border-border/60',
                className,
            )}
        >
            <div className="divide-y divide-border/40">{children}</div>
        </div>
    );
};
